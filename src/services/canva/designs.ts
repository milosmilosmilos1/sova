import 'server-only'

import { toApiError } from '@/lib/ai/errors'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { CanvaDesignInput, CanvaDesignListInput, CanvaExportInput } from '@/lib/schemas/visuals'
import { safeFetch } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import {
  createDesign,
  exportDesign,
  listDesigns,
  uploadAsset,
  type CanvaDesign,
  type CanvaDesignSummary,
} from '@/integrations/canva/client'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { getBrand } from '@/services/brands'
import { getCanvaAccessToken } from '@/services/canva/connection'
import { downloadAsset, getAsset, signedUrl, type MediaAssetRow } from '@/services/media'
import { storeServerImage } from '@/services/visuals/store'
import type { Json } from '@/types/database'

/**
 * Canva tok bez Autofill-a (docs/INTEGRATIONS.md 11): slika iz biblioteke → Canva asset → dizajn
 * sa edit_url (korisnik dorađuje u Canvi) → export → kopija u biblioteci. Po 2 tokena.
 * Uvoz gotovih dizajna (D-104) koristi isti export; video ide kroz `services/canva/video`.
 */
export async function listCanvaDesigns(
  viewer: Viewer,
  input: CanvaDesignListInput,
): Promise<{ items: CanvaDesignSummary[]; continuation: string | null }> {
  await requireMembership(viewer, input.workspaceId, EDIT_ROLES)
  const accessToken = await getCanvaAccessToken(input.workspaceId, viewer.user.id)
  return listDesigns(accessToken, { query: input.query, continuation: input.continuation })
}

export interface CanvaDesignResult {
  generationId: string
  design: CanvaDesign
  tokensCharged: number
}

export async function createCanvaDesign(
  viewer: Viewer,
  input: CanvaDesignInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<CanvaDesignResult> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const accessToken = await getCanvaAccessToken(brand.workspace_id, viewer.user.id)

  let sourceAsset: MediaAssetRow | null = null
  if (input.mediaAssetId) {
    sourceAsset = await getAsset(viewer, input.mediaAssetId)
    if (sourceAsset.kind !== 'image') throw new ApiError('VALIDATION', 'U Canvu može da ide samo slika.')
  }

  const price = await getTokenPrice('canva_design')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'canva_design',
    tokens: price,
    input: {
      mediaAssetId: input.mediaAssetId ?? null,
      title: input.title ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
    },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })
  const started = Date.now()
  try {
    let canvaAssetId: string | null = null
    if (sourceAsset) {
      const bytes = await downloadAsset(sourceAsset)
      canvaAssetId = await uploadAsset(accessToken, { bytes, name: `${brand.name} – Sova`.slice(0, 50) })
    }
    const design = await createDesign(accessToken, {
      assetId: canvaAssetId,
      title: input.title ?? `${brand.name} – objava (Sova)`,
      width: input.width ?? (canvaAssetId ? undefined : 1080),
      height: input.height ?? (canvaAssetId ? undefined : 1080),
    })
    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        provider: 'canva',
        model: 'canva-design',
        output: {
          designId: design.id,
          editUrl: design.editUrl,
          viewUrl: design.viewUrl,
          thumbnailUrl: design.thumbnailUrl,
          canvaAssetId,
        } as unknown as NonNullable<Json>,
        duration_ms: Date.now() - started,
        cost_usd: 0,
      })
      .eq('id', generationId)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { generationId, design, tokensCharged: price }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

export interface CanvaExportResult {
  generationId: string
  asset: { id: string; url: string; width: number | null; height: number | null; mimeType: string }
  tokensCharged: number
}

export async function exportCanvaDesign(
  viewer: Viewer,
  input: CanvaExportInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<CanvaExportResult> {
  const format = input.format
  if (format === 'mp4') throw new ApiError('VALIDATION', 'Video se uvozi kao pozadinski posao.')
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const accessToken = await getCanvaAccessToken(brand.workspace_id, viewer.user.id)

  const price = await getTokenPrice('canva_export')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'canva_export',
    tokens: price,
    input: { designId: input.designId, format: input.format },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })
  const started = Date.now()
  try {
    const urls = await exportDesign(accessToken, { designId: input.designId, format })
    const res = await safeFetch(urls[0]!, {
      timeoutMs: 30_000,
      maxBytes: 40 * 1024 * 1024,
      headers: { accept: 'image/*' },
    })
    if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Canva export nije mogao da se preuzme.')
    const mimeType = res.contentType.includes('png') ? 'image/png' : 'image/jpeg'
    const asset = await storeServerImage({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      bytes: res.body,
      mimeType,
      source: 'canva',
      folder: 'canva',
      tags: ['canva'],
      attribution: { provider: 'canva', designId: input.designId },
      sourceData: { designId: input.designId, format: input.format, pages: urls.length },
      generationId,
      uploadedBy: viewer.user.id,
    })
    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        provider: 'canva',
        model: 'canva-export',
        output: {
          assetId: asset.id,
          designId: input.designId,
          pages: urls.length,
        } as unknown as NonNullable<Json>,
        output_asset_id: asset.id,
        duration_ms: Date.now() - started,
        cost_usd: 0,
      })
      .eq('id', generationId)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return {
      generationId,
      asset: {
        id: asset.id,
        url: await signedUrl(asset),
        width: asset.width,
        height: asset.height,
        mimeType: asset.mime_type,
      },
      tokensCharged: price,
    }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}
