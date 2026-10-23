import 'server-only'

import type { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { idempotencyKeyPattern, runIdempotent } from '@/lib/idempotency'

/** Idempotency-Key iz headera; obavezan za rute koje troše tokene. */
export function requireIdempotencyKey(req: NextRequest): string {
  const key = req.headers.get('idempotency-key')?.trim() ?? ''
  if (!idempotencyKeyPattern.test(key)) {
    throw new ApiError(
      'VALIDATION',
      'Header Idempotency-Key je obavezan (8–128 karaktera, slova, brojevi, - i _).',
      {
        fields: { 'Idempotency-Key': ['obavezan'] },
      },
    )
  }
  return key
}

export async function idempotentJson<T>(
  params: { req: NextRequest; workspaceId: string; userId: string; scope: string; body: unknown },
  run: () => Promise<{ status: number; data: T }>,
): Promise<{ status: number; data: T; replayed: boolean }> {
  const key = requireIdempotencyKey(params.req)
  return runIdempotent(
    {
      workspaceId: params.workspaceId,
      userId: params.userId,
      scope: params.scope,
      key,
      request: params.body,
    },
    run,
  )
}
