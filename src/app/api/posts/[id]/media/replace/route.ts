import { assertViewer, createHandler } from '@/lib/api/handler'
import { replaceMediaSchema } from '@/lib/schemas/posts'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { replacePostMedia } from '@/services/posts/workflow'

/**
 * Zamena medija u zakazanoj ili pauziranoj objavi bez otkazivanja termina (EDGE_CASES U9); posle
 * toga stari medij može da se obriše iz biblioteke.
 */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: replaceMediaSchema },
  async ({ viewer, params, body }) => replacePostMedia(assertViewer(viewer), params.id, body),
)
