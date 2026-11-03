import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { PexelsSearchInput, PexelsSelectInput } from '@/lib/schemas/visuals'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import { safeFetch, SsrfError } from '@/lib/ssrf'
import { localPeopleQuery, slugText } from '@/lib/visuals/people'
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
import { allowedByPeople, type PeopleCandidate } from '@/services/visuals/people-check'
import { queryVariants, STOCK_PARALLEL, usedStockIds } from '@/services/visuals/used'
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
  prefer?: number,
  limits: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ bytes: Buffer; fileId: number; quality: string | null }> {
  for (const file of videoFileCandidates(video, prefer)) {
    try {
      const res = await safeFetch(file.link, {
        timeoutMs: limits.timeoutMs ?? 40_000,
        maxBytes: limits.maxBytes ?? maxVideoBytes(),
        headers: { accept: 'video/mp4' },
      })
      if (res.ok) return { bytes: res.body, fileId: file.id, quality: file.quality }
    } catch (error) {
      if (error instanceof SsrfError && error.code === 'TOO_LARGE') continue
      // sa rokom (video u temi) sporo preuzimanje probaj manjim fajlom istog snimka
      if (limits.timeoutMs && error instanceof SsrfError && error.code === 'TIMEOUT') continue
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
  /** već dobijeno pretragom (automatski izbor): bez još jednog poziva Pexels-u (D-122) */
  photo?: PexelsPhoto
  video?: PexelsVideo
  /** najveća kraća strana snimka koja se prvo traži (video u temi: 720, D-128) */
  preferShortSide?: number
  /** granice preuzimanja snimka (video u temi mora da stane u korak od 30 s na Netlify-u) */
  downloadTimeoutMs?: number
  maxBytes?: number
}): Promise<StoredPexels> {
  const found = await existing(input.brandId, input.kind, input.id, input.crop)
  // već sačuvan: atribucija je u redu medija, bez novog poziva Pexels-u (200 zahteva na sat)
  if (found)
    return { asset: found, attribution: found.attribution as unknown as PexelsAttribution, reused: true }
  if (input.kind === 'video') {
    const video = input.video ?? (await getVideo(input.id))
    const attribution = attributionFor('video', video.user, video.pageUrl)
    const file = await downloadVideo(video, input.preferShortSide, {
      timeoutMs: input.downloadTimeoutMs,
      maxBytes: input.maxBytes,
    })
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
        // kadar iz snimka za sličicu videa u temi dok ga pregledač ne napravi (D-128)
        image: video.image,
      },
    })
    return { asset, attribution, reused: false }
  }

  const photo = input.photo ?? (await getPhoto(input.id))
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

/** Snimci koje provera ljudi (D-154) gleda u jednom pozivu. */
const VIDEO_CHECK_BATCH = 5
/** Najduža provera jedne grupe snimaka. */
const VIDEO_CHECK_MS = 8_000
/** Fotografije u jednom pozivu: koliko treba i još nekoliko, za odbijene. */
const PHOTO_CHECK_BATCH = 10
const PHOTO_CHECK_SPARE = 3
/** Zajednički rok svih provera fotografija u jednom izboru. */
const PHOTO_CHECKS_MS = 12_000
/** Najviše provera po izboru; posle toga izbor vraća ono što je našao. */
const MAX_PEOPLE_CHECKS = 3

/** Snimak za proveru ljudi: ime iz adrese, naslovna slika i dva kadra iz snimka. */
function videoCandidate(video: PexelsVideo): PeopleCandidate<PexelsVideo> {
  const pics = video.pictures ?? []
  const frames = [video.image, pics[Math.floor(pics.length / 3)], pics[Math.floor((pics.length * 2) / 3)]]
  return {
    item: video,
    text: slugText(video.pageUrl),
    frames: frames.filter((f): f is string => Boolean(f)),
  }
}

/** Fotografija za proveru ljudi: alt, ime iz adrese i srednja sličica. */
function photoCandidate(photo: PexelsPhoto): PeopleCandidate<PexelsPhoto> {
  return { item: photo, text: `${photo.alt ?? ''} ${slugText(photo.pageUrl)}`, frames: [photo.src.medium] }
}

/**
 * Automatski izbor snimka za upit („Nova objava”, plan, Autopilot): snimak od 3 do 60 sekundi
 * (priča i Reels) koji staje u limit. Snimak koji je brend već dobio se preskače (D-121), pa se
 * traže sledeće strane i kraći oblici upita; `null` kad Pexels nije podešen ili novog snimka nema.
 */
