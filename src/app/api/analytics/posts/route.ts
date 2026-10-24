import { assertViewer, createHandler } from '@/lib/api/handler'
import { analyticsPostsQuerySchema } from '@/lib/schemas/analytics'
import { listPostMetrics } from '@/services/analytics/overview'

/** Objave sa metrikama u periodu (merodavan snimak po targetu + koji horizonti su povučeni). */
export const GET = createHandler(
  {
    auth: 'verified',
    query: analyticsPostsQuerySchema,
    rateLimit: { name: 'analytics', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) =>
    listPostMetrics(assertViewer(viewer), query.brandId, {
      from: query.from ?? null,
      to: query.to ?? null,
      platform: query.platform ?? null,
      limit: query.limit,
    }),
)
