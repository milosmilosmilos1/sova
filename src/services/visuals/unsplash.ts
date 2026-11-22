import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import type { UnsplashSearchInput, UnsplashSelectInput } from '@/lib/schemas/visuals'
import { safeFetch } from '@/lib/ssrf'
import { localPeopleQuery, slugText } from '@/lib/visuals/people'
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
import { orientationOf, type Focus, type SubjectBox } from '@/lib/visuals/focus'
import { getBrand } from '@/services/brands'
import type { MediaAssetRow } from '@/services/media'
import { cropAroundFocus, fullFrame, fullFrameFetchSize, stockFetchSize } from '@/services/visuals/focus-crop'
import { checkPhotos, type CheckedPhoto, type PhotoCandidate } from '@/services/visuals/photo-check'
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

/** Zajednički rok svih provera u jednom izboru i najviše provera po izboru. */
const PHOTO_CHECKS_MS = 12_000
const MAX_PHOTO_CHECKS = 3
/**
 * Sa rokom koraka (D-171): ispod ovoliko preostalog vremena ne kreće nova pretraga ni provera, a
 * izabrana fotografija se preuzima najduže ovoliko, da korak stane u 30 s koliko Netlify daje.
 */
const MIN_LEFT_MS = 1_500
const STORE_TIMEOUT_MS = 6_000

/** Fotografija za proveru: alt, opis, ime iz adrese, manja sličica (ceo kadar) i veličina originala. */
function photoCandidate(photo: UnsplashPhoto): PhotoCandidate<UnsplashPhoto> {
  return {
    item: photo,
    text: [photo.alt, photo.description, slugText(photo.htmlLink)].filter(Boolean).join(' '),
    frames: [resizedUrl(photo.urls.raw, { w: 384, q: 60 })],
    size: photo.width && photo.height ? { width: photo.width, height: photo.height } : null,
  }
}

/** Oblik za pretragu: po okviru slajda (D-169), inače po isečku vrste objave. */
function searchOrientation(input: { crop: 'square' | 'portrait'; frame?: { aspect: number } | null }) {
  if (!input.frame) return input.crop === 'portrait' ? 'portrait' : 'squarish'
  return orientationOf(input.frame.aspect)
}

/**
 * Automatski izbor za „Novu objavu”, plan i Autopilot (D-107): rezultati pretrage redom, ali samo
 * oni koji prikazuju ono o čemu je objava i lepo stoje u objavi (D-167). Fotografija za slajd
 * (`frame`, D-169) se traži u obliku okvira slajda, uzima se samo kad glavni predmet može ceo da
 * stane u okvir i čuva se cela, a isečak pravi stil pri crtanju; fotografija koja je sama objava se
 * seče za vrstu objave oko glavnog predmeta (kvadrat staje na svaku mrežu, 9:16 je za priču).
 * Fotografija koju je brend već dobio se preskače (D-121): traže se sledeće strane i kraći oblici
 * upita, a bez odgovarajuće nove fotografije slajd ostaje u bojama. Izabrane se čuvaju paralelno, i
 * samo onoliko koliko satni limit još prima (D-122); ostatak traži pozivalac sa Pexels-a.
 */
export async function pickUnsplashPhotos(input: {
  workspaceId: string
  brandId: string
  query: string
  count: number
  crop: 'square' | 'portrait'
  uploadedBy: string | null
  /** tema objave, po kojoj provera zna šta fotografija mora da prikazuje (D-167) */
  topic?: string | null
  /** okvir slajda za fotografiju (širina / visina, D-169) */
  frame?: { aspect: number } | null
  /** rok koraka (ms od epohe, D-171): posle njega nema nove pretrage ni provere */
  deadline?: number | null
}): Promise<SelectedPhoto[]> {
  if (!isUnsplashConfigured() || input.count <= 0) return []
  // pretraga i bar jedno praćenje preuzimanja; sa potrošenim limitom se odmah prelazi na Pexels
  const spent = () => {
    const left = unsplashRemaining()
    return left !== null && left < 2
  }
  const late = () => Boolean(input.deadline) && input.deadline! - Date.now() < MIN_LEFT_MS
  if (spent() || late()) return []
  const used = await usedStockIds(input.brandId, 'unsplash')
  const chosen: Array<CheckedPhoto<UnsplashPhoto>> = []
  // upit koji pominje ljude traži evropske ljude (D-136); fotografije se pre preuzimanja proveravaju
  // samo po opisu (D-180), prema prvobitnom upitu i kad pretraga ide kraćim oblikom (D-167)
  const variants = queryVariants(input.query).map(localPeopleQuery)
  const subject = { topic: input.topic, query: input.query }
  const until = Math.min(Date.now() + PHOTO_CHECKS_MS, input.deadline ?? Number.POSITIVE_INFINITY)
  let checks = 0
  search: for (let v = 0; v < variants.length && chosen.length < input.count; v++) {
    for (let page = 1; page <= (v === 0 ? 3 : 1) && chosen.length < input.count; page++) {
      if (spent() || late()) break search
      const r = await searchPhotos({
        query: variants[v]!,
        perPage: 30,
        page,
        orientation: searchOrientation(input),
        contentFilter: 'high',
      })
      const fresh = r.results.filter((p) => !used.has(p.id))
      for (let i = 0; i < fresh.length && chosen.length < input.count;) {
        if (late() || checks++ >= MAX_PHOTO_CHECKS) break search
        // stok se proverava samo po opisu, bez modela (D-180): cela strana odjednom
        const batch = fresh.slice(i)
        i = fresh.length
        for (const photo of batch) used.add(photo.id)
        const allowed = await checkPhotos(batch.map(photoCandidate), {
          label: 'unsplash',
          until,
          subject,
          frame: input.frame,
        })
        chosen.push(...allowed.slice(0, input.count - chosen.length))
      }
      if (page >= r.totalPages) break
    }
  }
  // svaka upotrebljena fotografija troši jedan zahtev (praćenje preuzimanja)
  const room = unsplashRemaining()
  const take = room === null ? chosen : chosen.slice(0, Math.max(0, room))
  const stored = await mapLimit(take, STOCK_PARALLEL, async ({ item: photo, focus, box }) => {
    try {
      return await storePickedPhoto(photo, focus, box ?? null, input)
    } catch (error) {
      logger.warn('unsplash_pick_store_failed', { photoId: photo.id, error })
      return null
    }
  })
  return stored.filter((p): p is SelectedPhoto => Boolean(p))
}

