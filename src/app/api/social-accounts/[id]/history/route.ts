import { assertViewer, createHandler } from '@/lib/api/handler'
import { historyQuerySchema } from '@/lib/schemas/social'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { listHistory } from '@/services/social/accounts'

/** Uvezene objave naloga (najnovije prve). */
export const GET = createHandler(
  { auth: 'user', params: uuidParamSchema, query: historyQuerySchema },
  async ({ viewer, params, query }) => listHistory(assertViewer(viewer), params.id, query.limit),
)
