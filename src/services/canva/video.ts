import 'server-only'

import { toApiError } from '@/lib/ai/errors'
import { ApiError, type ApiErrorCode } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { env } from '@/lib/env'
import { enqueueCanvaVideoExport } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { CanvaExportInput } from '@/lib/schemas/visuals'
import { safeFetch, SsrfError } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { canvaJobFailureMessage, getDesign, getExportJob, startExport } from '@/integrations/canva/client'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { getBrand } from '@/services/brands'
import { getCanvaAccessToken } from '@/services/canva/connection'
import { maxVideoBytes, storeServerVideo } from '@/services/media'
import type { Json } from '@/types/database'

/**
 * Video iz Canve (D-104): korisnikov dizajn ide u biblioteku brenda kao MP4. Canva video pravi i po
 * nekoliko minuta, a Netlify funkcija traje najviše 60 s, pa posao vodi Inngest (`canva-export-video`):
 * pokretanje, provera na nekoliko sekundi, pa preuzimanje i čuvanje u istom koraku, da link za
 * preuzimanje ne izađe sa servera. Prvo 1080p; ako je fajl veći od limita skladišta, još jednom u 720p.
 * Posao je `canva_export` od 2 tokena, kao uvoz slike.
 */
export const VIDEO_RESOLUTIONS = ['1080p', '720p'] as const
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

export interface CanvaVideoAccepted {
  generationId: string
  status: 'queued'
  tokensReserved: number
}

export async function requestCanvaVideoExport(
  viewer: Viewer,
  input: CanvaExportInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<CanvaVideoAccepted> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  // bez veze posao ne bi ni počeo, pa se proverava pre rezervacije tokena
  await getCanvaAccessToken(brand.workspace_id, viewer.user.id)

  const price = await getTokenPrice('canva_export')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'canva_export',
    tokens: price,
    input: { designId: input.designId, format: 'mp4' },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
    status: 'queued',
  })
  try {
    await enqueueCanvaVideoExport(generationId, brand.workspace_id)
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
  return { generationId, status: 'queued', tokensReserved: price }
}

interface VideoJob {
  id: string
  workspace_id: string
  brand_id: string | null
  user_id: string | null
  started_at: string | null
  token_reservation_id: string | null
  input: { designId: string }
}

/** Posao koji još traje; završen ili nepostojeći se preskače (Inngest ponavlja korake). */
async function loadJob(generationId: string): Promise<VideoJob | null> {
  const { data } = await createSupabaseAdminClient()
    .from('ai_generations')
    .select('id, workspace_id, brand_id, user_id, status, started_at, token_reservation_id, input')
    .eq('id', generationId)
    .maybeSingle()
  if (!data || (data.status !== 'queued' && data.status !== 'running')) return null
  return data as unknown as VideoJob
}

/**
 * Trajne greške (veza sa Canvom, obrisan dizajn, Pro elementi, nečitljiv video) završavaju posao
 * odmah i vraćaju tokene; limit zahteva i greške na našoj strani ponavlja Inngest.
 */
async function guarded<T>(job: VideoJob, fn: () => Promise<T>): Promise<T | { status: 'failed' }> {
  try {
    return await fn()
  } catch (error) {
    if (!(error instanceof ApiError) || error.code === 'RATE_LIMITED' || error.code === 'INTERNAL')
      throw error
    await failGeneration(job.id, job.token_reservation_id, error.code, error.message)
    logger.warn('canva_video_failed', { generationId: job.id, code: error.code })
    return { status: 'failed' }
  }
}

/** Korak 1: Canva posao za MP4. Orijentacija po sličici, jer izlaz uvek prati odnos stranica dizajna. */
export async function startCanvaVideoExport(
  generationId: string,
  resolution: VideoResolution,
): Promise<{ status: 'started'; jobId: string } | { status: 'failed' | 'skipped' }> {
  const job = await loadJob(generationId)
  if (!job) return { status: 'skipped' }
  return guarded(job, async () => {
    await createSupabaseAdminClient()
      .from('ai_generations')
      .update({
        status: 'running',
        started_at: job.started_at ?? new Date().toISOString(),
        progress: { step: 'exporting', message: 'Canva pravi video…' },
      })
      .eq('id', generationId)
    const token = await getCanvaAccessToken(job.workspace_id, job.user_id ?? '')
    const design = await getDesign(token, job.input.designId)
    const thumb = design.thumbnail
    const orientation = thumb && thumb.width > thumb.height ? 'horizontal' : 'vertical'
    const exportJob = await startExport(token, {
      designId: job.input.designId,
      format: { type: 'mp4', quality: `${orientation}_${resolution}` },
    })
    return { status: 'started' as const, jobId: exportJob.id }
  })
}

