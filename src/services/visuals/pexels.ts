import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { PexelsSearchInput, PexelsSelectInput } from '@/lib/schemas/visuals'
import { safeFetch, SsrfError } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  attributionFor,
  getPhoto,
  getVideo,
  isPexelsConfigured,
  searchPhotos,
  searchVideos,
  videoFileCandidates,
  type PexelsAttribution,
  type PexelsOrientation,
  type PexelsPhoto,
  type PexelsVideo,
} from '@/integrations/pexels/client'
import { getBrand } from '@/services/brands'
import { maxVideoBytes, storeServerVideo, type MediaAssetRow } from '@/services/media'
import { storeServerImage } from '@/services/visuals/store'
import type { Json } from '@/types/database'

/**
 * Pexels u biblioteci (D-107): pretraga za korisnika prikazuje hotlink pregled, a izbor (ili
 * automatski izbor za „Novu objavu” i Autopilot) čuva kopiju u `uploads` sa atribucijom autora.
 * Isti snimak u istom brendu se ne čuva dvaput.
 */
export interface PexelsResultView {
  id: number
  kind: 'video' | 'photo'
  width: number
  height: number
  thumb: string
  durationSec: number | null
  attribution: PexelsAttribution
}

function videoView(v: PexelsVideo): PexelsResultView {
  return {
    id: v.id,
    kind: 'video',
    width: v.width,
    height: v.height,
    thumb: v.image,
    durationSec: v.durationSec,
    attribution: attributionFor('video', v.user, v.pageUrl),
  }
}

function photoView(p: PexelsPhoto): PexelsResultView {
  return {
    id: p.id,
    kind: 'photo',
    width: p.width,
    height: p.height,
    thumb: p.src.medium,
    durationSec: null,
    attribution: attributionFor('photo', { name: p.photographer, url: p.photographerUrl }, p.pageUrl),
  }
}

export async function searchPexels(
  viewer: Viewer,
  input: PexelsSearchInput,
): Promise<{ configured: boolean; results: PexelsResultView[] }> {
  void viewer
  if (!isPexelsConfigured()) return { configured: false, results: [] }
  if (input.kind === 'video') {
    const videos = await searchVideos({ query: input.query, orientation: input.orientation, perPage: 12 })
    return { configured: true, results: videos.map(videoView) }
  }
  const photos = await searchPhotos({ query: input.query, orientation: input.orientation, perPage: 12 })
  return { configured: true, results: photos.map(photoView) }
}

export interface StoredPexels {
  asset: MediaAssetRow
  attribution: PexelsAttribution
  reused: boolean
}

/** Ista fotografija sa drugim isecanjem (kvadrat ili priča) je poseban medij. */
async function existing(
  brandId: string,
  kind: 'video' | 'photo',
  id: number,
  crop?: string,
): Promise<MediaAssetRow | null> {
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('brand_id', brandId)
    .eq('source', 'pexels')
    .is('deleted_at', null)
    .contains(
      'source_data',
      kind === 'photo' ? { pexelsId: id, kind, crop: crop ?? 'original' } : { pexelsId: id, kind },
    )
    .limit(1)
    .maybeSingle()
  return data
}

/** Najbolji MP4 koji staje u limit skladišta; veći fajl se preskače bez preuzimanja celog. */
async function downloadVideo(
  video: PexelsVideo,
): Promise<{ bytes: Buffer; fileId: number; quality: string | null }> {
  for (const file of videoFileCandidates(video)) {
    try {
      const res = await safeFetch(file.link, {
        timeoutMs: 40_000,
        maxBytes: maxVideoBytes(),
        headers: { accept: 'video/mp4' },
      })
      if (res.ok) return { bytes: res.body, fileId: file.id, quality: file.quality }
    } catch (error) {
      if (error instanceof SsrfError && error.code === 'TOO_LARGE') continue
      throw error
    }
  }
  throw new ApiError('PAYLOAD_TOO_LARGE', 'Snimak sa Pexels-a je prevelik za biblioteku. Izaberite kraći.')
}

/** Fotografija isečena za vrstu objave: kvadrat za objavu, 9:16 za priču. */
function photoUrl(photo: PexelsPhoto, crop: 'square' | 'portrait' | 'original'): string {
  const u = new URL(photo.src.original)
  u.searchParams.set('auto', 'compress')
  u.searchParams.set('cs', 'tinysrgb')
  if (crop === 'square') {
    u.searchParams.set('w', '1600')
    u.searchParams.set('h', '1600')
    u.searchParams.set('fit', 'crop')
  } else if (crop === 'portrait') {
    u.searchParams.set('w', '1080')
    u.searchParams.set('h', '1920')
    u.searchParams.set('fit', 'crop')
  } else {
    u.searchParams.set('w', '2000')
  }
  return u.toString()
}

