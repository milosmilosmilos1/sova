import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { studioMessageSchema } from '@/lib/schemas/studio'
import { getBrand } from '@/services/brands'
import { sendStudioMessage } from '@/services/studio/chat'

/** Poruka Sovi (D-116): odgovor 1 token; nova objava se plaća kao tekst (2), poruka uz nju ne. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: studioMessageSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'studio.message', body },
      async () => ({
        status: 200,
        data: await sendStudioMessage(v, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
