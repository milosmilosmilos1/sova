import 'server-only'

import { createHash } from 'node:crypto'

import { ApiError } from '@/lib/api/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

/**
 * Idempotency-Key (brif 14.1, korak 5): isti ključ već obrađen → sačuvan odgovor;
 * još u toku → 409; isti ključ sa drugim telom → 409.
 */
export interface IdempotencyScope {
  workspaceId: string
  userId: string | null
  /** naziv rute, npr. 'ai.text' */
  scope: string
  key: string
  /** telo zahteva za hash (da isti ključ ne vrati tuđ rezultat) */
  request: unknown
}

export interface IdempotentResult<T> {
  status: number
  data: T
  replayed: boolean
}

export function hashRequest(request: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(request ?? null))
    .digest('hex')
}

export const idempotencyKeyPattern = /^[A-Za-z0-9_-]{8,128}$/

export async function runIdempotent<T>(
  scope: IdempotencyScope,
  run: () => Promise<{ status: number; data: T }>,
): Promise<IdempotentResult<T>> {
  const admin = createSupabaseAdminClient()
  const requestHash = hashRequest(scope.request)

  const insert = await admin
    .from('idempotency_keys')
    .insert({
      workspace_id: scope.workspaceId,
      user_id: scope.userId,
      scope: scope.scope,
      key: scope.key,
      request_hash: requestHash,
    })
    .select('id')
    .single()

  if (insert.error) {
    if (insert.error.code !== '23505') throw new ApiError('INTERNAL', undefined, { cause: insert.error })
    const { data: existing } = await admin
      .from('idempotency_keys')
      .select('status, request_hash, response_status, response_body, expires_at')
      .eq('workspace_id', scope.workspaceId)
      .eq('scope', scope.scope)
      .eq('key', scope.key)
      .maybeSingle()
    if (!existing)
      throw new ApiError('CONFLICT', 'Zahtev sa istim ključem je u toku. Pokušajte ponovo za trenutak.')
    if (existing.request_hash !== requestHash) {
      throw new ApiError('CONFLICT', 'Isti Idempotency-Key je već iskorišćen za drugačiji zahtev.')
    }
    if (existing.status === 'done') {
      return { status: existing.response_status ?? 200, data: existing.response_body as T, replayed: true }
    }
    throw new ApiError('CONFLICT', 'Zahtev sa istim ključem je u toku. Pokušajte ponovo za trenutak.')
  }

  try {
    const result = await run()
    await admin
      .from('idempotency_keys')
      .update({ status: 'done', response_status: result.status, response_body: result.data as Json })
      .eq('id', insert.data.id)
    return { ...result, replayed: false }
  } catch (error) {
    // Neuspeh ne zaključava ključ: klijent sme da ponovi isti zahtev.
    await admin.from('idempotency_keys').delete().eq('id', insert.data.id)
    throw error
  }
}