/**
 * Korak 2, ponavlja se dok Canva ne završi; gotov video se preuzima i čuva u istom koraku.
 * `too_large` znači da fajl prelazi limit skladišta, pa posao probava manju rezoluciju.
 */
export async function collectCanvaVideoExport(
  generationId: string,
  exportJobId: string,
  resolution: VideoResolution,
): Promise<{ status: 'in_progress' | 'too_large' | 'succeeded' | 'failed' | 'skipped' }> {
  const job = await loadJob(generationId)
  if (!job) return { status: 'skipped' }
  return guarded(job, async () => {
    const token = await getCanvaAccessToken(job.workspace_id, job.user_id ?? '')
    const exportJob = await getExportJob(token, exportJobId)
    if (exportJob.status === 'in_progress') return { status: 'in_progress' as const }
    const url = exportJob.urls[0]
    if (exportJob.status === 'failed' || !url)
      throw new ApiError('PROVIDER_ERROR', canvaJobFailureMessage(exportJob.errorCode))

    let bytes: Buffer
    try {
      const res = await safeFetch(url, {
        timeoutMs: 40_000,
        maxBytes: maxVideoBytes(),
        headers: { accept: 'video/mp4' },
      })
      if (!res.ok) throw new ApiError('PROVIDER_ERROR', 'Video iz Canve nije mogao da se preuzme.')
      bytes = res.body
    } catch (error) {
      if (error instanceof SsrfError && error.code === 'TOO_LARGE') return { status: 'too_large' as const }
      throw error
    }
    const asset = await storeServerVideo({
      workspaceId: job.workspace_id,
      brandId: job.brand_id,
      bytes,
      mime: 'video/mp4',
      source: 'canva',
      folder: 'canva',
      uploadedBy: job.user_id,
      tags: ['canva'],
      attribution: { provider: 'canva', designId: job.input.designId },
      sourceData: { designId: job.input.designId, format: 'mp4', resolution },
      generationId,
    })

    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        provider: 'canva',
        model: 'canva-export-mp4',
        output: {
          assetId: asset.id,
          designId: job.input.designId,
          resolution,
          durationMs: asset.duration_ms,
        } as unknown as NonNullable<Json>,
        output_asset_id: asset.id,
        duration_ms: job.started_at ? Date.now() - new Date(job.started_at).getTime() : null,
        cost_usd: 0,
        progress: null,
      })
      .eq('id', generationId)
    if (job.token_reservation_id) await confirmReservation(job.token_reservation_id)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { status: 'succeeded' as const }
  })
}

function endMessage(reason: 'timeout' | 'too_large' | 'internal'): [ApiErrorCode, string] {
  if (reason === 'timeout') return ['PROVIDER_ERROR', 'Canva predugo pravi video. Pokušajte ponovo kasnije.']
  if (reason === 'too_large')
    return [
      'PAYLOAD_TOO_LARGE',
      `Video iz Canve je veći od ${env.MEDIA_MAX_VIDEO_MB} MB i u 720p. Skratite ga u Canvi pa uvezite ponovo.`,
    ]
  return ['INTERNAL', 'Uvoz videa je prekinut zbog greške na našoj strani. Pokušajte ponovo.']
}

/** Kraj bez videa: isteklo čekanje, prevelik fajl i u 720p, ili pad posla. Tokeni se vraćaju. */
export async function failCanvaVideoExport(
  generationId: string,
  reason: 'timeout' | 'too_large' | 'internal',
): Promise<{ status: 'failed' | 'skipped' }> {
  const job = await loadJob(generationId)
  if (!job) return { status: 'skipped' }
  const [code, message] = endMessage(reason)
  await failGeneration(job.id, job.token_reservation_id, code, message)
  return { status: 'failed' }
}