/** Čuvanje bez korisnika (izbor u Studiju, „Nova objava”, Autopilot). */
export async function storePexelsMedia(input: {
  workspaceId: string
  brandId: string
  kind: 'video' | 'photo'
  id: number
  crop?: 'square' | 'portrait' | 'original'
  uploadedBy: string | null
}): Promise<StoredPexels> {
  const found = await existing(input.brandId, input.kind, input.id, input.crop)
  // već sačuvan: atribucija je u redu medija, bez novog poziva Pexels-u (200 zahteva na sat)
  if (found)
    return { asset: found, attribution: found.attribution as unknown as PexelsAttribution, reused: true }
  if (input.kind === 'video') {
    const video = await getVideo(input.id)
    const attribution = attributionFor('video', video.user, video.pageUrl)
    const file = await downloadVideo(video)
    const asset = await storeServerVideo({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      bytes: file.bytes,
      mime: 'video/mp4',
      source: 'pexels',
      folder: 'pexels',
      uploadedBy: input.uploadedBy,
      tags: ['pexels'],
      attribution: attribution as unknown as Json,
      sourceData: {
        pexelsId: video.id,
        kind: 'video',
        pageUrl: video.pageUrl,
        fileId: file.fileId,
        quality: file.quality,
      },
    })
    return { asset, attribution, reused: false }
  }

  const photo = await getPhoto(input.id)
  const attribution = attributionFor(
    'photo',
    { name: photo.photographer, url: photo.photographerUrl },
    photo.pageUrl,
  )
  const res = await safeFetch(photoUrl(photo, input.crop ?? 'original'), {
    timeoutMs: 20_000,
    maxBytes: 15 * 1024 * 1024,
    headers: { accept: 'image/*' },
  })
  if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Fotografija nije mogla da se preuzme sa Pexels-a.')
  const asset = await storeServerImage({
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    bytes: res.body,
    mimeType: res.contentType.includes('png') ? 'image/png' : 'image/jpeg',
    source: 'pexels',
    folder: 'pexels',
    altText: photo.alt,
    tags: ['pexels'],
    attribution: attribution as unknown as Json,
    sourceData: { pexelsId: photo.id, kind: 'photo', pageUrl: photo.pageUrl, crop: input.crop ?? 'original' },
    uploadedBy: input.uploadedBy,
  })
  return { asset, attribution, reused: false }
}

export async function selectPexelsMedia(viewer: Viewer, input: PexelsSelectInput): Promise<StoredPexels> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!isPexelsConfigured()) throw new ApiError('AI_UNAVAILABLE', 'Pexels još nije uključen.')
  return storePexelsMedia({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    kind: input.kind,
    id: input.id,
    uploadedBy: viewer.user.id,
  })
}

/**
 * Automatski izbor snimka za upit („Nova objava”, Autopilot): prvi rezultat od 3 do 60 sekundi
 * (priča i Reels) koji staje u limit; `null` kad Pexels nije podešen ili nema rezultata.
 */
export async function pickPexelsVideo(input: {
  workspaceId: string
  brandId: string
  query: string
  orientation: PexelsOrientation
  uploadedBy: string | null
}): Promise<StoredPexels | null> {
  if (!isPexelsConfigured()) return null
  const videos = await searchVideos({ query: input.query, orientation: input.orientation, perPage: 8 })
  for (const v of videos.filter((x) => x.durationSec >= 3 && x.durationSec <= 60)) {
    try {
      return await storePexelsMedia({ ...input, kind: 'video', id: v.id })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PAYLOAD_TOO_LARGE') continue
      throw error
    }
  }
  return null
}

/** Automatski izbor fotografija za upit; vraća koliko je nađeno, najviše `count`. */
export async function pickPexelsPhotos(input: {
  workspaceId: string
  brandId: string
  query: string
  count: number
  crop: 'square' | 'portrait'
  uploadedBy: string | null
}): Promise<StoredPexels[]> {
  if (!isPexelsConfigured()) return []
  const photos = await searchPhotos({
    query: input.query,
    orientation: input.crop === 'portrait' ? 'portrait' : 'square',
    perPage: Math.max(input.count, 6),
  })
  const out: StoredPexels[] = []
  for (const p of photos.slice(0, input.count)) {
    out.push(
      await storePexelsMedia({
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        kind: 'photo',
        id: p.id,
        crop: input.crop,
        uploadedBy: input.uploadedBy,
      }),
    )
  }
  return out
}
