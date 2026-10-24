import { assertViewer, createHandler } from '@/lib/api/handler'
import { auditQuerySchema } from '@/lib/schemas/admin'
import { adminContextFromRequest, auditCsv, logAdminAction } from '@/services/admin/audit'

/** BOM da Excel ispravno pročita UTF-8 (š, đ, č). */
const BOM = String.fromCharCode(0xfeff)

/** Izvoz audit loga u CSV po istim filterima kao pretraga (najviše 1.000 redova). */
export const GET = createHandler(
  {
    auth: 'admin',
    query: auditQuerySchema,
    rateLimit: { name: 'admin-export', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, query, requestId }) => {
    const ctx = adminContextFromRequest(req, assertViewer(viewer), requestId)
    const filters = {
      adminEmail: query.admin,
      action: query.action,
      target: query.target,
      from: query.from,
      to: query.to,
    }
    const csv = await auditCsv(filters)
    await logAdminAction(ctx, { action: 'audit.export', targetType: 'admin_audit_log', after: filters })
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return new Response(BOM + csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="sova-audit-${day}.csv"`,
        'cache-control': 'no-store',
      },
    })
  },
)
