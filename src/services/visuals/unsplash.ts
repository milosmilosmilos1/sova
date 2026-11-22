import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
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
  type UnsplashAttribution,
  type UnsplashPhoto,
} from '@/integrations/unsplash/client'
import { getBrand } from '@/services/brands'
import type { MediaAssetRow } from '@/services/media'
import { storeServerImage } from '@/services/visuals/store'

/**
 * Unsplash u Sovi (D-190): korisnik pretražuje i sam bira fotografiju. Rezultati i fotografije u
 * biblioteci se prikazuju sa Unsplash adrese (hotlink), uz autora i Unsplash. Preuzimanje se beleži
 * kad korisnik fotografiju upotrebi, a kopija u skladištu služi za objavu na mreži. Automatski izbor
 * (Autopilot, plan, tokovi, „AI bira”) ide na Pexels, a Unsplash fotografije ne idu AI-ju (D-180).
 */

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

export interface PickedPhoto {
  photo: UnsplashPhoto
  bytes: Buffer
  attribution: UnsplashAttribution
}

/**
 * Za šablon: fotografija koju je korisnik izabrao iz pretrage, zatim beleženje preuzimanja. Po upitu
 * Sova više ne bira sama (D-190): Unsplash API je za izbor korisnika, a automatski izbor ide na Pexels.
 */
export async function pickPhotoForTemplate(input: { photoId?: string | null }): Promise<PickedPhoto | null> {
  if (!isUnsplashConfigured() || !input.photoId) return null
  const photo = await getPhoto(input.photoId)
  await trackDownload(photo.downloadLocation)
  const bytes = await downloadPhoto(photo, 1600)
  return { photo, bytes, attribution: attributionFor(photo) }
}
