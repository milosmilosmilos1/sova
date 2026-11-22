import 'server-only'

import { templateFits } from '@/lib/figma/template'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueHarmonize } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { styleForPhotos } from '@/lib/visuals/design'
import { LOGO_VERSION } from '@/lib/visuals/design/types'
import { VIDEO_LAYOUT, videoStyleFor } from '@/lib/visuals/design/video'
import type { StepRunner } from '@/services/autopilot/runner'
import { getBrand, type BrandRow } from '@/services/brands'
import { snapshotVersion } from '@/services/posts/posts'
import type { Json } from '@/types/database'

import { resolveDesign, type ResolvedDesign } from './brand-design'
import { photoQueryOf, resolvePhotoQuery } from './photo-query'
import { parsePostDesign, themeOf, type PostDesignContext } from './post-design'
import { designPhotoCount, renderDesignInSteps, type DesignRenderInput } from './render-post'
import { buildThemeVideoInSteps, type ThemeVideo } from './video-post'

/**
 * Jedna tema za sve objave (D-125). Nacrti koji čekaju (nacrt, na odobravanju, odbijen) a nisu u temi
 * brenda crtaju se ponovo u temi: isti tekst i iste fotografije, novi stil, boje i font, bez tokena.
 * Objava pamti stil, boje i font u kojima je nacrtana (`posts.design`), pa se tačno zna koja nije u
 * temi. Zakazane i objavljene objave se ne diraju, a ni nacrt koji je neko u međuvremenu izmenio.
 */
const PENDING = ['draft', 'in_review', 'rejected'] as const

export interface HarmonizeView {
  /** nacrti koji čekaju, a nisu u temi brenda */
  offTheme: number
}

const upper = (c: Record<string, string> | undefined) =>
  c
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(c)
            .map(([k, v]) => [k, v.toUpperCase()])
            .sort(),
        ),
      )
    : ''

/**
 * Da li je objava nacrtana u temi: isti stil, boje, font i logo. Objava bez zapamćenih boja nije.
 * Starija objava bez zapamćenog logoa je van teme kad je trenutni logo brenda postavljen posle nje
 * (`drawn.logoSince`): nacrtana je sa drugim logoom ili bez njega (tuđi logo sa sajta, 1.11.2026).
 */
export function inTheme(
  design: PostDesignContext,
  theme: ResolvedDesign,
  drawn?: { createdAt: string; logoSince: string | null },
): boolean {
  const style =
    design.format === 'video'
      ? videoStyleFor(theme.styleId)
      : styleForPhotos(theme.styleId, Boolean(design.ownPhotos))
  const logo =
    (design.logoAssetId !== undefined
      ? design.logoAssetId === theme.logoAssetId
      : !(drawn?.logoSince && Date.parse(drawn.logoSince) > Date.parse(drawn.createdAt))) &&
    // logo nacrtan starijim načinom (beli okvir, ista boja na svakoj podlozi) crta se ponovo (D-134)
    (!theme.logoAssetId || design.logoVersion === LOGO_VERSION)
  // Figma šablon (D-162) važi za objave svog formata; video ga nema
  const format = design.format === 'story' ? 'story' : design.size
  const fits = design.format !== 'video' && templateFits(theme.template, format)
  // šablon drugog formata ne važi za objavu, pa se zapamćen šablon tada ne poredi
  const template = fits ? theme.template!.id : null
  const drawnTemplate = fits ? (design.templateId ?? null) : null
  return (
    design.styleId === style &&
    drawnTemplate === template &&
    // video starijeg rasporeda (snimak u fotografiji teme, tekst preko pola kadra) crta se ponovo (D-135)
    (design.format !== 'video' || design.video?.layout === VIDEO_LAYOUT) &&
    upper(design.colors) === upper(theme.colors as unknown as Record<string, string>) &&
    design.fonts?.headings === theme.fonts.headings &&
    design.fonts?.body === theme.fonts.body &&
    logo
  )
}

