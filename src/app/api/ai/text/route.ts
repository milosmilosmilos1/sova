import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { textRequestSchema } from '@/lib/schemas/ai'
import { generatePostText } from '@/services/ai/text'
import { getBrand } from '@/services/brands'

/**
 * Tekst za objavu: sinhrono, 2 tokena. Redosled iz brifa 14.1:
 * auth → pristup → Zod → rate limit → Idempotency-Key → rezervacija → AI → upis → potvrda.
 */
export const POST = createHandler(
  {
    auth: 'verified',
    body: textRequestSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'ai.text', body },
      async () => ({
        status: 200,
        data: await generatePostText(v, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
