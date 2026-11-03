import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { generateProfileBios } from '@/services/brand-brain/profile-kit'
import { getBrand } from '@/services/brands'

/** Sinhron poziv Gemini-ja sa rezervnim modelom. */
export const maxDuration = 60

/** Opisi profila za svih osam mreža iz profila brenda (D-143): 3 tokena, čuvaju se uz brend. */
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
        scope: 'brand.profile_kit.bios',
        body: { brandId: brand.id },
      },
      async () => ({
        status: 200,
        data: await generateProfileBios(v, brand.id, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
