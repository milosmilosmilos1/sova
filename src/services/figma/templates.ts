import 'server-only'

import type { AppLocale } from '@/i18n/config'
import { translateServerText } from '@/i18n/server-text'
import { randomBytes } from 'node:crypto'

import sharp from 'sharp'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { FigmaNode } from '@/lib/figma/brand'
import {
  FIGMA_TEMPLATES_MAX,
  parseTemplateFrame,
  TEMPLATE_SIZES,
  templateFrameFor,
  type FigmaTemplate,
  type ParsedFrame,
  type TemplateFrame,
} from '@/lib/figma/template'
import type { StoredDesign } from '@/lib/schemas/design'
import { safeFetch } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { renderTemplateSlide } from '@/lib/visuals/design/template-render'
import type { Slide } from '@/lib/visuals/design/types'
import { getImages, getNodes } from '@/integrations/figma/client'
import { getBrand } from '@/services/brands'
import { brandLogo, resolveDesign, storedDesign } from '@/services/design/brand-design'
import { templateBackground } from '@/services/design/template-assets'
import { getFigmaAccessToken } from '@/services/figma/connection'
import { storeServerImage } from '@/services/visuals/store'
import type { Json } from '@/types/database'

/**
 * Figma šabloni brenda (D-162): okvir iz Figme sa grupom `#pozadina` i slojevima `#naslov`, `#tekst`,
 * `#logo`, `#foto`… postaje raspored po kom Sova crta objave brenda. Pozadina se jednom izveze kao
 * PNG (čuva se kao Sovin crtež, pa je galerija ne nudi kao fotografiju), a raspored ide u
 * `brands.design.templates`. Uključen šablon (`templateId`) važi za objave svog formata.
 */
export interface TemplateView {
  id: string
  name: string
  format: FigmaTemplate['format']
  frames: number
  createdAt: string
  active: boolean
}

async function saveDesign(brandId: string, design: StoredDesign): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ design: design as unknown as Json })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
}

const view = (t: FigmaTemplate, activeId: string | null | undefined): TemplateView => ({
  id: t.id,
  name: t.name,
  format: t.format,
  frames: new Set([t.frames.cover.nodeId, t.frames.point.nodeId, t.frames.cta.nodeId]).size,
  createdAt: t.createdAt,
  active: t.id === activeId,
})

export async function listTemplates(viewer: Viewer, brandId: string): Promise<TemplateView[]> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id)
  const stored = storedDesign(brand)
  return (stored.templates ?? []).map((t) => view(t, stored.templateId))
}

/** Šablon od jednog do tri okvira: naslovni, sadržaj i poziv na akciju (jedan okvir važi za sve). */
export async function saveFigmaTemplate(
  viewer: Viewer,
  input: { brandId: string; fileKey: string; name: string; nodeIds: string[] },
): Promise<TemplateView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = storedDesign(brand)
  const list = stored.templates ?? []
  if (list.length >= FIGMA_TEMPLATES_MAX)
    throw new ApiError(
      'VALIDATION',
      `Brend može da ima najviše ${FIGMA_TEMPLATES_MAX} šablona. Uklonite neki.`,
    )
  const token = await getFigmaAccessToken(brand.workspace_id, viewer.user.id)
  const nodes = await getNodes(token, input.fileKey, input.nodeIds)
  const parsed: ParsedFrame[] = []
  const widths: number[] = []
  for (const id of input.nodeIds) {
    const node = nodes[id] as FigmaNode | null | undefined
    if (!node) throw new ApiError('NOT_FOUND', 'Figma nije vratila izabrane okvire.')
    parsed.push(parseTemplateFrame(node))
    widths.push(node.absoluteBoundingBox?.width ?? TEMPLATE_SIZES.portrait.width)
  }
  const problems = parsed.flatMap((p) => p.problems)
  if (problems.length) throw new ApiError('VALIDATION', problems.slice(0, 3).join(' '))
  const format = parsed[0]!.format!
  if (parsed.some((p) => p.format !== format))
    throw new ApiError('VALIDATION', 'Okviri jednog šablona moraju biti istog formata (4:5, 1:1 ili 9:16).')

  // pozadina se izvozi u razmeri u kojoj je okvir širok 1080; okviri različite širine idu posebno
  const backgrounds = new Map<string, string>()
  const byScale = new Map<number, string[]>()
  parsed.forEach((p, i) => {
    const scale = Math.round((TEMPLATE_SIZES[format].width / widths[i]!) * 1000) / 1000
    byScale.set(scale, [...(byScale.get(scale) ?? []), p.background!.nodeId])
  })
  for (const [scale, ids] of byScale) {
    const urls = await getImages(token, input.fileKey, ids, Math.min(4, Math.max(0.01, scale)))
    for (const id of ids) {
      const url = urls[id]
      if (!url) throw new ApiError('PROVIDER_ERROR', 'Figma nije izvezla pozadinu šablona. Pokušajte ponovo.')
      const res = await safeFetch(url, {
        timeoutMs: 30_000,
        maxBytes: 30 * 1024 * 1024,
        headers: { accept: 'image/*' },
      })
      if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Pozadina šablona nije mogla da se preuzme iz Figme.')
      const png = await sharp(res.body).png({ compressionLevel: 9 }).toBuffer()
      const asset = await storeServerImage({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        bytes: png,
        mimeType: 'image/png',
        source: 'template',
        folder: 'figma-templates',
        tags: ['figma-template'],
        sourceData: { provider: 'figma', fileKey: input.fileKey, nodeId: id, templateBackground: true },
        uploadedBy: viewer.user.id,
      })
      backgrounds.set(id, asset.id)
    }
  }
  const frames: TemplateFrame[] = parsed.map((p) => ({
    nodeId: p.nodeId,
    name: p.name.slice(0, 300),
    fill: p.fill,
    background: {
      assetId: backgrounds.get(p.background!.nodeId)!,
      x: p.background!.x,
      y: p.background!.y,
      w: p.background!.w,
      h: p.background!.h,
    },
    layers: p.layers,
  }))
  const template: FigmaTemplate = {
    id: randomBytes(5).toString('hex'),
    name: input.name.trim().slice(0, 80) || 'Figma šablon',
    fileKey: input.fileKey,
    format,
    frames: {
      cover: frames[0]!,
      point: frames[1] ?? frames[0]!,
      cta: frames[2] ?? frames[1] ?? frames[0]!,
    },
    createdAt: new Date().toISOString(),
  }
  await saveDesign(brand.id, { ...stored, templates: [...list, template] })
  return view(template, stored.templateId)
}