async function storePickedPhoto(
  photo: UnsplashPhoto,
  focus: Focus | null,
  box: SubjectBox | null,
  input: {
    workspaceId: string
    brandId: string
    crop: 'square' | 'portrait'
    uploadedBy: string | null
    frame?: { aspect: number } | null
    deadline?: number | null
  },
): Promise<SelectedPhoto> {
  const attribution = attributionFor(photo)
  // za slajd ceo kadar (isečak za okvir pravi stil, D-169); za objavu isečak oko predmeta (D-167)
  const full = Boolean(input.frame)
  const size = full
    ? fullFrameFetchSize(photo.width, photo.height)
    : stockFetchSize(photo.width, photo.height, input.crop)
  // praćenje preuzimanja ide uporedo sa preuzimanjem (greška praćenja se samo beleži)
  const [, res] = await Promise.all([
    trackDownload(photo.downloadLocation),
    safeFetch(resizedUrl(photo.urls.raw, { ...size, q: 90 }), {
      timeoutMs: input.deadline ? STORE_TIMEOUT_MS : 20_000,
      maxBytes: 15 * 1024 * 1024,
      headers: { accept: 'image/*' },
    }),
  ])
  if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Fotografija nije mogla da se preuzme sa Unsplash-a.')
  const cropped = full
    ? { bytes: await fullFrame(res.body), focus, box }
    : { ...(await cropAroundFocus(res.body, input.crop, focus)), box: null }
  const asset = await storeServerImage({
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    bytes: cropped.bytes,
    mimeType: 'image/jpeg',
    source: 'unsplash',
    folder: 'unsplash',
    altText: photo.alt ?? photo.description ?? null,
    tags: ['unsplash'],
    attribution: { provider: 'unsplash', ...attribution } as unknown as Record<string, string>,
    sourceData: {
      photoId: photo.id,
      crop: full ? 'full' : input.crop,
      urls: photo.urls,
      downloadLocation: photo.downloadLocation,
      photographer: photo.user,
      ...(cropped.focus ? { focus: cropped.focus } : {}),
      ...(cropped.box ? { subject: cropped.box } : {}),
      // automatski izbor po opisu (D-180): nacrt ne traži nove fotografije (D-170)
      pick: 'text',
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

/**
 * Redosled kandidata za šablon: redosled relevantnosti Unsplash-a. Ranije je Gemini rangirao po
 * sličicama; Unsplash ne dozvoljava AI obradu svojih fotografija (D-180), pa model slike ne gleda.
 */
export function rankCandidates(candidates: UnsplashPhoto[]): RankResult {
  return {
    ordered: candidates.map((photo, i) => ({
      photo,
      score: 10 - i,
      reason: 'Redosled relevantnosti Unsplash-a',
    })),
    model: null,
    usage: ZERO,
    skipped: null,
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
    // samo fotografija čiji opis odgovara temi i ne pominje ljude (D-180), bez slanja slika modelu
    const allowed = (
      await checkPhotos(search.results.map(photoCandidate), {
        label: 'unsplash-template',
        subject: { topic: input.headline, query },
      })
    ).map((c) => c.item)
    if (!allowed.length) return null
    rank = rankCandidates(allowed)
    photo = rank.ordered[0]?.photo ?? allowed[0]!
  }
  await trackDownload(photo.downloadLocation)
  const bytes = await downloadPhoto(photo, 1600)
  return { photo, bytes, attribution: attributionFor(photo), rank }
}
