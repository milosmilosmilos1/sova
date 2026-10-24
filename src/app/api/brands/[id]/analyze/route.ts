import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { analyzeRequestSchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { listCrawls, requestAnalysis } from '@/services/brand-brain/crawl'
import { getBrand } from '@/services/brands'

/** Pokretanje analize sajta: 202 + ID analize; napredak kroz GET /analysis/[crawlId] ili Realtime. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: analyzeRequestSchema,
    rateLimit: { name: 'brand-analyze', limit: 6, windowSec: 600, by: 'user' },
  },
  async ({ req, viewer, params, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, params.id)
    const result = await idempotentJson(
      {
        req,
        workspaceId: brand.workspace_id,
        userId: v.user.id,
        scope: 'brand.analyze',
        body: { brandId: brand.id, ...body },
      },
      async () => ({
        status: 202,
        data: await requestAnalysis(v, brand.id, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)

/** Poslednje analize brenda (najnovija prva). */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  listCrawls(assertViewer(viewer), params.id),
)
