import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { canvaExportSchema } from '@/lib/schemas/visuals'
import { getBrand } from '@/services/brands'
import { exportCanvaDesign } from '@/services/canva/designs'

/** Export Canva dizajna u biblioteku brenda (PNG ili JPG); 2 tokena. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: canvaExportSchema,
    rateLimit: { name: 'canva', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'canva.export', body },
      async () => ({ status: 200, data: await exportCanvaDesign(v, body, { requestId }) }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
