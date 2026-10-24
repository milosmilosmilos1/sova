import { assertViewer, createHandler } from '@/lib/api/handler'
import { targetActionBodySchema, targetActionParamsSchema } from '@/lib/schemas/notifications'
import { markAssistedDone, retryTarget } from '@/services/posts/publisher'

/**
 * Radnje nad jednim targetom (faza 9b): `retry` za neuspeo target (K12) i `assisted-done`
 * kad je korisnik sam postavio sadržaj na mrežu (telo: `permalink` opciono).
 */
export const POST = createHandler(
  { auth: 'verified', params: targetActionParamsSchema, body: targetActionBodySchema },
  async ({ viewer, params, body }) => {
    const v = assertViewer(viewer)
    if (params.action === 'retry') return retryTarget(v, params.id, params.targetId)
    return markAssistedDone(v, params.id, params.targetId, body.permalink ?? null)
  },
)
