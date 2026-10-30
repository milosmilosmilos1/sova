import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { toggleIdeaVote } from '@/services/ideas'

/** Glas za predlog: uključuje ili isključuje (jedan po korisniku). */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'ideas-vote', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => toggleIdeaVote(assertViewer(viewer), params.id),
)
