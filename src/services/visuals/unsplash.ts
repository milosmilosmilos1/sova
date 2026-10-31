import 'server-only'

import { classifyProviderError } from '@/lib/ai/errors'
import { generateText, type ImageInput } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import {
  buildRankPrompt,
  buildRankSystemPrompt,
  rankJsonSchema,
  rankOutputSchema,
} from '@/lib/ai/prompts/unsplash-rank'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import type { UnsplashSearchInput, UnsplashSelectInput } from '@/lib/schemas/visuals'
import { safeFetch } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  attributionFor,
  getPhoto,
  isUnsplashConfigured,
  resizedUrl,
  searchPhotos,
  trackDownload,
  unsplashRemaining,
  type UnsplashAttribution,
  type UnsplashOrientation,
  type UnsplashPhoto,
} from '@/integrations/unsplash/client'
import { getBrand } from '@/services/brands'
import type { MediaAssetRow } from '@/services/media'
import { storeServerImage } from '@/services/visuals/store'
import { queryVariants, STOCK_PARALLEL, usedStockIds } from '@/services/visuals/used'

export interface UnsplashPhotoView {
  id: string
  width: number
  height: number
  color: string | null
  alt: string | null
  preview: string
  thumb: string
  photographer: string
  attribution: UnsplashAttribution
}

export interface UnsplashSearchView {
  configured: boolean
  total: number
  totalPages: number
  cached: boolean
  rateLimitRemaining: number | null
  results: UnsplashPhotoView[]
}

function toView(p: UnsplashPhoto): UnsplashPhotoView {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    color: p.color,
    alt: p.alt ?? p.description,
    preview: resizedUrl(p.urls.raw, { w: 600, q: 75 }),
    thumb: resizedUrl(p.urls.raw, { w: 200, h: 200, fit: 'crop', q: 60 }),
    photographer: p.user.name,
    attribution: attributionFor(p),
  }
}

/** Pretraga za korisnika; rezultati se prikazuju hotlinkom, preuzimanje tek pri izboru. */
export async function searchUnsplash(
  viewer: Viewer,
  input: UnsplashSearchInput,
): Promise<UnsplashSearchView> {
  void viewer
  if (!isUnsplashConfigured()) {
    return {
      configured: false,
      total: 0,
      totalPages: 0,
      cached: false,
      rateLimitRemaining: null,
      results: [],
    }
  }
  const r = await searchPhotos({
    query: input.query,
    page: input.page,
    perPage: input.perPage,
    orientation: input.orientation,
    color: input.color,
    contentFilter: 'high',
  })
  return {
    configured: true,
    total: r.total,
    totalPages: r.totalPages,
    cached: r.cached,
    rateLimitRemaining: r.rateLimitRemaining,
    results: r.results.map(toView),
  }
}

async function downloadPhoto(photo: UnsplashPhoto, width: number): Promise<Buffer> {
  const url = resizedUrl(photo.urls.raw, { w: width, q: 85 })
  const res = await safeFetch(url, {
    timeoutMs: 20_000,
    maxBytes: 15 * 1024 * 1024,
    headers: { accept: 'image/*' },
  })
  if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Fotografija nije mogla da se preuzme sa Unsplash-a.')
  return res.body
}

export interface SelectedPhoto {
  asset: MediaAssetRow
  attribution: UnsplashAttribution
  reused: boolean
}

/** Izbor fotografije: beleži preuzimanje (obaveza API-ja) i čuva kopiju u biblioteci brenda. */
export async function selectUnsplashPhoto(
  viewer: Viewer,
  input: UnsplashSelectInput,
): Promise<SelectedPhoto> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const photo = await getPhoto(input.photoId)
  const attribution = attributionFor(photo)
  await trackDownload(photo.downloadLocation)

  const admin = createSupabaseAdminClient()
  const { data: existing } = await admin
    .from('media_assets')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('source', 'unsplash')
    .is('deleted_at', null)
    .contains('source_data', { photoId: photo.id })
    .maybeSingle()
  if (existing) return { asset: existing, attribution, reused: true }

  const bytes = await downloadPhoto(photo, 2000)
  const asset = await storeServerImage({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    bytes,
    mimeType: 'image/jpeg',
    source: 'unsplash',
    folder: 'unsplash',
    altText: photo.alt ?? photo.description ?? null,
    tags: ['unsplash'],
    attribution: { provider: 'unsplash', ...attribution } as unknown as Record<string, string>,
    sourceData: {
      photoId: photo.id,
      urls: photo.urls,
      color: photo.color,
      blurHash: photo.blurHash,
      downloadLocation: photo.downloadLocation,
      photographer: photo.user,
    } as unknown as Record<string, string>,
    uploadedBy: viewer.user.id,
  })
  return { asset, attribution, reused: false }
}

