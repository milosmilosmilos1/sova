import 'server-only'

import { createHash } from 'node:crypto'

import sharp from 'sharp'
import { z } from 'zod'

import { toContentLocale } from '@/config/locales'
import { formatFor, type PostFormat } from '@/config/post-formats'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { parseVoice } from '@/lib/brand/voice'
import { templateValuesSchema, type TemplateCreateInput, type TemplateValues } from '@/lib/schemas/templates'
import { buildTemplate, type TemplateBuild } from '@/lib/templates/build'
import { TEMPLATES, type TemplateFormat, type TemplateId } from '@/lib/templates/catalog'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getStyle, styleForPhotos, wantsPhoto, type StyleId } from '@/lib/visuals/design'
import { DESIGN_SIZES, type DesignFormat } from '@/lib/visuals/design/types'
import { preparePhoto, renderSlide } from '@/lib/visuals/design/render'
import type { SocialPlatform } from '@/config/platforms'
import { assertBrandReady } from '@/services/brand-readiness'
import { getBrand, type BrandRow } from '@/services/brands'
import { brandLogo, resolveDesign, type ResolvedDesign } from '@/services/design/brand-design'
import { themeOf, type PostDesignContext } from '@/services/design/post-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { downloadAsset, getAsset } from '@/services/media'
import { createPost } from '@/services/posts/posts'
import { listSocialAccounts } from '@/services/social/accounts'
import { storeServerImage } from '@/services/visuals/store'
import type { Json } from '@/types/database'

/**
 * Šabloni koje biznis popunjava sam (D-175): pregled slajdova dok se kuca i nacrt sa slajdovima u
 * stilu brenda i opisom od upisanih podataka. Bez AI-ja i bez tokena; fotografije su samo
 * korisnikove, iz biblioteke brenda (nikad Unsplash ni Pexels: tuđa osoba ili tuđi rad bi se
 * predstavili kao brendovi).
 */
interface Prepared {
  brand: BrandRow
  design: ResolvedDesign
  build: TemplateBuild
  styleId: StyleId
  format: DesignFormat
  locale: ReturnType<typeof toContentLocale>
}

function fieldsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'values'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}

/** ID-jevi fotografija iz upisanih vrednosti (jedna, pre i posle, niz). */
function photoIdsOf(templateId: TemplateId, values: TemplateValues): string[] {
  const ids: string[] = []
  for (const f of TEMPLATES[templateId].fields) {
    const v = values[f.key]
    if (f.kind === 'photo' && typeof v === 'string') ids.push(v)
    if (f.kind === 'photos' && Array.isArray(v))
      ids.push(...v.filter((x): x is string => typeof x === 'string'))
  }
  return ids
}

async function prepare(
  viewer: Viewer,
  brandId: string,
  input: { templateId: TemplateId; format: TemplateFormat; values: Record<string, unknown> },
): Promise<Prepared> {
  const brand = await getBrand(viewer, brandId)
  // kompletan brend (D-174): šablon se crta u stilu, bojama i sa logom brenda
  await assertBrandReady(brand.id)
  if (!TEMPLATES[input.templateId].formats.includes(input.format))
    throw new ApiError('VALIDATION', 'Ovaj šablon nema taj oblik objave.')
  const parsed = templateValuesSchema(input.templateId).safeParse(input.values)
  if (!parsed.success) throw new ApiError('VALIDATION', undefined, { fields: fieldsOf(parsed.error) })
  const values = parsed.data as TemplateValues
  for (const id of new Set(photoIdsOf(input.templateId, values))) {
    const asset = await getAsset(viewer, id).catch(() => null)
    if (
      !asset ||
      asset.kind !== 'image' ||
      asset.workspace_id !== brand.workspace_id ||
      (asset.brand_id !== null && asset.brand_id !== brand.id)
    )
      throw new ApiError('VALIDATION', 'Fotografija mora biti iz galerije ovog brenda.')
  }
  const design = await resolveDesign(brand)
  const locale = toContentLocale(brand.content_locale)
  const build = buildTemplate(input.templateId, values, {
    format: input.format,
    locale,
    cta: parseVoice(brand.voice)?.cta ?? '',
  })
  const withPhotos = build.photos.length > 0 || Boolean(build.composite)
  // tipografski stil sa fotografijom prelazi na „Poster” (kao u Studiju, D-116); pre i posle i iza
  // kulisa traže fotografiju na svakom slajdu
  const everySlide = input.templateId === 'before_after' || input.templateId === 'behind_scenes'
  const styleId: StyleId = !withPhotos
    ? design.styleId
    : everySlide && !design.template && getStyle(design.styleId).photo !== 'all'
      ? 'poster'
      : styleForPhotos(design.styleId, !design.template)
  const format: DesignFormat = input.format === 'story' ? 'story' : design.size
  return { brand, design, build, styleId, format, locale }
}