/** Šablon po kom se crtaju objave brenda; `null` vraća stil teme. */
export async function setActiveTemplate(
  viewer: Viewer,
  brandId: string,
  templateId: string | null,
): Promise<TemplateView[]> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = storedDesign(brand)
  const list = stored.templates ?? []
  if (templateId && !list.some((t) => t.id === templateId))
    throw new ApiError('NOT_FOUND', 'Šablon ne postoji.')
  await saveDesign(brand.id, { ...stored, templateId })
  return list.map((t) => view(t, templateId))
}

export async function removeTemplate(
  viewer: Viewer,
  brandId: string,
  templateId: string,
): Promise<TemplateView[]> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = storedDesign(brand)
  const list = stored.templates ?? []
  if (!list.some((t) => t.id === templateId)) throw new ApiError('NOT_FOUND', 'Šablon ne postoji.')
  const next = list.filter((t) => t.id !== templateId)
  await saveDesign(brand.id, {
    ...stored,
    templates: next,
    templateId: stored.templateId === templateId ? null : (stored.templateId ?? null),
  })
  return next.map((t) => view(t, stored.templateId === templateId ? null : stored.templateId))
}

/** Siva fotografija za pregled okvira #foto (prava stiže iz izvora fotografija objave). */
let sample: Promise<string> | null = null
function samplePhoto(): Promise<string> {
  sample ??= sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9AA4B2"/><stop offset="1" stop-color="#5B6472"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="560" cy="250" r="90" fill="#C9D1DC"/><path d="M0 640 L260 380 L460 580 L600 460 L800 640 L800 800 L0 800 Z" fill="#46505E"/></svg>',
    ),
  )
    .jpeg({ quality: 80 })
    .toBuffer()
    .then((b) => `data:image/jpeg;base64,${b.toString('base64')}`)
  return sample
}

const SAMPLE: Record<'cover' | 'point' | 'cta', Slide> = {
  cover: {
    kind: 'cover',
    kicker: 'Saveti',
    title: 'Tri stvari koje treba da znate',
    body: 'Kratak uvod u temu objave.',
  },
  point: {
    kind: 'point',
    title: 'Jedna jasna poruka',
    body: 'Tekst slajda sa jednom idejom, u dve-tri rečenice, da se vidi kako staje.',
  },
  cta: { kind: 'cta', title: 'Pišite nam danas', body: 'Odgovaramo u roku od jednog dana.' },
}

/** Primer teksta na jeziku korisnika (rečnik poruka servera, D-130). */
function sampleIn(slide: Slide, locale: AppLocale): Slide {
  if (locale === 'sr-Latn') return slide
  const tr = (v: string | null | undefined) => (v ? translateServerText(v, locale) : v)
  return { ...slide, kicker: tr(slide.kicker), title: tr(slide.title)!, body: tr(slide.body) }
}

/** Pregled šablona sa primerom teksta i logoom brenda (PNG manje širine). */
export async function templatePreview(
  viewer: Viewer,
  brandId: string,
  templateId: string,
  kind: 'cover' | 'point' | 'cta',
): Promise<Buffer> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id)
  const template = (storedDesign(brand).templates ?? []).find((t) => t.id === templateId)
  if (!template) throw new ApiError('NOT_FOUND', 'Šablon ne postoji.')
  const design = await resolveDesign(brand)
  const frame = templateFrameFor(template, kind)
  const out = await renderTemplateSlide({
    frame,
    format: template.format,
    background: await templateBackground(frame.background.assetId),
    slide: sampleIn(SAMPLE[kind], viewer.profile.locale),
    index: kind === 'cover' ? 0 : kind === 'point' ? 1 : 2,
    total: 3,
    brandName: design.brandName,
    handle: design.handle,
    logo: await brandLogo(design.logoAssetId),
    photo: await samplePhoto(),
    outputWidth: 360,
    format_out: 'png',
  })
  return out.bytes
}
