import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getRedis } from '@/lib/ratelimit'

/**
 * Pexels API (D-107, docs/INTEGRATIONS.md 12a): besplatni video snimci i fotografije. Ključ ide u
 * zaglavlje `Authorization` bez prefiksa; limit je 200 zahteva na sat i 20.000 mesečno, pa se
 * pretraga kešira sat vremena. Atribucija: link ka Pexels-u i ime autora kad je moguće.
 */
const BASE = 'https://api.pexels.com'
const CACHE_TTL_SEC = 3600

export type PexelsOrientation = 'landscape' | 'portrait' | 'square'

export interface PexelsVideoFile {
  id: number
  quality: string | null
  fileType: string
  width: number | null
  height: number | null
  fps: number | null
  link: string
}

export interface PexelsVideo {
  id: number
  width: number
  height: number
  durationSec: number
  pageUrl: string
  image: string
  user: { name: string; url: string }
  files: PexelsVideoFile[]
}

export interface PexelsPhoto {
  id: number
  width: number
  height: number
  alt: string | null
  pageUrl: string
  photographer: string
  photographerUrl: string
  src: { original: string; large2x: string; large: string; medium: string; portrait: string; tiny: string }
}

export function isPexelsConfigured(): boolean {
  return Boolean(env.PEXELS_API_KEY)
}

type RawVideo = {
  id: number
  width: number
  height: number
  duration: number
  url: string
  image: string
  user: { name: string; url: string }
  video_files: Array<{
    id: number
    quality: string | null
    file_type: string
    width: number | null
    height: number | null
    fps: number | null
    link: string
  }>
}

type RawPhoto = {
  id: number
  width: number
  height: number
  alt?: string | null
  url: string
  photographer: string
  photographer_url: string
  src: PexelsPhoto['src']
}

function toVideo(v: RawVideo): PexelsVideo {
  return {
    id: v.id,
    width: v.width,
    height: v.height,
    durationSec: v.duration,
    pageUrl: v.url,
    image: v.image,
    user: { name: v.user.name, url: v.user.url },
    files: v.video_files.map((f) => ({
      id: f.id,
      quality: f.quality,
      fileType: f.file_type,
      width: f.width,
      height: f.height,
      fps: f.fps,
      link: f.link,
    })),
  }
}

function toPhoto(p: RawPhoto): PexelsPhoto {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    alt: p.alt?.trim() || null,
    pageUrl: p.url,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    src: p.src,
  }
}

const memoryCache = new Map<string, { expires: number; value: unknown }>()

async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (redis) {
    try {
      return (await redis.get<T>(key)) ?? null
    } catch {
      return null
    }
  }
  const hit = memoryCache.get(key)
  return hit && hit.expires > Date.now() ? (hit.value as T) : null
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(key, value, { ex: CACHE_TTL_SEC })
    } catch {
      // keš nije kritičan
    }
    return
  }
  memoryCache.set(key, { expires: Date.now() + CACHE_TTL_SEC * 1000, value })
}

export function resetPexelsCacheForTests(): void {
  memoryCache.clear()
}

async function pexelsFetch(path: string): Promise<Response> {
  if (!env.PEXELS_API_KEY)
    throw new ApiError('AI_UNAVAILABLE', 'Pexels nije podešen (nedostaje PEXELS_API_KEY).')
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: env.PEXELS_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new ApiError('PROVIDER_ERROR', 'Pexels nije dostupan. Pokušajte ponovo.', { cause: error })
  }
  if (res.status === 429)
    throw new ApiError('RATE_LIMITED', 'Pexels limit pretraga je potrošen. Pokušajte kasnije.', {
      retryAfterSec: 600,
    })
  if (res.status === 401 || res.status === 403)
    throw new ApiError('PROVIDER_ERROR', 'Pexels ključ nije ispravan.')
  if (res.status === 404)
    throw new ApiError('NOT_FOUND', 'Snimak ili fotografija više ne postoji na Pexels-u.')
  if (!res.ok) {
    logger.warn('pexels_error', { status: res.status, path: path.split('?')[0] })
    throw new ApiError('PROVIDER_ERROR', 'Pexels je vratio grešku. Pokušajte ponovo.')
  }
  return res
}

function searchQuery(
  query: string,
  orientation: PexelsOrientation | undefined,
  perPage: number,
  page = 1,
): URLSearchParams {
  const qs = new URLSearchParams({
    query: query.trim().slice(0, 100),
    per_page: String(Math.min(40, Math.max(1, perPage))),
  })
  if (page > 1) qs.set('page', String(page))
  if (orientation) qs.set('orientation', orientation)
  return qs
}

export async function searchVideos(params: {
  query: string
  orientation?: PexelsOrientation
  perPage?: number
  page?: number
}): Promise<PexelsVideo[]> {
  const qs = searchQuery(params.query, params.orientation, params.perPage ?? 12, params.page)
  qs.set('size', 'medium')
  const key = `pexels:videos:${qs.toString()}`
  const cached = await cacheGet<PexelsVideo[]>(key)
  if (cached) return cached
  const res = await pexelsFetch(`/videos/search?${qs.toString()}`)
  const body = (await res.json()) as { videos?: RawVideo[] }
  const videos = (body.videos ?? []).map(toVideo)
  await cacheSet(key, videos)
  return videos
}

export async function searchPhotos(params: {
  query: string
  orientation?: PexelsOrientation
  perPage?: number
  page?: number
}): Promise<PexelsPhoto[]> {
  const qs = searchQuery(params.query, params.orientation, params.perPage ?? 12, params.page)
  const key = `pexels:photos:${qs.toString()}`
  const cached = await cacheGet<PexelsPhoto[]>(key)
  if (cached) return cached
  const res = await pexelsFetch(`/v1/search?${qs.toString()}`)
  const body = (await res.json()) as { photos?: RawPhoto[] }
  const photos = (body.photos ?? []).map(toPhoto)
  await cacheSet(key, photos)
  return photos
}

export async function getVideo(id: number): Promise<PexelsVideo> {
  const res = await pexelsFetch(`/videos/videos/${id}`)
  return toVideo((await res.json()) as RawVideo)
}

export async function getPhoto(id: number): Promise<PexelsPhoto> {
  const res = await pexelsFetch(`/v1/photos/${id}`)
  return toPhoto((await res.json()) as RawPhoto)
}

/**
 * MP4 fajlovi od najboljeg ka slabijem, najviše 1080 px po kraćoj strani: veći prelazi limit
 * skladišta, a mrežama ne treba. Pozivalac uzima prvi koji stane u limit.
 */
export function videoFileCandidates(video: PexelsVideo): PexelsVideoFile[] {
  return video.files
    .filter((f) => f.fileType === 'video/mp4' && f.width && f.height)
    .filter((f) => Math.min(f.width!, f.height!) <= 1080)
    .sort((a, b) => Math.min(b.width!, b.height!) - Math.min(a.width!, a.height!))
}

export interface PexelsAttribution {
  provider: 'pexels'
  text: string
  authorName: string
  authorUrl: string
  pageUrl: string
}

export function attributionFor(
  kind: 'video' | 'photo',
  author: { name: string; url: string },
  pageUrl: string,
): PexelsAttribution {
  return {
    provider: 'pexels',
    text: `${kind === 'video' ? 'Video' : 'Photo'} by ${author.name} on Pexels`,
    authorName: author.name,
    authorUrl: author.url,
    pageUrl,
  }
}
