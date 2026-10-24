import { assertViewer, createHandler } from '@/lib/api/handler'
import { unsplashSearchSchema } from '@/lib/schemas/visuals'
import { searchUnsplash } from '@/services/visuals/unsplash'

/** Pretraga Unsplash fotografija (hotlink pregledi, keš 1 h); izbor ide kroz /api/unsplash/select. */
export const GET = createHandler(
  {
    auth: 'user',
    query: unsplashSearchSchema,
    rateLimit: { name: 'unsplash-search', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) => searchUnsplash(assertViewer(viewer), query),
)