/**
 * Automatski izbor za „Novu objavu”, plan i Autopilot (D-107): rezultati pretrage redom, isečeni za
 * vrstu objave (kvadrat staje na svaku mrežu, 9:16 je za priču). Fotografija koju je brend već
 * dobio se preskače (D-121): traže se sledeće strane i kraći oblici upita, a bez nove fotografije
 * slajd ostaje u bojama. Izabrane se čuvaju paralelno, i samo onoliko koliko satni limit još prima
 * (D-122); ostatak traži pozivalac sa Pexels-a.
 */
export async function pickUnsplashPhotos(input: {
  workspaceId: string
  brandId: string
  query: string
  count: number
  crop: 'square' | 'portrait'
  uploadedBy: string | null
}): Promise<SelectedPhoto[]> {
  if (!isUnsplashConfigured() || input.count <= 0) return []
  // pretraga i bar jedno praćenje preuzimanja; sa potrošenim limitom se odmah prelazi na Pexels
  const spent = () => {
    const left = unsplashRemaining()
    return left !== null && left < 2
  }
  if (spent()) return []
  const used = await usedStockIds(input.brandId, 'unsplash')
  const chosen: UnsplashPhoto[] = []
  const variants = queryVariants(input.query)
  search: for (let v = 0; v < variants.length && chosen.length < input.count; v++) {
    for (let page = 1; page <= (v === 0 ? 3 : 1) && chosen.length < input.count; page++) {
      if (spent()) break search
      const r = await searchPhotos({
        query: variants[v]!,
        perPage: 30,
        page,
        orientation: input.crop === 'portrait' ? 'portrait' : 'squarish',
        contentFilter: 'high',
      })
      for (const photo of r.results) {
        if (chosen.length >= input.count) break
        if (used.has(photo.id)) continue
        used.add(photo.id)
        chosen.push(photo)
      }
      if (page >= r.totalPages) break
    }
  }
  // svaka upotrebljena fotografija troši jedan zahtev (praćenje preuzimanja)
  const room = unsplashRemaining()
  const take = room === null ? chosen : chosen.slice(0, Math.max(0, room))
  const stored = await mapLimit(take, STOCK_PARALLEL, async (photo) => {
    try {
      return await storePickedPhoto(photo, input)
    } catch (error) {
      logger.warn('unsplash_pick_store_failed', { photoId: photo.id, error })
      return null
    }
  })
  return stored.filter((p): p is SelectedPhoto => Boolean(p))
}

async function storePickedPhoto(
  photo: UnsplashPhoto,
  input: { workspaceId: string; brandId: string; crop: 'square' | 'portrait'; uploadedBy: string | null },
): Promise<SelectedPhoto> {
  const attribution = attributionFor(photo)
  const size = input.crop === 'portrait' ? { w: 1080, h: 1920 } : { w: 1600, h: 1600 }
  // praćenje preuzimanja ide uporedo sa preuzimanjem (greška praćenja se samo beleži)
  const [, res] = await Promise.all([
    trackDownload(photo.downloadLocation),
    safeFetch(resizedUrl(photo.urls.raw, { ...size, fit: 'crop', q: 85 }), {
      timeoutMs: 20_000,
      maxBytes: 15 * 1024 * 1024,
      headers: { accept: 'image/*' },
    }),
  ])
  if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Fotografija nije mogla da se preuzme sa Unsplash-a.')
  const asset = await storeServerImage({
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    bytes: res.body,
    mimeType: 'image/jpeg',
    source: 'unsplash',
    folder: 'unsplash',
    altText: photo.alt ?? photo.description ?? null,
    tags: ['unsplash'],
    attribution: { provider: 'unsplash', ...attribution } as unknown as Record<string, string>,
    sourceData: {
      photoId: photo.id,
      crop: input.crop,
      urls: photo.urls,
      downloadLocation: photo.downloadLocation,
      photographer: photo.user,
    } as unknown as Record<string, string>,
    uploadedBy: input.uploadedBy,
  })
  return { asset, attribution, reused: false }
}

export interface RankedCandidate {
  photo: UnsplashPhoto
  score: number
  reason: string
}

export interface RankResult {
  ordered: RankedCandidate[]
  model: string | null
  usage: { inputTokens: number; outputTokens: number; thoughtTokens: number }
  skipped: string | null
}

