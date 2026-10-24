import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getRedis } from '@/lib/ratelimit'

/**
 * Unsplash API (docs/INTEGRATIONS.md 12): pretraga sa kešom 1 h, praćenje preuzimanja
 * (`download_location`) kad korisnik zaista upotrebi fotografiju, atribucija sa utm parametrima,
 * hotlink URL-ovi sa zadržanim `ixid`. Demo aplikacija ima 50 zahteva/h.
 */
const BASE = 'https://api.unsplash.com'
const CACHE_TTL_SEC = 3600

export type UnsplashOrientation = 'landscape' | 'portrait' | 'squarish'
export type UnsplashColor =
  | 'black_and_white'
  | 'black'
  | 'white'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'magenta'
  | 'green'
  | 'teal'
  | 'blue'

export interface UnsplashPhoto {
  id: string
  width: number
  height: number
  color: string | null
  blurHash: string | null
  alt: string | null
  description: string | null
  urls: { raw: string; full: string; regular: string; small: string; thumb: string }
  user: { name: string; username: string; profileUrl: string }
  downloadLocation: string
  htmlLink: string
}

export interface UnsplashSearchParams {
  query: string
  page?: number
  perPage?: number
  orientation?: UnsplashOrientation
  color?: UnsplashColor
  contentFilter?: 'low' | 'high'
}

export interface UnsplashSearchResult {
  total: number
  totalPages: number
  results: UnsplashPhoto[]
  cached: boolean
  rateLimitRemaining: number | null
}

export function isUnsplashConfigured(): boolean {
  return Boolean(env.UNSPLASH_ACCESS_KEY)
}

type RawPhoto = {
  id: string
  width: number
  height: number
  color?: string | null
  blur_hash?: string | null
  alt_description?: string | null
  description?: string | null
  urls: { raw: string; full: string; regular: string; small: string; thumb: string }
  user: { name: string; username: string; links?: { html?: string } }
  links: { download_location: string; html?: string }
}

function toPhoto(p: RawPhoto): UnsplashPhoto {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    color: p.color ?? null,
    blurHash: p.blur_hash ?? null,
    alt: p.alt_description ?? null,
    description: p.description ?? null,
    urls: p.urls,
    user: {
      name: p.user.name,
      username: p.user.username,
      profileUrl: p.user.links?.html ?? `https://unsplash.com/@${p.user.username}`,
    },
    downloadLocation: p.links.download_location,
    htmlLink: p.links.html ?? `https://unsplash.com/photos/${p.id}`,
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
  if (hit && hit.expires > Date.now()) return hit.value as T
  return null
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

export function resetUnsplashCacheForTests(): void {
  memoryCache.clear()
}

async function unsplashFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!env.UNSPLASH_ACCESS_KEY) {
    throw new ApiError('AI_UNAVAILABLE', 'Unsplash nije podešen (nedostaje UNSPLASH_ACCESS_KEY).')
  }
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
        'accept-version': 'v1',
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new ApiError('PROVIDER_ERROR', 'Unsplash nije dostupan. Pokušajte ponovo.', { cause: error })
  }
  if (
    res.status === 403 &&
    (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(await res.clone().text()))
  ) {
    throw new ApiError(
      'RATE_LIMITED',
      'Unsplash limit pretraga je potrošen za ovaj sat. Pokušajte kasnije ili otpremite svoju fotografiju.',
      {
        retryAfterSec: 600,
      },
    )
  }
  if (res.status === 401) throw new ApiError('PROVIDER_ERROR', 'Unsplash ključ nije ispravan.')
  if (res.status === 404) throw new ApiError('NOT_FOUND', 'Fotografija više ne postoji na Unsplash-u.')
  if (!res.ok) {
    logger.warn('unsplash_error', { status: res.status, path })
    throw new ApiError('PROVIDER_ERROR', 'Unsplash je vratio grešku. Pokušajte ponovo.')
  }
  return res
}

export async function searchPhotos(params: UnsplashSearchParams): Promise<UnsplashSearchResult> {
  const query = params.query.trim().slice(0, 100)
  const qs = new URLSearchParams({
    query,
    page: String(params.page ?? 1),
    per_page: String(Math.min(30, Math.max(1, params.perPage ?? 12))),
    content_filter: params.contentFilter ?? 'high',
  })
  if (params.orientation) qs.set('orientation', params.orientation)
  if (params.color) qs.set('color', params.color)
  const cacheKey = `unsplash:search:${qs.toString()}`
  const cached = await cacheGet<Omit<UnsplashSearchResult, 'cached' | 'rateLimitRemaining'>>(cacheKey)
  if (cached) return { ...cached, cached: true, rateLimitRemaining: null }

  const res = await unsplashFetch(`/search/photos?${qs.toString()}`)
  const body = (await res.json()) as { total: number; total_pages: number; results: RawPhoto[] }
  const result = { total: body.total, totalPages: body.total_pages, results: body.results.map(toPhoto) }
  await cacheSet(cacheKey, result)
  const remaining = res.headers.get('x-ratelimit-remaining')
  return { ...result, cached: false, rateLimitRemaining: remaining ? Number(remaining) : null }
}

export async function getPhoto(id: string): Promise<UnsplashPhoto> {
  const res = await unsplashFetch(`/photos/${encodeURIComponent(id)}`)
  return toPhoto((await res.json()) as RawPhoto)
}

/** Obavezno pri svakoj stvarnoj upotrebi fotografije (ne pri prikazu rezultata). */
export async function trackDownload(downloadLocation: string): Promise<void> {
  try {
    const url = new URL(downloadLocation)
    if (url.hostname !== 'api.unsplash.com') return
    await unsplashFetch(`${url.pathname}${url.search}`)
  } catch (error) {
    logger.warn('unsplash_track_download_failed', { error })
  }
}

export interface UnsplashAttribution {
  text: string
  html: string
  photographerName: string
  photographerUrl: string
  unsplashUrl: string
  photoUrl: string
}

export function attributionFor(photo: Pick<UnsplashPhoto, 'user' | 'htmlLink'>): UnsplashAttribution {
  const utm = `utm_source=${encodeURIComponent(env.UNSPLASH_APP_NAME)}&utm_medium=referral`
  const photographerUrl = `${photo.user.profileUrl}?${utm}`
  const unsplashUrl = `https://unsplash.com/?${utm}`
  return {
    text: `Photo by ${photo.user.name} on Unsplash`,
    html: `Photo by <a href="${photographerUrl}">${photo.user.name}</a> on <a href="${unsplashUrl}">Unsplash</a>`,
    photographerName: photo.user.name,
    photographerUrl,
    unsplashUrl,
    photoUrl: `${photo.htmlLink}?${utm}`,
  }
}

/** Hotlink sa promenom veličine; `ixid` ostaje u URL-u (obavezno po smernicama). */
export function resizedUrl(
  rawOrRegular: string,
  opts: { w: number; h?: number; fit?: 'crop' | 'max'; q?: number },
): string {
  const u = new URL(rawOrRegular)
  u.searchParams.set('w', String(opts.w))
  if (opts.h) u.searchParams.set('h', String(opts.h))
  u.searchParams.set('fit', opts.fit ?? (opts.h ? 'crop' : 'max'))
  u.searchParams.set('q', String(opts.q ?? 80))
  u.searchParams.set('auto', 'format')
  return u.toString()
}
