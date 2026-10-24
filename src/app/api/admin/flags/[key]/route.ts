import { assertViewer, createHandler } from '@/lib/api/handler'
import { flagBodySchema, flagParamsSchema } from '@/lib/schemas/admin'
import { adminContextFromRequest } from '@/services/admin/audit'
import { setFlag } from '@/services/admin/platform'

/** Uključivanje i isključivanje feature flaga (po mreži i funkciji). */
export const PATCH = createHandler(
  {
    auth: 'admin',
    params: flagParamsSchema,
    body: flagBodySchema,
    rateLimit: { name: 'admin-action', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, params, body, requestId }) =>
    setFlag(adminContextFromRequest(req, assertViewer(viewer), requestId), params.key, body.enabled),
)
