import { assertViewer, createHandler } from '@/lib/api/handler'
import { crawlParamsSchema } from '@/lib/schemas/brand'
import { cancelAnalysis, getCrawlView } from '@/services/brand-brain/crawl'

/** Status i napredak analize (klijent ovo poziva dok ne stigne Realtime). */
export const GET = createHandler({ auth: 'user', params: crawlParamsSchema }, async ({ viewer, params }) =>
  getCrawlView(assertViewer(viewer), params.id, params.crawlId),
)

/** Otkazivanje analize u toku; tokeni se vraćaju. */
export const DELETE = createHandler(
  { auth: 'verified', params: crawlParamsSchema },
  async ({ viewer, params }) => cancelAnalysis(assertViewer(viewer), params.id, params.crawlId),
)
