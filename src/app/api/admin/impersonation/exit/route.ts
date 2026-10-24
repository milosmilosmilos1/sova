import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { adminContextFromRequest } from '@/services/admin/audit'
import { clearImpersonationCookie, endImpersonation } from '@/services/admin/impersonation'

/** Izlaz iz impersonacije: sesija se zatvara, cookie briše, admin se vraća na detalj korisnika. */
export const POST = createHandler({ auth: 'admin' }, async ({ req, viewer, requestId }) => {
  const ctx = adminContextFromRequest(req, assertViewer(viewer), requestId)
  const result = await endImpersonation(ctx, 'exit')
  return jsonOk(
    { ended: result.ended, redirect: result.userId ? `/admin/users/${result.userId}` : '/admin' },
    requestId,
    { headers: { 'set-cookie': clearImpersonationCookie() } },
  )
})
