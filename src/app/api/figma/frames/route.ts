import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaFramesQuerySchema } from '@/lib/schemas/figma'
import { listFigmaFrames } from '@/services/figma/files'

/** Okviri Figma fajla sa sličicama (D-161); dva Figma zahteva, pa je limit nizak. */
export const GET = createHandler(
  {
    auth: 'user',
    query: figmaFramesQuerySchema,
    rateLimit: { name: 'figma-frames', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) => listFigmaFrames(assertViewer(viewer), query),
)
