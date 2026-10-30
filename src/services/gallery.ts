import 'server-only'

import sharp from 'sharp'

import { toContentLocale } from '@/config/locales'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildPhotoDescribePrompt,
  buildPhotoDescribeSystemPrompt,
  normalizePhotoDescription,
  photoDescribeJsonSchema,
  photoDescribeOutputSchema,
} from '@/lib/ai/prompts/photo-describe'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { GALLERY_SOURCES } from '@/lib/gallery/pick'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { getBrand, type BrandRow } from '@/services/brands'
import { downloadAsset, type MediaAssetRow } from '@/services/media'
import type { Json } from '@/types/database'

/**
 * Galerija brenda (D-114): fotografije koje je brend sam dodao (otpremljene i iz Canve), sa
 * kategorijama i opisom. Opis i kategorija pomažu Sovi da za temu izabere pravu fotografiju u
 * karuselima, pričama, tokovima i Studiju. „Opiši automatski” čita fotografiju (1 token po slici).
 */
export const MAX_CATEGORIES = 30
export const DESCRIBE_BATCH = 6
const LIST_LIMIT = 500

export interface GalleryItem {
  id: string
  url: string
  width: number | null
  height: number | null
  description: string | null
  tags: string[]
  categoryId: string | null
  source: string
  createdAt: string
  lastUsedAt: string | null
}

export interface GalleryCategoryView {
  id: string
  name: string
  count: number
}

export interface GalleryView {
  items: GalleryItem[]
  categories: GalleryCategoryView[]
  stats: { total: number; categories: number; described: number; missing: number; uncategorized: number }
  describePrice: number
}

async function galleryRows(brandId: string): Promise<MediaAssetRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('brand_id', brandId)
    .eq('kind', 'image')
    .in('source', [...GALLERY_SOURCES])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) throw mapDbError(error)
  return data ?? []
}

/** Potpisani URL-ovi u jednom pozivu po bucket-u (galerija ima i stotine slika). */
async function signedUrls(
  rows: Pick<MediaAssetRow, 'bucket' | 'storage_path'>[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const byBucket = new Map<string, string[]>()
  for (const r of rows) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.storage_path])
  const admin = createSupabaseAdminClient()
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, 3600)
    if (error) throw new ApiError('INTERNAL', 'Potpisani linkovi nisu napravljeni.', { cause: error })
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(`${bucket}/${d.path}`, d.signedUrl)
  }
  return out
}

export async function getGallery(
  viewer: Viewer,
  brandId: string,
  filter: { category?: string | null } = {},
): Promise<GalleryView> {
  const brand = await getBrand(viewer, brandId)
  const [rows, { data: categories, error }, describePrice] = await Promise.all([
    galleryRows(brand.id),
    createSupabaseAdminClient()
      .from('gallery_categories')
      .select('id, name')
      .eq('brand_id', brand.id)
      .order('name'),
    getTokenPrice('photo_describe'),
  ])
  if (error) throw mapDbError(error)
  const filtered =
    filter.category === 'none'
      ? rows.filter((r) => !r.category_id)
      : filter.category
        ? rows.filter((r) => r.category_id === filter.category)
        : rows
  const shown = filtered.slice(0, 200)
  const urls = await signedUrls(shown)
  const described = rows.filter((r) => r.description?.trim()).length
  return {
    items: shown.map((r) => ({
      id: r.id,
      url: urls.get(`${r.bucket}/${r.storage_path}`) ?? '',
      width: r.width,
      height: r.height,
      description: r.description,
      tags: r.tags,
      categoryId: r.category_id,
      source: r.source,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
    categories: (categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      count: rows.filter((r) => r.category_id === c.id).length,
    })),
    stats: {
      total: rows.length,
      categories: categories?.length ?? 0,
      described,
      missing: rows.length - described,
      uncategorized: rows.filter((r) => !r.category_id).length,
    },
    describePrice,
  }
}

/** Kategorije sa brojem fotografija, bez potpisanih URL-ova (čarobnjak toka). */
export async function listGalleryCategories(viewer: Viewer, brandId: string): Promise<GalleryCategoryView[]> {
  const brand = await getBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const [{ data: categories, error }, { data: rows }] = await Promise.all([
    admin.from('gallery_categories').select('id, name').eq('brand_id', brand.id).order('name'),
    admin
      .from('media_assets')
      .select('category_id')
      .eq('brand_id', brand.id)
      .eq('kind', 'image')
      .in('source', [...GALLERY_SOURCES])
      .is('deleted_at', null)
      .not('category_id', 'is', null)
      .limit(LIST_LIMIT),
  ])
  if (error) throw mapDbError(error)
  return (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    count: (rows ?? []).filter((r) => r.category_id === c.id).length,
  }))
}