export async function pickPexelsVideo(input: {
  workspaceId: string
  brandId: string
  query: string
  orientation: PexelsOrientation
  uploadedBy: string | null
  preferShortSide?: number
  /** rok (ms od epohe) za ceo izbor: posle njega se ne kreće sa novim snimkom (korak od 30 s, D-122) */
  deadline?: number
  /** najduži snimak u sekundama (video u temi traje oko 12 s, pa duži snimak samo troši vreme) */
  maxSeconds?: number
  maxBytes?: number
}): Promise<StoredPexels | null> {
  if (!isPexelsConfigured()) return null
  const { deadline, maxSeconds = 60, maxBytes, ...store } = input
  const used = await usedStockIds(input.brandId, 'pexels-video')
  // ljudi samo evropskog izgleda (D-136, D-154): upit koji pominje ljude traži evropske ljude, a
  // snimci se pre preuzimanja proveravaju po imenu i kadrovima
  const variants = queryVariants(input.query).map(localPeopleQuery)
  let checks = 0
  for (let v = 0; v < variants.length; v++) {
    for (let page = 1; page <= (v === 0 ? 3 : 1); page++) {
      const videos = await searchVideos({
        query: variants[v]!,
        orientation: input.orientation,
        perPage: 30,
        page,
      })
      const fresh = videos.filter(
        (x) => x.durationSec >= 3 && x.durationSec <= maxSeconds && !used.has(String(x.id)),
      )
      for (let i = 0; i < fresh.length; i += VIDEO_CHECK_BATCH) {
        if (checks++ >= MAX_PEOPLE_CHECKS) return null
        if (deadline && deadline - Date.now() < 8_000) return null
        const batch = fresh.slice(i, i + VIDEO_CHECK_BATCH)
        for (const clip of batch) used.add(String(clip.id))
        const allowed = await allowedByPeople(batch.map(videoCandidate), {
          label: 'pexels-video',
          // preuzimanje snimka traži bar 8 s, pa provera završava pre toga
          until: Math.min(Date.now() + VIDEO_CHECK_MS, deadline ? deadline - 9_000 : Infinity),
        })
        for (const clip of allowed) {
          const left = deadline ? deadline - Date.now() : null
          if (left !== null && left < 8_000) return null
          try {
            return await storePexelsMedia({
              ...store,
              kind: 'video',
              id: clip.id,
              video: clip,
              maxBytes,
              downloadTimeoutMs: left !== null ? Math.min(12_000, left - 4_000) : undefined,
            })
          } catch (error) {
            if (error instanceof ApiError && error.code === 'PAYLOAD_TOO_LARGE') continue
            // sa rokom jedan neispravan ili spor snimak ne zaustavlja izbor: probaj sledeći
            if (deadline) {
              logger.warn('pexels_video_skipped', { brandId: input.brandId, clipId: clip.id, error })
              continue
            }
            throw error
          }
        }
      }
      if (videos.length < 30) break
    }
  }
  return null
}

/**
 * Automatski izbor fotografija za upit, bez onih koje je brend već dobio; najviše `count`.
 * Izabrane se preuzimaju i čuvaju paralelno (D-122); fotografija koja ne stigne se preskače.
 */
export async function pickPexelsPhotos(input: {
  workspaceId: string
  brandId: string
  query: string
  count: number
  crop: 'square' | 'portrait'
  uploadedBy: string | null
}): Promise<StoredPexels[]> {
  if (!isPexelsConfigured() || input.count <= 0) return []
  const used = await usedStockIds(input.brandId, 'pexels-photo')
  const chosen: PexelsPhoto[] = []
  // ljudi samo evropskog izgleda (D-154): provere imaju zajednički rok, da izbor stane u korak od 30 s
  const variants = queryVariants(input.query).map(localPeopleQuery)
  const until = Date.now() + PHOTO_CHECKS_MS
  let checks = 0
  search: for (let v = 0; v < variants.length && chosen.length < input.count; v++) {
    for (let page = 1; page <= (v === 0 ? 3 : 1) && chosen.length < input.count; page++) {
      const photos = await searchPhotos({
        query: variants[v]!,
        orientation: input.crop === 'portrait' ? 'portrait' : 'square',
        perPage: 40,
        page,
      })
      const fresh = photos.filter((p) => !used.has(String(p.id)))
      for (let i = 0; i < fresh.length && chosen.length < input.count;) {
        if (checks++ >= MAX_PEOPLE_CHECKS) break search
        const size = Math.min(PHOTO_CHECK_BATCH, input.count - chosen.length + PHOTO_CHECK_SPARE)
        const batch = fresh.slice(i, i + size)
        i += size
        for (const photo of batch) used.add(String(photo.id))
        const allowed = await allowedByPeople(batch.map(photoCandidate), { label: 'pexels-photo', until })
        chosen.push(...allowed.slice(0, input.count - chosen.length))
      }
      if (photos.length < 40) break
    }
  }
  const stored = await mapLimit(chosen, STOCK_PARALLEL, async (photo) => {
    try {
      return await storePexelsMedia({
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        kind: 'photo',
        id: photo.id,
        crop: input.crop,
        uploadedBy: input.uploadedBy,
        photo,
      })
    } catch (error) {
      logger.warn('pexels_pick_store_failed', { pexelsId: photo.id, error })
      return null
    }
  })
  return stored.filter((p): p is StoredPexels => Boolean(p))
}
