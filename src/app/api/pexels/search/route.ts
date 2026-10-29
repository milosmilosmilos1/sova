import { assertViewer, createHandler } from '@/lib/api/handler'
import { pexelsSearchSchema } from '@/lib/schemas/visuals'
import { searchPexels } from '@/services/visuals/pexels'

/** Pretraga Pexels video snimaka i fotografija (hotlink pregledi, keš 1 h); izbor ide kroz /api/pexels/select. */
export const GET = createHandler(
  {
    auth: 'user',
    query: pexelsSearchSchema,
    rateLimit: { name: 'pexels-search', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) => searchPexels(assertViewer(viewer), query),
)
