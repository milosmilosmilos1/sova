import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'

/**
 * TypeScript omotači oko RPC funkcija iz faze 3 (service role).
 * Rezervacija pre AI poziva, potvrda posle uspeha, oslobađanje pri grešci.
 */
export interface ReserveInput {
  workspaceId: string
  brandId?: string | null
  userId?: string | null
  amount: number
  generationId?: string | null
  ttlMinutes?: number
}

export async function reserveTokens(input: ReserveInput): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('reserve_tokens', {
    p_workspace_id: input.workspaceId,
    p_amount: input.amount,
    p_brand_id: input.brandId ?? undefined,
    p_user_id: input.userId ?? undefined,
    p_generation_id: input.generationId ?? undefined,
    p_ttl_minutes: input.ttlMinutes ?? 15,
  })
  if (error) {
    if (error.message.includes('INSUFFICIENT_TOKENS')) {
      const shortfall = Number(error.hint) || null
      throw new ApiError(
        'INSUFFICIENT_TOKENS',
        shortfall
          ? `Nedostaje ${shortfall} ${shortfall === 1 ? 'token' : 'tokena'} za ovu radnju. Dopunite tokene pa pokušajte ponovo.`
          : undefined,
        { details: { required: input.amount, shortfall } },
      )
    }
    throw mapDbError(error, 'Rezervacija tokena nije uspela.')
  }
  return data as string
}

export async function confirmReservation(
  reservationId: string,
  actualAmount?: number,
): Promise<number | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('confirm_reservation', {
    p_reservation_id: reservationId,
    p_actual_amount: actualAmount,
  })
  if (error) throw mapDbError(error, 'Potvrda rezervacije tokena nije uspela.')
  return (data as number | null) ?? null
}

export async function releaseReservation(reservationId: string, reason: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.rpc('release_reservation', {
    p_reservation_id: reservationId,
    p_reason: reason,
  })
  if (error) logger.error('release_reservation_failed', { reservationId, reason, error })
}

export interface TokenBalance {
  total: number
  reserved: number
  available: number
}

export async function getTokenBalance(workspaceId: string): Promise<TokenBalance> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('workspace_token_totals', { p_workspace_id: workspaceId })
  if (error) throw mapDbError(error)
  const row = Array.isArray(data) ? data[0] : data
  return {
    total: Number(row?.total ?? 0),
    reserved: Number(row?.reserved ?? 0),
    available: Number(row?.available ?? 0),
  }
}
