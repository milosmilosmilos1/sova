import { assertViewer, createHandler } from '@/lib/api/handler'
import { threadParamsSchema } from '@/lib/schemas/inbox'
import { suggestThreadReply } from '@/services/inbox/threads'

/** Predlog odgovora od Sove: 1 token. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: threadParamsSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, requestId }) => suggestThreadReply(assertViewer(viewer), params.id, { requestId }),
)