async function editableBrand(viewer: Viewer, brandId: string): Promise<BrandRow> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  return brand
}

function uniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

export async function createCategory(
  viewer: Viewer,
  brandId: string,
  name: string,
): Promise<GalleryCategoryView> {
  const brand = await editableBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('gallery_categories')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
  if ((count ?? 0) >= MAX_CATEGORIES)
    throw new ApiError('PLAN_LIMIT', `Brend može imati najviše ${MAX_CATEGORIES} kategorija.`)
  const { data, error } = await admin
    .from('gallery_categories')
    .insert({ brand_id: brand.id, workspace_id: brand.workspace_id, name: name.trim() })
    .select('id, name')
    .single()
  if (uniqueViolation(error)) throw new ApiError('CONFLICT', 'Kategorija sa tim imenom već postoji.')
  if (error) throw mapDbError(error)
  return { id: data.id, name: data.name, count: 0 }
}

async function loadCategory(viewer: Viewer, categoryId: string) {
  const { data } = await createSupabaseAdminClient()
    .from('gallery_categories')
    .select('*')
    .eq('id', categoryId)
    .maybeSingle()
  if (!data) throw new ApiError('NOT_FOUND', 'Kategorija ne postoji.')
  // pristup brendu proverava RLS (getBrand); tuđa kategorija izgleda kao nepostojeća
  const brand = await getBrand(viewer, data.brand_id).catch(() => {
    throw new ApiError('NOT_FOUND', 'Kategorija ne postoji.')
  })
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  return data
}

export async function renameCategory(
  viewer: Viewer,
  categoryId: string,
  name: string,
): Promise<GalleryCategoryView> {
  const category = await loadCategory(viewer, categoryId)
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('gallery_categories')
    .update({ name: name.trim() })
    .eq('id', category.id)
    .select('id, name')
    .single()
  if (uniqueViolation(error)) throw new ApiError('CONFLICT', 'Kategorija sa tim imenom već postoji.')
  if (error) throw mapDbError(error)
  const { count } = await admin
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', category.id)
    .is('deleted_at', null)
  return { id: data.id, name: data.name, count: count ?? 0 }
}

/** Fotografije iz obrisane kategorije ostaju u galeriji, bez kategorije; tokovi uzimaju celu galeriju. */
export async function deleteCategory(viewer: Viewer, categoryId: string): Promise<void> {
  const category = await loadCategory(viewer, categoryId)
  const { error } = await createSupabaseAdminClient()
    .from('gallery_categories')
    .delete()
    .eq('id', category.id)
  if (error) throw mapDbError(error)
}

/** „Sačuvaj sve izmene”: opis i kategorija za više fotografija u jednom zahtevu. */
export async function updateGalleryItems(
  viewer: Viewer,
  brandId: string,
  items: Array<{ id: string; description?: string | null; categoryId?: string | null }>,
): Promise<{ updated: number }> {
  const brand = await editableBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const ids = [...new Set(items.map((i) => i.id))]
  const { data: owned } = await admin
    .from('media_assets')
    .select('id')
    .eq('brand_id', brand.id)
    .in('source', [...GALLERY_SOURCES])
    .is('deleted_at', null)
    .in('id', ids)
  if ((owned ?? []).length !== ids.length)
    throw new ApiError('VALIDATION', 'Neka fotografija ne pripada galeriji ovog brenda.')
  const categoryIds = [...new Set(items.map((i) => i.categoryId).filter((c): c is string => Boolean(c)))]
  if (categoryIds.length) {
    const { data: cats } = await admin
      .from('gallery_categories')
      .select('id')
      .eq('brand_id', brand.id)
      .in('id', categoryIds)
    if ((cats ?? []).length !== categoryIds.length)
      throw new ApiError('VALIDATION', 'Kategorija ne pripada ovom brendu.')
  }
  let updated = 0
  for (const item of items) {
    const patch: { description?: string | null; category_id?: string | null } = {}
    if (item.description !== undefined) patch.description = item.description?.trim() || null
    if (item.categoryId !== undefined) patch.category_id = item.categoryId
    if (!Object.keys(patch).length) continue
    const { error } = await admin.from('media_assets').update(patch).eq('id', item.id)
    if (error) throw mapDbError(error)
    updated++
  }
  return { updated }
}

