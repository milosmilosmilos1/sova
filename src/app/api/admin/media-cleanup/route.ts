import { assertViewer, createHandler } from '@/lib/api/handler'
import { adminContextFromRequest } from '@/services/admin/audit'
import { requestMediaCleanup } from '@/services/media-cleanup'

/** „Očisti otpad sada” (D-168): jednokratno čišćenje skladišta u pozadini. */
export const POST = createHandler(
  {
    auth: 'admin',
    rateLimit: { name: 'admin-media-cleanup', limit: 3, windowSec: 600, by: 'user' },
  },
  async ({ req, viewer, requestId }) =>
    requestMediaCleanup(adminContextFromRequest(req, assertViewer(viewer), requestId)),
)
