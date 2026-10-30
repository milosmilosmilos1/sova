import { assertViewer, createHandler } from '@/lib/api/handler'
import { ideaStatusSchema } from '@/lib/schemas/ideas'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { setIdeaStatus } from '@/services/ideas'

/** Status predloga menja samo administrator platforme. */
export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: ideaStatusSchema },
  async ({ viewer, params, body }) => setIdeaStatus(assertViewer(viewer), params.id, body.status),
)