/** Kad je postavljen trenutni logo brenda (slika u biblioteci); bez logoa `null`. */
async function logoSince(logoAssetId: string | null): Promise<string | null> {
  if (!logoAssetId) return null
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('created_at')
    .eq('id', logoAssetId)
    .maybeSingle()
  return data?.created_at ?? null
}

/** Nacrti koji čekaju, imaju tekst slajdova (pa mogu da se nacrtaju ponovo) i nisu u temi. */
export async function offThemeDrafts(brand: BrandRow): Promise<string[]> {
  const theme = await resolveDesign(brand)
  const since = await logoSince(theme.logoAssetId)
  const { data } = await createSupabaseAdminClient()
    .from('posts')
    .select('id, design, created_at')
    .eq('brand_id', brand.id)
    .is('deleted_at', null)
    .in('status', [...PENDING])
    .not('design', 'is', null)
    .order('created_at')
    .limit(500)
  return (data ?? [])
    .filter((p) => {
      const design = parsePostDesign(p.design)
      return (
        Boolean(design?.copy?.slides.length) &&
        !inTheme(design!, theme, { createdAt: p.created_at, logoSince: since })
      )
    })
    .map((p) => p.id)
}

/** Isto za pozadinski posao, po ID-ju brenda. */
export async function offThemeDraftIds(brandId: string): Promise<string[]> {
  const { data: brand } = await createSupabaseAdminClient()
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .maybeSingle()
  return brand ? offThemeDrafts(brand) : []
}

export async function getHarmonizeView(viewer: Viewer, brandId: string): Promise<HarmonizeView> {
  const brand = await getBrand(viewer, brandId)
  return { offTheme: (await offThemeDrafts(brand)).length }
}

/** „Uskladi nacrte sa temom”: pozadinski posao, po jedna objava u svojim koracima. */
export async function requestHarmonize(viewer: Viewer, brandId: string): Promise<HarmonizeView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const offTheme = (await offThemeDrafts(brand)).length
  if (offTheme) await enqueueHarmonize(brand.id)
  return { offTheme }
}

interface HarmonizeWork {
  version: number
  design: PostDesignContext
  render: DesignRenderInput
  /** koliko fotografija nacrt ima pre ponovnog crtanja */
  photos: number
}

/**
 * `theme`: nacrt van teme se crta u temi sa istim fotografijama. `photos` (D-170): nacrt se crta
 * ponovo i kad je u temi, a fotografije se biraju iznova; video i fotografije korisnika se ne diraju.
 */
type RedrawMode = 'theme' | 'photos'

async function prepare(postId: string, mode: RedrawMode = 'theme'): Promise<HarmonizeWork | null> {
  const admin = createSupabaseAdminClient()
  const { data: post } = await admin.from('posts').select('*').eq('id', postId).maybeSingle()
  if (!post || post.deleted_at || !(PENDING as readonly string[]).includes(post.status)) return null
  const design = parsePostDesign(post.design)
  if (!design?.copy?.slides.length) return null
  const { data: brand } = await admin.from('brands').select('*').eq('id', post.brand_id).single()
  if (!brand) return null
  const theme = await resolveDesign(brand)
  const fresh = mode === 'photos'
  if (fresh) {
    if (design.format === 'video' || design.ownPhotos || theme.photoSource === 'none') return null
  } else if (
    inTheme(design, theme, { createdAt: post.created_at, logoSince: await logoSince(theme.logoAssetId) })
  )
    return null
  // nove fotografije se traže engleskim upitom, ne temom na srpskom (D-167); objava koja ga nema
  // dobija ga od modela jednom, samo kad joj fotografije mogu zatrebati, i čuva ga
  const mayTopUp =
    theme.photoSource !== 'none' &&
    !design.ownPhotos &&
    (fresh || design.copy.photoAssetIds.length < design.copy.slides.length)
  const query = mayTopUp ? await resolvePhotoQuery(design) : photoQueryOf(design)
  const learned = mayTopUp && !design.photoQuery && query !== design.topic.slice(0, 100)
  return {
    version: post.version,
    photos: design.copy.photoAssetIds.length,
    design: learned ? { ...design, photoQuery: query } : design,
    render: {
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      design: theme,
      styleId: styleForPhotos(theme.styleId, Boolean(design.ownPhotos)),
      format: design.format === 'story' ? 'story' : design.size,
      slides: design.copy.slides,
      photoSource: theme.photoSource,
      query,
      uploadedBy: null,
      topic: [design.topic, ...design.copy.slides.map((s) => s.title)].join(' '),
      photoAssetIds: !fresh && design.copy.photoAssetIds.length ? design.copy.photoAssetIds : undefined,
      // fotografije koje je dao korisnik idu ukrug kao do sada; izabrane automatski se dopunjuju
      cyclePhotos: Boolean(design.ownPhotos),
      topUpPhotos: !design.ownPhotos,
      variant: design.variant,
      origin: { postId, harmonized: mode },
    },
  }
}

