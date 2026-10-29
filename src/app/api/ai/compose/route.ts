import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { composeSchema } from '@/lib/schemas/ai'
import { composePost } from '@/services/ai/compose'
import { getBrand } from '@/services/brands'

/** „Nova objava” (D-107): tekst, vizual i nacrt objave iz jednog zahteva; tekst 2 tokena, šablon 2. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: composeSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'ai.compose', body },
      async () => ({ status: 200, data: await composePost(v, body, { requestId, idempotencyKey: key }) }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
