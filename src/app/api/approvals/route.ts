import { assertViewer, createHandler } from '@/lib/api/handler'
import { reviewListQuerySchema } from '@/lib/schemas/review'
import { listReviewDesk } from '@/services/posts/review'

/** Odobravanje (D-108): nacrti po karticama (čekaju, odobreni, objavljeni, preskočeni, svi). */
export const GET = createHandler({ auth: 'user', query: reviewListQuerySchema }, async ({ viewer, query }) =>
  listReviewDesk(assertViewer(viewer), query),
)
