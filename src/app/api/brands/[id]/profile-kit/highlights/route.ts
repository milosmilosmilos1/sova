import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { generateHighlights } from '@/services/brand-brain/profile-kit'
import { getBrand } from '@/services/brands'

/** Sinhron poziv Gemini-ja sa rezervnim modelom. */
export const maxDuration = 60

/** Instagram highlights iz profila brenda (D-144): naslovi, ikonice i kadrovi priča, 3 tokena. */
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
        scope: 'brand.profile_kit.highlights',
        body: { brandId: brand.id },
      },
      async () => ({
        status: 200,
        data: await generateHighlights(v, brand.id, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
