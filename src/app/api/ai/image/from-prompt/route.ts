import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { imageFromPromptSchema } from '@/lib/schemas/ai'
import { requestImageFromPrompt } from '@/services/ai/image'
import { getBrand } from '@/services/brands'

/** Slika iz prompta: koraci 1–6 sinhrono, 202 + ID posla, ostatak radi Inngest. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: imageFromPromptSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'ai.image.from-prompt', body },
      async () => ({
        status: 202,
        data: await requestImageFromPrompt(v, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
