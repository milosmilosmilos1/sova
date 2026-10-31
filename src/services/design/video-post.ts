import 'server-only'

import { logger } from '@/lib/logger'
import { safeFetch } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { StyleId } from '@/lib/visuals/design'
import { slideRanges } from '@/lib/visuals/design/batches'
import { preparePhoto, renderOverlay, renderSlide } from '@/lib/visuals/design/render'
import type { DesignColors, Slide } from '@/lib/visuals/design/types'
import { sceneSeconds, videoStyleFor } from '@/lib/visuals/design/video'
import { getStyle } from '@/lib/visuals/design'
import type { StepRunner } from '@/services/autopilot/runner'
import { downloadAsset } from '@/services/media'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'
import { storeServerImage } from '@/services/visuals/store'

import { logoDataUri, type ResolvedDesign } from './brand-design'
import { themeOf, type PostDesignContext } from './post-design'

/**
 * Video u temi na serveru (D-128): snimci sa Pexels-a (720p, bez ponavljanja u brendu), sloj teksta
 * teme za svaki kadar i slika za listu dok video ne postoji. Sam MP4 pravi pregledač u Odobravanju,
 * pa server ne kodira video; sve ovde staje u korake ispod 30 sekundi koliko Netlify daje zahtevu.
 */
export interface ThemeVideoInput {
  workspaceId: string
  brandId: string
  design: ResolvedDesign
  /** kadrovi videa (`videoScenes`) */
  scenes: Slide[]
  query: string
  uploadedBy: string | null
  colors?: DesignColors
  /** snimci i fotografije koje video već ima (usklađivanje, „Generiši ponovo”): ne biraju se novi */
  clipAssetIds?: string[]
  photoAssetIds?: string[]
  /** oznaka u source_data (npr. ID objave ili plana) */
  origin?: Record<string, string | null>
}

export interface ThemeVideo {
  styleId: StyleId
  clipAssetIds: string[]
  photoAssetIds: string[]
  overlayAssetIds: string[]
  seconds: number[]
  posterAssetId: string | null
}

/** Snimci po videu: dva daju rez između kadrova, a skladište ostaje malo. */
const CLIPS_PER_VIDEO = 2
/** Snimak u temi se uzima do 720 px po kraćoj strani (tekst je u sloju teme, ne u snimku). */
const CLIP_SHORT_SIDE = 720

/** Jedan nov snimak za upit; `null` kad Pexels nije podešen ili novog snimka nema. */
export async function pickVideoClip(input: ThemeVideoInput): Promise<string | null> {
  try {
    const clip = await pickPexelsVideo({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      query: input.query,
      orientation: 'portrait',
      uploadedBy: input.uploadedBy,
      preferShortSide: CLIP_SHORT_SIDE,
    })
    return clip?.asset.id ?? null
  } catch (error) {
    logger.warn('theme_video_clip_failed', { brandId: input.brandId, error })
    return null
  }
}

/** Bez snimaka video ide preko fotografija (lagano uvećanje); greška izvora ne obara nacrt. */
async function pickVideoPhotos(input: ThemeVideoInput): Promise<string[]> {
  try {
    const photos = await pickPexelsPhotos({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      query: input.query,
      count: CLIPS_PER_VIDEO,
      crop: 'portrait',
      uploadedBy: input.uploadedBy,
    })
    return photos.map((p) => p.asset.id)
  } catch (error) {
    logger.warn('theme_video_photos_failed', { brandId: input.brandId, error })
    return []
  }
}

function sceneRender(input: ThemeVideoInput, styleId: StyleId, scene: Slide, logo: string | null) {
  return {
    styleId,
    slide: scene,
    format: 'story' as const,
    colors: input.colors ?? input.design.colors,
    brandFonts: input.design.fonts,
    lockFonts: input.design.fontsLocked,
    brandName: input.design.brandName,
    handle: input.design.handle,
    logo,
    // jedan slajd: bez brojača i strelice za listanje koje stilovi crtaju na karuselu
    index: 0,
    total: 1,
  }
}

/** Slojevi teksta za kadrove [from, to): PNG sa providnošću tamo gde ide snimak. */
export async function renderVideoOverlays(
  input: ThemeVideoInput,
  styleId: StyleId,
  from: number,
  to: number,
): Promise<string[]> {
  const logo = await logoDataUri(input.design.logoAssetId)
  const ids: string[] = []
  for (let i = from; i < to; i++) {
    const scene = input.scenes[i]!
    const rendered = await renderOverlay(sceneRender(input, styleId, scene, logo))
    const asset = await storeServerImage({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      bytes: rendered.bytes,
      mimeType: rendered.mimeType,
      source: 'template',
      folder: 'design',
      altText: [scene.title, scene.body].filter(Boolean).join('. ').slice(0, 500),
      tags: ['design', 'video', styleId],
      sourceData: {
        design: true,
        videoOverlay: true,
        styleId,
        kind: scene.kind,
        index: i,
        total: input.scenes.length,
        ...(input.origin ?? {}),
      },
      uploadedBy: input.uploadedBy,
    })
    ids.push(asset.id)
  }
  return ids
}

