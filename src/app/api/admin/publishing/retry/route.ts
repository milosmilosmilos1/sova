import { assertViewer, createHandler } from '@/lib/api/handler'
import { retryBodySchema } from '@/lib/schemas/admin'
import { adminContextFromRequest } from '@/services/admin/audit'
import { adminRetryTarget } from '@/services/admin/monitor'

/** Ručni ponovni pokušaj neuspele objave iz monitora (brif 16). */
export const POST = createHandler(
  {
    auth: 'admin',
    body: retryBodySchema,
    rateLimit: { name: 'admin-action', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) =>
    adminRetryTarget(adminContextFromRequest(req, assertViewer(viewer), requestId), body.targetId),
)
