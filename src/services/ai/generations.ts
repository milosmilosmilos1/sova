import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership } from '@/lib/auth/workspace'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getRateLimitSettings } from '@/lib/tokens/prices'
import { reserveTokens, releaseReservation } from '@/lib/tokens/reservation'
import { signedUrl } from '@/services/media'
import { assertBillingActive, getWorkspacePlan } from '@/services/plans'
import type { Database, Json } from '@/types/database'

export type GenerationRow = Database['public']['Tables']['ai_generations']['Row']
export type GenerationType = Database['public']['Enums']['ai_generation_type']

export interface StartGenerationInput {
  workspaceId: string
  brandId: string | null
  userId: string | null
  type: GenerationType
  tokens: number
  input: NonNullable<Json>
  requestId?: string
  idempotencyKey?: string | null
  status?: 'queued' | 'running'
}

export interface StartedGeneration {
  generationId: string
  reservationId: string | null
}

/**
 * Pravi red u ai_generations i rezerviše tokene (brif 14.1, koraci 6 i 8).
 * Ako rezervacija padne, red se označi kao failed da trag ostane.
 */
export async function startGeneration(input: StartGenerationInput): Promise<StartedGeneration> {
  // posle roka za neuspelo plaćanje nova generisanja staju (T9, K6); besplatne radnje rade
  if (input.tokens > 0) await assertBillingActive(input.workspaceId)
  const admin = createSupabaseAdminClient()
  const row = unwrap(
    await admin
      .from('ai_generations')
      .insert({
        workspace_id: input.workspaceId,
        brand_id: input.brandId,
        user_id: input.userId,
        type: input.type,
        status: input.status ?? 'running',
        input: input.input,
        request_id: input.requestId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        started_at: input.status === 'queued' ? null : new Date().toISOString(),
      })
      .select('id')
      .single(),
    'Zapis generisanja nije napravljen.',
  )

  if (input.tokens === 0) return { generationId: row.id, reservationId: null }

  try {
    const reservationId = await reserveTokens({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      userId: input.userId,
      amount: input.tokens,
      generationId: row.id,
    })
    return { generationId: row.id, reservationId }
  } catch (error) {
    await admin
      .from('ai_generations')
      .update({
        status: 'failed',
        error_code: error instanceof ApiError ? error.code : 'RESERVE_FAILED',
        error_message: error instanceof Error ? error.message : 'Rezervacija nije uspela.',
        finished_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    throw error
  }
}

export async function failGeneration(
  generationId: string,
  reservationId: string | null,
  code: string,
  message: string,
  extra: Partial<Pick<GenerationRow, 'model' | 'fallback_used' | 'duration_ms'>> = {},
): Promise<void> {
  const admin = createSupabaseAdminClient()
  if (reservationId) await releaseReservation(reservationId, code)
  const { error } = await admin
    .from('ai_generations')
    .update({
      status: 'failed',
      error_code: code,
      error_message: message.slice(0, 1000),
      finished_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', generationId)
  if (error) throw mapDbError(error)
}

/** Dnevni limit generisanja za besplatan plan (brif 17.3). */
export async function assertDailyQuota(workspaceId: string): Promise<void> {
  const plan = await getWorkspacePlan(workspaceId)
  if (plan.code !== 'free') return
  const limits = await getRateLimitSettings()
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', since)
    .neq('status', 'failed')
  if ((count ?? 0) >= limits.generate_per_day_free) {
    throw new ApiError(
      'RATE_LIMITED',
      `Besplatan plan dozvoljava ${limits.generate_per_day_free} generisanja dnevno. Nadogradite plan za više.`,
      { retryAfterSec: 3600 },
    )
  }
}

export interface GenerationView {
  id: string
  type: GenerationType
  status: GenerationRow['status']
  model: string | null
  tokensCharged: number
  output: Json | null
  progress: Json | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  finishedAt: string | null
  /** potpisan URL rezultata (slike) ako postoji */
  assetUrl: string | null
  assetId: string | null
}

/** Status posla za klijenta (RLS kroz viewer klijent). */
export async function getGenerationView(viewer: Viewer, generationId: string): Promise<GenerationView> {
  const row = unwrap(
    await viewer.supabase
      .from('ai_generations')
      .select(
        'id, workspace_id, type, status, model, tokens_charged, output, output_asset_id, progress, error_code, error_message, created_at, finished_at',
      )
      .eq('id', generationId)
      .maybeSingle(),
    'Posao ne postoji ili nemate pristup.',
  )
  await requireMembership(viewer, row.workspace_id)
  let assetUrl: string | null = null
  if (row.output_asset_id) {
    const { data: asset } = await viewer.supabase
      .from('media_assets')
      .select('bucket, storage_path')
      .eq('id', row.output_asset_id)
      .maybeSingle()
    if (asset) assetUrl = await signedUrl(asset)
  }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    model: row.model,
    tokensCharged: row.tokens_charged,
    output: row.output,
    progress: row.progress,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    assetUrl,
    assetId: row.output_asset_id,
  }
}
