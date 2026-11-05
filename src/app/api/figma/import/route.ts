import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaImportSchema } from '@/lib/schemas/figma'
import { importFigmaFrames } from '@/services/figma/files'

/** Uvoz izabranih okvira kao slika u biblioteku brenda (D-161), redom kojim su izabrani. */
export const POST = createHandler(
  {
    auth: 'user',
    body: figmaImportSchema,
    rateLimit: { name: 'figma-import', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => importFigmaFrames(assertViewer(viewer), body),
)