export interface DescribeResult {
  described: Array<{ id: string; description: string; tags: string[] }>
  failed: Array<{ id: string; message: string }>
  tokensCharged: number
}

async function describeOne(
  brand: BrandRow,
  asset: MediaAssetRow,
  userId: string,
  price: number,
  requestId: string,
): Promise<{ description: string; tags: string[] }> {
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId,
    type: 'vision_describe',
    tokens: price,
    input: { gallery: true, assetId: asset.id },
    requestId,
  })
  try {
    // dovoljno za opis, a jeftinije: najviše 768 px po dužoj strani
    const jpeg = await sharp(await downloadAsset(asset))
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPhotoDescribeSystemPrompt(),
          prompt: buildPhotoDescribePrompt({
            brandName: brand.name,
            locale: toContentLocale(brand.content_locale),
          }),
          images: [{ data: jpeg.toString('base64'), mimeType: 'image/jpeg' }],
          jsonSchema: photoDescribeJsonSchema(),
          maxOutputTokens: 512,
          temperature: 0.3,
          thinking: 'low',
        }),
      { label: 'photo-describe' },
    )
    const parsed = photoDescribeOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success || !parsed.data.description.trim())
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    const result = normalizePhotoDescription(parsed.data)
    const admin = createSupabaseAdminClient()
    const tags = [...new Set([...asset.tags, ...result.tags])].slice(0, 20)
    const { error } = await admin
      .from('media_assets')
      .update({ description: result.description, tags })
      .eq('id', asset.id)
    if (error) throw mapDbError(error)
    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: result as unknown as NonNullable<Json>,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { description: result.description, tags }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

/**
 * „Opiši automatski”: do šest fotografija po zahtevu, tri istovremeno. Slika koja ne uspe ne troši
 * token i ne obara ostale; ako nema dovoljno tokena za prvu, greška ide korisniku.
 */
export async function describeGalleryPhotos(
  viewer: Viewer,
  brandId: string,
  assetIds: string[],
  meta: { requestId: string },
): Promise<DescribeResult> {
  const brand = await editableBrand(viewer, brandId)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)
  const ids = [...new Set(assetIds)].slice(0, DESCRIBE_BATCH)
  const { data: assets } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('kind', 'image')
    .in('source', [...GALLERY_SOURCES])
    .is('deleted_at', null)
    .in('id', ids)
  if ((assets ?? []).length !== ids.length)
    throw new ApiError('VALIDATION', 'Neka fotografija ne pripada galeriji ovog brenda.')
  const price = await getTokenPrice('photo_describe')
  const result: DescribeResult = { described: [], failed: [], tokensCharged: 0 }
  let firstError: ApiError | null = null
  for (let i = 0; i < assets!.length; i += 3) {
    const chunk = assets!.slice(i, i + 3)
    const settled = await Promise.allSettled(
      chunk.map((a) => describeOne(brand, a, viewer.user.id, price, meta.requestId)),
    )
    settled.forEach((s, j) => {
      const id = chunk[j]!.id
      if (s.status === 'fulfilled') {
        result.described.push({ id, ...s.value })
        result.tokensCharged += price
      } else {
        const api = toApiError(s.reason)
        firstError ??= api
        result.failed.push({ id, message: api.message })
        logger.warn('gallery_describe_failed', { brandId: brand.id, assetId: id, code: api.code })
      }
    })
  }
  // bez nijednog uspeha (npr. nema tokena) korisnik dobija pravu grešku umesto praznog rezultata
  if (!result.described.length && firstError) throw firstError
  return result
}
