import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getLooksView, visitSiteLooks } from '@/services/design/site-looks'

/** Izbor izgleda (D-123): tri predloga sa sajta brenda i sopstveni izgled. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getLooksView(assertViewer(viewer), params.id),
)

/** Sova poseti sajt sada i napravi predloge od boja i fontova koje nađe. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'design-looks-visit', limit: 6, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => visitSiteLooks(assertViewer(viewer), params.id),
)
