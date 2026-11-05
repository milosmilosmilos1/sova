import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaBrandSchema } from '@/lib/schemas/figma'
import { figmaBrandProposal } from '@/services/figma/files'

/** Boje, fontovi i logo iz izabranih okvira, kao predlog za temu brenda (D-161). */
export const POST = createHandler(
  {
    auth: 'user',
    body: figmaBrandSchema,
    rateLimit: { name: 'figma-brand', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => figmaBrandProposal(assertViewer(viewer), body),
)