/** Pre i posle na jednoj slici: dve polovine u obliku slajda, levo pre, desno posle, sa belom crtom. */
async function sideBySide(
  viewer: Viewer,
  before: string,
  after: string,
  format: DesignFormat,
): Promise<Buffer> {
  const { width, height } = DESIGN_SIZES[format]
  const half = Math.round(width / 2)
  const gap = 8
  const [a, b] = await Promise.all(
    [before, after].map(async (id) =>
      sharp(await downloadAsset(await getAsset(viewer, id)))
        .rotate()
        .resize({ width: half - gap / 2, height, fit: 'cover', position: sharp.strategy.attention })
        .toBuffer(),
    ),
  )
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite([
      { input: a!, left: 0, top: 0 },
      { input: b!, left: half + gap / 2, top: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer()
}

const PREVIEW_WIDTH = 432
const previewCache = new Map<string, string>()
const PREVIEW_CACHE_MAX = 200

export interface TemplatePreview {
  slides: string[]
  caption: string
  title: string
  styleId: string
}

/** Pregled slajdova (JPEG, uži) i predlog opisa; ništa se ne čuva. */
export async function previewTemplate(
  viewer: Viewer,
  brandId: string,
  input: { templateId: TemplateId; format: TemplateFormat; values: Record<string, unknown> },
): Promise<TemplatePreview> {
  const { brand, design, build, styleId, format } = await prepare(viewer, brandId, input)
  const style = getStyle(styleId)
  const logo = await brandLogo(design.logoAssetId)
  // fotografije za stil: spoj pre i posle ili korisnikove, redom na slajdove koji ih crtaju
  const sources: Buffer[] = build.composite
    ? [await sideBySide(viewer, build.composite.before, build.composite.after, format)]
    : await Promise.all(build.photos.map(async (id) => downloadAsset(await getAsset(viewer, id))))
  const prepared = await Promise.all(sources.map((bytes) => preparePhoto(bytes, style, design.colors)))
  let next = 0
  const slides: string[] = []
  for (const [index, slide] of build.slides.entries()) {
    const photo = wantsPhoto(style, slide.kind, index) && next < prepared.length ? prepared[next++]! : null
    const key = createHash('sha1')
      .update(
        JSON.stringify([
          brand.id,
          styleId,
          format,
          design.colors,
          design.fonts,
          design.logoAssetId,
          slide,
          index,
          build.slides.length,
          photo ? createHash('sha1').update(photo).digest('hex') : null,
        ]),
      )
      .digest('hex')
    const hit = previewCache.get(key)
    if (hit) {
      slides.push(hit)
      continue
    }
    const result = await renderSlide({
      styleId,
      slide,
      format,
      colors: design.colors,
      brandFonts: design.fonts,
      lockFonts: design.fontsLocked,
      brandName: brand.name,
      handle: design.handle,
      logo,
      photo,
      index,
      total: build.slides.length,
      outputWidth: PREVIEW_WIDTH,
      format_out: 'jpeg',
    })
    const src = `data:${result.mimeType};base64,${result.bytes.toString('base64')}`
    if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value!)
    previewCache.set(key, src)
    slides.push(src)
  }
  return { slides, caption: build.caption, title: build.title, styleId }
}

export interface TemplatePostResult {
  postId: string
  targets: number
  notes: string[]
}

/**
 * Nacrt iz šablona: slajdovi u stilu brenda kao mediji, opis (korisnikov ili predlog), izabrane
 * mreže. Nacrt se zakazuje kao svaki drugi, u editoru objave.
 */
export async function createTemplatePost(
  viewer: Viewer,
  brandId: string,
  input: TemplateCreateInput,
): Promise<TemplatePostResult> {
  const prepared = await prepare(viewer, brandId, input)
  const { brand, design, build, styleId, format, locale } = prepared
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')

  let photos = build.photos
  if (build.composite) {
    const bytes = await sideBySide(viewer, build.composite.before, build.composite.after, format)
    const stored = await storeServerImage({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      bytes,
      mimeType: 'image/jpeg',
      source: 'upload',
      folder: 'design',
      altText: build.title,
      sourceData: { composite: [build.composite.before, build.composite.after] } as Json,
      tags: ['before-after'],
      uploadedBy: viewer.user.id,
    })
    photos = [stored.id]
  }
  const rendered = await renderDesignSlides({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    design,
    styleId,
    format,
    slides: build.slides,
    photoSource: 'none',
    query: '',
    uploadedBy: viewer.user.id,
    photoAssetIds: photos.length ? photos : undefined,
    cyclePhotos: false,
    topUpPhotos: false,
    origin: { template: input.templateId },
    variant: 0,
  })
  const postFormat: PostFormat =
    input.format === 'story' ? 'story' : rendered.assetIds.length > 1 ? 'carousel' : 'image'
  const caption = (input.caption ?? build.caption).trim() || build.caption

  const { accounts } = await listSocialAccounts(viewer, brand.id)
  const active = accounts.filter((a) => a.status === 'active')
  const chosen = input.accountIds.length ? active.filter((a) => input.accountIds.includes(a.id)) : active
  const notes = [...rendered.notes]
  if (!chosen.length) notes.push('Nema povezanih naloga: nacrt je bez mreža, dodajte ih u objavi.')
  const targets = chosen.map((a) => {
    const platform = a.platform as SocialPlatform
    return {
      socialAccountId: a.id,
      text: caption,
      ...(formatFor(postFormat, platform) === 'story' ? { options: { format: 'story' } } : {}),
    }
  })
  const post = await createPost(viewer, {
    brandId: brand.id,
    title: build.title,
    masterText: caption,
    language: locale,
    targets,
    media: rendered.assetIds.map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder })),
    source: 'manual',
  })
  const platforms = [...new Set(chosen.map((a) => a.platform as SocialPlatform))]
  const designContext: PostDesignContext = {
    topic: build.title,
    cta: null,
    format: input.format === 'story' ? 'story' : postFormat === 'carousel' ? 'carousel' : 'single',
    styleId,
    slides: build.slides.length,
    photoSource: 'none',
    size: design.size,
    ...themeOf(design),
    variant: 0,
    locale,
    platforms: platforms.length ? platforms : ['instagram'],
    ...(photos.length ? { ownPhotos: true } : {}),
    fillTemplate: input.templateId,
    copy: { slides: build.slides, photoAssetIds: rendered.photoIds },
  }
  await createSupabaseAdminClient()
    .from('posts')
    .update({ design: designContext as unknown as Json })
    .eq('id', post.id)
  return { postId: post.id, targets: targets.length, notes }
}