/** Novi slajdovi umesto starih, uz novu verziju objave; izmenjena objava u međuvremenu se preskače. */
/**
 * Video u temi (D-128): novi slojevi teksta i slika u temi, isti snimci; gotov MP4 se skida sa objave,
 * pa ga pregledač u Odobravanju pravi ponovo u novoj temi.
 */
async function saveVideo(
  postId: string,
  work: HarmonizeWork,
  video: ThemeVideo,
): Promise<'done' | 'skipped'> {
  const admin = createSupabaseAdminClient()
  const fresh = [...video.overlayAssetIds, ...(video.posterAssetId ? [video.posterAssetId] : [])]
  const theme = work.render.design
  const next: PostDesignContext = {
    ...work.design,
    styleId: video.styleId,
    photoSource: theme.photoSource,
    ...themeOf(theme),
    video: {
      ...work.design.video!,
      overlayAssetIds: video.overlayAssetIds,
      seconds: video.seconds,
      posterAssetId: video.posterAssetId,
      renderedAssetId: null,
      layout: VIDEO_LAYOUT,
    },
  }
  const { data: updated } = await admin
    .from('posts')
    .update({ design: next as unknown as Json, version: work.version + 1 })
    .eq('id', postId)
    .eq('version', work.version)
    .in('status', [...PENDING])
    .select('id')
  if (!updated?.length) {
    await admin.from('media_assets').update({ deleted_at: new Date().toISOString() }).in('id', fresh)
    return 'skipped'
  }
  await admin.from('post_media').delete().eq('post_id', postId)
  await snapshotVersion(postId, work.version + 1, 'Usklađeno sa temom brenda', null)
  return 'done'
}

async function save(
  postId: string,
  work: HarmonizeWork,
  rendered: { assetIds: string[]; photoIds: string[] },
  summary = 'Usklađeno sa temom brenda',
): Promise<'done' | 'skipped'> {
  const admin = createSupabaseAdminClient()
  const { data: post } = await admin.from('posts').select('version, status').eq('id', postId).maybeSingle()
  if (!post || post.version !== work.version || !(PENDING as readonly string[]).includes(post.status)) {
    await admin
      .from('media_assets')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', rendered.assetIds)
    return 'skipped'
  }
  const theme = work.render.design
  const next: PostDesignContext = {
    ...work.design,
    styleId: work.render.styleId,
    photoSource: theme.photoSource,
    ...themeOf(theme),
    copy: { slides: work.design.copy!.slides, photoAssetIds: rendered.photoIds },
  }
  const { data: updated } = await admin
    .from('posts')
    .update({ design: next as unknown as Json, version: work.version + 1 })
    .eq('id', postId)
    .eq('version', work.version)
    .select('id')
  if (!updated?.length) {
    await admin
      .from('media_assets')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', rendered.assetIds)
    return 'skipped'
  }
  await admin.from('post_media').delete().eq('post_id', postId)
  const { error } = await admin.from('post_media').insert(
    rendered.assetIds.map((media_asset_id, sort_order) => ({
      post_id: postId,
      media_asset_id,
      sort_order,
    })),
  )
  if (error) throw new Error(error.message)
  await snapshotVersion(postId, work.version + 1, summary, null)
  return 'done'
}

