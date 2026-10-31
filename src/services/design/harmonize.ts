import 'server-only'

import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueHarmonize } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { styleForPhotos } from '@/lib/visuals/design'
import { videoStyleFor } from '@/lib/visuals/design/video'
import type { StepRunner } from '@/services/autopilot/runner'
import { getBrand, type BrandRow } from '@/services/brands'
import { snapshotVersion } from '@/services/posts/posts'
import type { Json } from '@/types/database'

import { resolveDesign, type ResolvedDesign } from './brand-design'
import { parsePostDesign, themeOf, type PostDesignContext } from './post-design'
import { renderDesignInSteps, type DesignRenderInput } from './render-post'
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

/** Da li je objava nacrtana u temi: isti stil, boje i font. Objava bez zapamćenih boja nije. */
export function inTheme(design: PostDesignContext, theme: ResolvedDesign): boolean {
  const style =
    design.format === 'video'
      ? videoStyleFor(theme.styleId)
      : styleForPhotos(theme.styleId, Boolean(design.ownPhotos))
  return (
    design.styleId === style &&
    upper(design.colors) === upper(theme.colors as unknown as Record<string, string>) &&
    design.fonts?.headings === theme.fonts.headings &&
    design.fonts?.body === theme.fonts.body
  )
}

/** Nacrti koji čekaju, imaju tekst slajdova (pa mogu da se nacrtaju ponovo) i nisu u temi. */
export async function offThemeDrafts(brand: BrandRow): Promise<string[]> {
  const theme = await resolveDesign(brand)
  const { data } = await createSupabaseAdminClient()
    .from('posts')
    .select('id, design')
    .eq('brand_id', brand.id)
    .is('deleted_at', null)
    .in('status', [...PENDING])
    .not('design', 'is', null)
    .order('created_at')
    .limit(500)
  return (data ?? [])
    .filter((p) => {
      const design = parsePostDesign(p.design)
      return Boolean(design?.copy?.slides.length) && !inTheme(design!, theme)
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
}

async function prepare(postId: string): Promise<HarmonizeWork | null> {
  const admin = createSupabaseAdminClient()
  const { data: post } = await admin.from('posts').select('*').eq('id', postId).maybeSingle()
  if (!post || post.deleted_at || !(PENDING as readonly string[]).includes(post.status)) return null
  const design = parsePostDesign(post.design)
  if (!design?.copy?.slides.length) return null
  const { data: brand } = await admin.from('brands').select('*').eq('id', post.brand_id).single()
  if (!brand) return null
  const theme = await resolveDesign(brand)
  if (inTheme(design, theme)) return null
  return {
    version: post.version,
    design,
    render: {
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      design: theme,
      styleId: styleForPhotos(theme.styleId, Boolean(design.ownPhotos)),
      format: design.format === 'story' ? 'story' : design.size,
      slides: design.copy.slides,
      photoSource: theme.photoSource,
      query: design.topic.slice(0, 100),
      uploadedBy: null,
      topic: design.topic,
      photoAssetIds: design.copy.photoAssetIds.length ? design.copy.photoAssetIds : undefined,
      // fotografije koje je dao korisnik idu ukrug kao do sada; izabrane automatski se dopunjuju
      cyclePhotos: Boolean(design.ownPhotos),
      topUpPhotos: !design.ownPhotos,
      origin: { postId, harmonized: 'theme' },
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
  await snapshotVersion(postId, work.version + 1, 'Usklađeno sa temom brenda', null)
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
