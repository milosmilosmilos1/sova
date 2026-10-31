import { assertViewer, createHandler } from '@/lib/api/handler'
import { postsBulkSchema } from '@/lib/schemas/bulk'
import { bulkPosts } from '@/services/posts/bulk'

/** Označene objave odjednom (D-119): brisanje, preskakanje ili zakazivanje (D-127), uz izveštaj po stavci. */
export const POST = createHandler(
  {
    auth: 'user',
    body: postsBulkSchema,
    rateLimit: { name: 'posts-bulk', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => bulkPosts(assertViewer(viewer), body.ids, body.action, body.at),
)