/**
 * Jedna objava u temi: priprema, fotografije pa slajdovi po tri (D-122) i čuvanje, svaki deo u svom
 * koraku pozadinskog posla. `step` bez Inngest-a (testovi) izvrši sve redom.
 */
export async function harmonizePost(
  postId: string,
  step: StepRunner = (_name, fn) => fn(),
): Promise<'done' | 'skipped'> {
  const work = await step('prepare', () => prepare(postId))
  if (!work) return 'skipped'
  if (work.design.format === 'video' && work.design.video) {
    const video = await buildThemeVideoInSteps(step, {
      workspaceId: work.render.workspaceId,
      brandId: work.render.brandId,
      design: work.render.design,
      scenes: work.render.slides,
      query: work.render.query,
      uploadedBy: null,
      clipAssetIds: work.design.video.clipAssetIds,
      photoAssetIds: work.design.copy?.photoAssetIds ?? [],
      origin: { postId, harmonized: 'theme' },
    })
    const result = await step('save', () => saveVideo(postId, work, video))
    if (result === 'skipped') logger.info('harmonize_post_skipped', { postId })
    return result
  }
  const rendered = await renderDesignInSteps(step, work.render)
  const result = await step('save', () => save(postId, work, rendered))
  if (result === 'skipped') logger.info('harmonize_post_skipped', { postId })
  return result
}

/** Oznaka verzije nacrta koji je dobio nove fotografije (D-170). */
export const PHOTO_REFRESH_SUMMARY = 'Nove fotografije po obliku okvira'

/** `fewer`: nov izbor ima manje fotografija od starog, pa nacrt ostaje kakav je bio. */
export type PhotoRefresh = 'done' | 'skipped' | 'fewer'

/**
 * Nove fotografije za nacrt koji čeka (D-170), za nacrte napravljene pre provere predmeta i oblika:
 * isti tekst, a fotografije se biraju iznova po obliku okvira na slajdu, u trenutnoj temi brenda.
 * Nacrt dobija nove slajdove samo kad nov izbor ima bar onoliko fotografija koliko stari (koliko stil
 * traži); inače ostaje kakav je, a nacrtani slajdovi pokušaja se brišu. Video i nacrti sa
 * fotografijama koje je dao korisnik se ne diraju.
 */
export async function refreshPostPhotos(
  postId: string,
  step: StepRunner = (_name, fn) => fn(),
): Promise<PhotoRefresh> {
  const work = await step('prepare', () => prepare(postId, 'photos'))
  if (!work) return 'skipped'
  const count = designPhotoCount(work.render)
  if (count === 0) return 'skipped'
  const rendered = await renderDesignInSteps(step, work.render)
  if (rendered.photoIds.length < Math.max(1, Math.min(work.photos, count))) {
    await step('discard', async () => {
      await createSupabaseAdminClient()
        .from('media_assets')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', rendered.assetIds)
    })
    logger.info('photo_refresh_fewer', { postId, before: work.photos, after: rendered.photoIds.length })
    return 'fewer'
  }
  const result = await step('save', () => save(postId, work, rendered, PHOTO_REFRESH_SUMMARY))
  if (result === 'skipped') logger.info('photo_refresh_skipped', { postId })
  return result
}

/** Koraci pozadinskog posla: korak sa imenom i pauza (u testovima odmah). */
export interface PhotoRefreshSteps {
  run: StepRunner
  sleep: (name: string, ms: number) => Promise<void>
}

