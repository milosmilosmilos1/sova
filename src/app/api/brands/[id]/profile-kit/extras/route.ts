import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson, requireIdempotencyKey } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { profileExtrasUpdateSchema } from '@/lib/schemas/profile-kit'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { generateProfileExtras } from '@/services/brand-brain/profile-kit'
import { saveProfileExtras } from '@/services/brand-brain/profile-kit-edit'
import { getBrand } from '@/services/brands'

/** Sinhron poziv Gemini-ja sa rezervnim modelom. */
export const maxDuration = 60

/** Dodaci za profile po mreži (D-146): table, plejliste, najava, usluge, pitanja i objave za vrh, 3 tokena. */
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
        scope: 'brand.profile_kit.extras',
        body: { brandId: brand.id },
      },
      async () => ({
        status: 200,
        data: await generateProfileExtras(v, brand.id, { requestId, idempotencyKey: key }),
      }),
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)

/** Ručna izmena dodataka za profile (D-166), u granicama mreža. */
export const PATCH = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: profileExtrasUpdateSchema,
    rateLimit: { name: 'profile-kit-edit', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => saveProfileExtras(assertViewer(viewer), params.id, body.extras),
)
