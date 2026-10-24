import { assertViewer, createHandler } from '@/lib/api/handler'
import { analyticsRangeQuerySchema } from '@/lib/schemas/analytics'
import { getOverview } from '@/services/analytics/overview'

/** Pregled analitike za brend i period (podrazumevano poslednjih 30 dana). */
export const GET = createHandler(
  {
    auth: 'verified',
    query: analyticsRangeQuerySchema,
    rateLimit: { name: 'analytics', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) =>
    getOverview(assertViewer(viewer), query.brandId, query.from ?? null, query.to ?? null),
)
