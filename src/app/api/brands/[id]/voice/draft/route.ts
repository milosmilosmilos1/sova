import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { draftVoice } from '@/services/brand-brain/voice'
import { getBrand } from '@/services/brands'

/** Sinhron poziv Gemini-ja sa rezervnim modelom. */
export const maxDuration = 60

/** Predlog glasa brenda iz profila sa sajta, PDF-a i ranijih objava: 2 tokena, ništa se ne čuva. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, params, requestId }) => {
    const v = assertViewer(viewer)
    const key = requireIdempotencyKey(req)
    const brand = await getBrand(v, params.id)
    const result = await idempotentJson(
      {
        req,
        workspaceId: brand.workspace_id,
        userId: v.user.id,
        scope: 'brand.voice.draft',
        body: { brandId: brand.id },
      },
      async () => ({ status: 200, data: await draftVoice(v, brand.id, { requestId, idempotencyKey: key }) }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
