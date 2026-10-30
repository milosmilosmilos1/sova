import { assertViewer, createHandler } from '@/lib/api/handler'
import { deskVersionSchema } from '@/lib/schemas/review'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { regeneratePost } from '@/services/posts/review'

/** „Generiši ponovo”: nov tekst (2 tokena) i novi slajdovi istim stilom; verzija štiti od dvostrukog klika. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: deskVersionSchema,
    rateLimit: { name: 'ai-generate', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => regeneratePost(assertViewer(viewer), params.id, body.version),
)
