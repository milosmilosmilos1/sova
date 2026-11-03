import { assertViewer, createHandler } from '@/lib/api/handler'
import { highlightParamsSchema } from '@/lib/schemas/brand'
import { createHighlightStory } from '@/services/brand-brain/profile-kit'

/** Crtanje slajdova priče (do pet) može da potraje. */
export const maxDuration = 60

/** Priča od kadrova highlights-a u temi brenda, kao nacrt u Odobravanju (D-144); bez tokena. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: highlightParamsSchema,
    rateLimit: { name: 'highlight-story', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => createHighlightStory(assertViewer(viewer), params.id, params.index),
)
