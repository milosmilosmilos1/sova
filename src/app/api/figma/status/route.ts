import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaWorkspaceQuerySchema } from '@/lib/schemas/figma'
import { getFigmaStatus } from '@/services/figma/connection'

/** Da li je Figma podešena, uključena za radni prostor i povezana za korisnika (D-161). */
export const GET = createHandler(
  { auth: 'user', query: figmaWorkspaceQuerySchema },
  async ({ viewer, query }) => getFigmaStatus(assertViewer(viewer), query.workspaceId),
)
