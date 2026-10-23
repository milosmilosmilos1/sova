import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { imageFromPhotoSchema } from '@/lib/schemas/ai'
import { requestImageFromPhoto } from '@/services/ai/image'
import { getBrand } from '@/services/brands'

/** Slika iz fotografije korisnika: 202 + ID posla. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: imageFromPhotoSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'ai.image.from-photo', body },
      async () => ({
        status: 202,
        data: await requestImageFromPhoto(v, body, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
