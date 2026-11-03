import { assertViewer, createHandler } from '@/lib/api/handler'
import { pinnedParamsSchema } from '@/lib/schemas/brand'
import { createPinnedDraft } from '@/services/brand-brain/profile-kit'

/** Nacrt od objave za vrh profila (D-146); tekst je već napisan, pa nema tokena. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: pinnedParamsSchema,
    rateLimit: { name: 'pinned-draft', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => createPinnedDraft(assertViewer(viewer), params.id, params.index),
)