/**
 * Pauza između nacrta i čekanje kad izvori potroše limit sata: Unsplash demo prima 50 zahteva na
 * sat, Pexels 200, a dele ih svi brendovi platforme.
 */
export const PHOTO_REFRESH_PAUSE_MS = 20_000
export const PHOTO_REFRESH_LIMIT_WAIT_MS = 60 * 60_000
const FEWER_IN_ROW = 3

export type PhotoRefreshCounts = Record<PhotoRefresh | 'failed', number> & { total: number }

/**
 * Nove fotografije za sve nacrte brenda koji ih mogu dobiti (D-170), jedan po jedan, sa pauzom. Kad
 * tri nacrta zaredom ne dobiju dovoljno fotografija, izvori su potrošili limit sata: posao čeka sat
 * pa nastavlja, a preskočeni nacrti ostaju za sledeće pokretanje. Nacrt koji padne ne zaustavlja ostale.
 */
export async function refreshBrandPhotos(
  brandId: string,
  steps: PhotoRefreshSteps,
): Promise<PhotoRefreshCounts> {
  const ids = await steps.run('list', () => photoRefreshDraftIds(brandId))
  const counts: PhotoRefreshCounts = { total: ids.length, done: 0, skipped: 0, fewer: 0, failed: 0 }
  let fewerInRow = 0
  for (const [i, id] of ids.entries()) {
    const run = ((name, fn) => steps.run(`post-${id}-${name}`, fn)) as StepRunner
    let result: PhotoRefresh | 'failed'
    try {
      result = await refreshPostPhotos(id, run)
    } catch (error) {
      result = 'failed'
      logger.warn('photo_refresh_failed', { postId: id, error })
    }
    counts[result]++
    fewerInRow = result === 'fewer' ? fewerInRow + 1 : 0
    if (i === ids.length - 1) break
    if (fewerInRow >= FEWER_IN_ROW) {
      await steps.sleep(`limit-${id}`, PHOTO_REFRESH_LIMIT_WAIT_MS)
      fewerInRow = 0
    } else await steps.sleep(`pause-${id}`, PHOTO_REFRESH_PAUSE_MS)
  }
  logger.info('photo_refresh_brand', { brandId, ...counts })
  return counts
}

/**
 * Nacrti brenda koji mogu da dobiju nove fotografije (D-170): čekaju, imaju tekst slajdova, nisu
 * video, fotografije nije dao korisnik, a bar jedna fotografija je izabrana pre provere oblika (nema
 * zapamćen okvir predmeta ni oznaku izbora po opisu, D-180) ili ih nema nijedne.
 */
export async function photoRefreshDraftIds(brandId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).maybeSingle()
  if (!brand || (await resolveDesign(brand)).photoSource === 'none') return []
  const { data } = await admin
    .from('posts')
    .select('id, design')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .in('status', [...PENDING])
    .not('design', 'is', null)
    .order('created_at')
    .limit(500)
  const drafts = (data ?? [])
    .map((p) => ({ id: p.id, design: parsePostDesign(p.design) }))
    .filter(
      (p): p is { id: string; design: PostDesignContext } =>
        Boolean(p.design?.copy?.slides.length) && p.design!.format !== 'video' && !p.design!.ownPhotos,
    )
  const ids = [...new Set(drafts.flatMap((p) => p.design.copy!.photoAssetIds))]
  const shaped = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data: rows } = await admin
      .from('media_assets')
      .select('id, source_data')
      .in('id', ids.slice(i, i + 100))
    for (const row of rows ?? []) {
      const data = row.source_data as { subject?: unknown; pick?: unknown } | null
      if (data && typeof data === 'object' && (data.subject || data.pick === 'text')) shaped.add(row.id)
    }
  }
  return drafts
    .filter((p) => {
      const photos = p.design.copy!.photoAssetIds
      return !photos.length || photos.some((id) => !shaped.has(id))
    })
    .map((p) => p.id)
}
