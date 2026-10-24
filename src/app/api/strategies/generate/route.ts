import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { generateStrategySchema } from '@/lib/schemas/strategy'
import { getBrand } from '@/services/brands'
import { requestStrategy } from '@/services/strategy/strategy'

/** Strategija sadržaja: 20 tokena, 202 + ID posla; najviše 3 na sat po korisniku (ARCHITECTURE 7). */
export const POST = createHandler(
  {
    auth: 'verified',
    body: generateStrategySchema,
    rateLimit: { name: 'strategy-generate', limit: 3, windowSec: 3600, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'strategy.generate', body },
      async () => ({
        status: 202,
        data: await requestStrategy(v, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
