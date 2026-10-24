import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getPinterestBoards } from '@/services/social/pinterest'

/** Table Pinterest naloga za izbor u editoru (čitaju se uživo, ne čuvaju se). */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'pinterest-boards', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => getPinterestBoards(assertViewer(viewer), params.id),
)
