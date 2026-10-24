import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { startImpersonationSchema } from '@/lib/schemas/admin'
import { adminContextFromRequest } from '@/services/admin/audit'
import { startImpersonation } from '@/services/admin/impersonation'

/**
 * Početak impersonacije (brif 16, D-070): razlog, režim (read-only podrazumevano, pun uz potvrdu
 * emaila), najviše 30 minuta. Odgovor postavlja potpisan httpOnly cookie i vodi u aplikaciju.
 */
export const POST = createHandler(
  {
    auth: 'admin',
    body: startImpersonationSchema,
    rateLimit: { name: 'admin-impersonate', limit: 10, windowSec: 600, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const ctx = adminContextFromRequest(req, assertViewer(viewer), requestId)
    const started = await startImpersonation(ctx, body)
    return jsonOk(
      {
        sessionId: started.sessionId,
        userId: started.userId,
        userEmail: started.userEmail,
        mode: started.mode,
        expiresAt: started.expiresAt,
        redirect: '/app',
      },
      requestId,
      { status: 201, headers: { 'set-cookie': started.cookie } },
    )
  },
)