const ZERO = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }

/** Gemini vision rangira do 8 kandidata; bez ključa ostaje Unsplash redosled relevantnosti. */
export async function rankCandidates(
  candidates: UnsplashPhoto[],
  context: { headline: string; topic?: string | null; brandName: string; photoStyle?: string | null },
): Promise<RankResult> {
  const fallback: RankResult = {
    ordered: candidates.map((photo, i) => ({
      photo,
      score: 10 - i,
      reason: 'Redosled relevantnosti Unsplash-a',
    })),
    model: null,
    usage: ZERO,
    skipped: null,
  }
  if (!env.GEMINI_API_KEY) return { ...fallback, skipped: 'AI servis nije podešen (nedostaje ključ).' }
  if (candidates.length < 2) return fallback

  const images: ImageInput[] = []
  const used: UnsplashPhoto[] = []
  for (const photo of candidates.slice(0, 8)) {
    try {
      const res = await safeFetch(resizedUrl(photo.urls.raw, { w: 512, q: 60 }), {
        timeoutMs: 8_000,
        maxBytes: 2 * 1024 * 1024,
        headers: { accept: 'image/*' },
      })
      if (!res.ok) continue
      images.push({
        data: res.body.toString('base64'),
        mimeType: res.contentType.includes('png') ? 'image/png' : 'image/jpeg',
      })
      used.push(photo)
    } catch {
      continue
    }
  }
  if (images.length < 2)
    return { ...fallback, skipped: 'Fotografije nisu mogle da se preuzmu za rangiranje.' }

  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildRankSystemPrompt(),
          prompt: buildRankPrompt({ ...context, count: images.length }),
          images,
          jsonSchema: rankJsonSchema(),
          maxOutputTokens: 1024,
          temperature: 0.2,
          thinking: 'minimal',
          timeoutMs: 45_000,
        }),
      { label: 'unsplash-rank' },
    )
    const parsed = rankOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success) throw new Error('Rang lista nije po šemi.')
    const seen = new Set<number>()
    const ordered: RankedCandidate[] = []
    for (const r of [...parsed.data.ranking].sort((a, b) => b.score - a.score)) {
      const photo = used[r.index]
      if (!photo || seen.has(r.index)) continue
      seen.add(r.index)
      ordered.push({ photo, score: r.score, reason: r.reason })
    }
    used.forEach((photo, i) => {
      if (!seen.has(i)) ordered.push({ photo, score: 0, reason: 'Nije ocenjeno' })
    })
    return {
      ordered,
      model: outcome.model,
      usage: {
        inputTokens: outcome.result.usage.inputTokens,
        outputTokens: outcome.result.usage.outputTokens,
        thoughtTokens: outcome.result.usage.thoughtTokens,
      },
      skipped: null,
    }
  } catch (error) {
    const e = classifyProviderError(error)
    logger.warn('unsplash_rank_failed', { code: e.code })
    return { ...fallback, skipped: `Rangiranje preskočeno: ${e.message}` }
  }
}

export function orientationFor(aspect: string): UnsplashOrientation {
  if (aspect === '16:9') return 'landscape'
  if (aspect === '1:1') return 'squarish'
  return 'portrait'
}

export interface PickedPhoto {
  photo: UnsplashPhoto
  bytes: Buffer
  attribution: UnsplashAttribution
  rank: RankResult | null
}

/** Za šablon: zadata fotografija ili pretraga + rangiranje, zatim beleženje preuzimanja. */
export async function pickPhotoForTemplate(input: {
  photoId?: string | null
  query?: string | null
  aspect: string
  headline: string
  brandName: string
  photoStyle?: string | null
}): Promise<PickedPhoto | null> {
  if (!isUnsplashConfigured()) return null
  let photo: UnsplashPhoto | null = null
  let rank: RankResult | null = null
  if (input.photoId) {
    photo = await getPhoto(input.photoId)
  } else {
    const query = (input.query ?? input.headline).trim()
    if (!query) return null
    const search = await searchPhotos({
      query,
      perPage: 8,
      orientation: orientationFor(input.aspect),
      contentFilter: 'high',
    })
    if (!search.results.length) return null
    rank = await rankCandidates(search.results, {
      headline: input.headline,
      topic: query,
      brandName: input.brandName,
      photoStyle: input.photoStyle,
    })
    photo = rank.ordered[0]?.photo ?? search.results[0]!
  }
  await trackDownload(photo.downloadLocation)
  const bytes = await downloadPhoto(photo, 1600)
  return { photo, bytes, attribution: attributionFor(photo), rank }
}