/** Fotografija za sliku videa: kadar iz snimka sa Pexels-a ili prva fotografija videa. */
async function posterPhoto(clipId: string | null, photoId: string | null): Promise<Buffer | null> {
  const admin = createSupabaseAdminClient()
  if (clipId) {
    const { data } = await admin.from('media_assets').select('source_data').eq('id', clipId).maybeSingle()
    const image = (data?.source_data as { image?: unknown } | null)?.image
    if (typeof image === 'string' && image.startsWith('https://')) {
      const res = await safeFetch(image, { timeoutMs: 10_000, maxBytes: 8 * 1024 * 1024 })
      if (res.ok) return res.body
    }
  }
  if (photoId) {
    const { data } = await admin
      .from('media_assets')
      .select('bucket, storage_path')
      .eq('id', photoId)
      .maybeSingle()
    if (data) return downloadAsset(data)
  }
  return null
}

/** Slika za listu i pregled dok pregledač ne napravi video: prvi kadar u temi. */
export async function renderVideoPoster(
  input: ThemeVideoInput,
  styleId: StyleId,
  clipId: string | null,
  photoId: string | null,
): Promise<string | null> {
  try {
    const colors = input.colors ?? input.design.colors
    const bytes = await posterPhoto(clipId, photoId)
    const photo = bytes ? await preparePhoto(bytes, getStyle(styleId), colors) : null
    const logo = await logoDataUri(input.design.logoAssetId)
    const rendered = await renderSlide({ ...sceneRender(input, styleId, input.scenes[0]!, logo), photo })
    const asset = await storeServerImage({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      bytes: rendered.bytes,
      mimeType: rendered.mimeType,
      source: 'template',
      folder: 'design',
      altText: input.scenes[0]!.title.slice(0, 500),
      tags: ['design', 'video', styleId],
      sourceData: { design: true, videoPoster: true, styleId, ...(input.origin ?? {}) },
      uploadedBy: input.uploadedBy,
    })
    return asset.id
  } catch (error) {
    logger.warn('theme_video_poster_failed', { brandId: input.brandId, error })
    return null
  }
}

/** Slajdova koje model piše za video: naslov, dve poruke i poziv na akciju (oko 12 sekundi). */
export const VIDEO_COPY_SLIDES = 4

/** Kontekst objave za video u temi: kadrovi, snimci i slojevi; gotov MP4 dodaje pregledač. */
export function videoPostDesign(
  base: Pick<PostDesignContext, 'topic' | 'cta' | 'locale' | 'platforms'> &
    Partial<Pick<PostDesignContext, 'flowId' | 'dmCta'>>,
  theme: ResolvedDesign,
  scenes: Slide[],
  video: ThemeVideo,
): PostDesignContext {
  return {
    ...base,
    format: 'video',
    styleId: video.styleId,
    slides: scenes.length,
    photoSource: theme.photoSource,
    size: theme.size,
    ...themeOf(theme),
    copy: { slides: scenes, photoAssetIds: video.photoAssetIds },
    video: {
      clipAssetIds: video.clipAssetIds,
      overlayAssetIds: video.overlayAssetIds,
      seconds: video.seconds,
      posterAssetId: video.posterAssetId,
      renderedAssetId: null,
    },
  }
}

/**
 * Ceo video u temi u koracima pozadinskog posla: svaki snimak u svom koraku, slojevi teksta po tri
 * kadra, pa slika za listu. Ponovljen korak ne bira snimke ponovo. Bez `step` (testovi) sve redom.
 */
export async function buildThemeVideoInSteps(step: StepRunner, input: ThemeVideoInput): Promise<ThemeVideo> {
  const styleId = videoStyleFor(input.design.styleId)
  let clipAssetIds = input.clipAssetIds ?? []
  if (!input.clipAssetIds) {
    for (let k = 0; k < CLIPS_PER_VIDEO; k++) {
      const clip = await step(`clip-${k}`, () => pickVideoClip(input))
      if (!clip) break
      clipAssetIds = [...clipAssetIds, clip]
    }
  }
  const photoAssetIds =
    input.photoAssetIds ?? (clipAssetIds.length ? [] : await step('photos', () => pickVideoPhotos(input)))
  const overlayAssetIds: string[] = []
  for (const [from, to] of slideRanges(input.scenes.length)) {
    overlayAssetIds.push(
      ...(await step(`overlays-${from}`, () => renderVideoOverlays(input, styleId, from, to))),
    )
  }
  const posterAssetId = await step('poster', () =>
    renderVideoPoster(input, styleId, clipAssetIds[0] ?? null, photoAssetIds[0] ?? null),
  )
  return {
    styleId,
    clipAssetIds,
    photoAssetIds,
    overlayAssetIds,
    seconds: input.scenes.map(sceneSeconds),
    posterAssetId,
  }
}
