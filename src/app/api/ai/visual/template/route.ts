import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { visualTemplateSchema } from '@/lib/schemas/visuals'
import { getBrand } from '@/services/brands'
import { requestVisualTemplate } from '@/services/visuals/template'

/** Vizual iz šablona: 2 tokena, 202 + ID posla; status kroz GET /api/ai/jobs/[id]. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: visualTemplateSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'ai.visual.template', body },
      async () => ({
        status: 202,
        data: await requestVisualTemplate(v, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
