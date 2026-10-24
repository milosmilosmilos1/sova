import { assertViewer, createHandler } from '@/lib/api/handler'
import { insightsQuerySchema } from '@/lib/schemas/analytics'
import { listInsights } from '@/services/analytics/insights'

/** Sačuvani AI uvidi brenda, najnoviji prvi. */
export const GET = createHandler(
  { auth: 'verified', query: insightsQuerySchema },
  async ({ viewer, query }) => ({
    insights: await listInsights(assertViewer(viewer), query.brandId, query.limit),
  }),
)
