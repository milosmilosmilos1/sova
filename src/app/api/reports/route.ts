import { assertViewer, createHandler } from '@/lib/api/handler'
import { createReportSchema, reportsQuerySchema } from '@/lib/schemas/analytics'
import { createReport, listReports } from '@/services/reports/monthly'

/** Mesečni PDF izveštaji brenda (D-094) sa potpisanim linkovima za preuzimanje (1 h). */
export const GET = createHandler({ auth: 'verified', query: reportsQuerySchema }, async ({ viewer, query }) =>
  listReports(assertViewer(viewer), query.brandId),
)

/** Izveštaj na zahtev za tekući ili raniji mesec; isti mesec ponovo zamenjuje fajl. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: createReportSchema,
    rateLimit: { name: 'reports', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => createReport(assertViewer(viewer), body),
)
