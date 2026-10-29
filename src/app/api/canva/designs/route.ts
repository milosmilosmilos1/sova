import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { canvaDesignListSchema, canvaDesignSchema } from '@/lib/schemas/visuals'
import { getBrand } from '@/services/brands'
import { createCanvaDesign, listCanvaDesigns } from '@/services/canva/designs'

/** Dizajni korisnika iz Canve za uvoz u biblioteku (D-104); bez tokena. */
export const GET = createHandler(
  {
    auth: 'user',
    query: canvaDesignListSchema,
    rateLimit: { name: 'canva-list', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) => listCanvaDesigns(assertViewer(viewer), query),
)

/** Novi Canva dizajn (opciono od slike iz biblioteke): vraća edit_url; 2 tokena. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: canvaDesignSchema,
    rateLimit: { name: 'canva', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'canva.design', body },
      async () => ({ status: 200, data: await createCanvaDesign(v, body, { requestId }) }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
