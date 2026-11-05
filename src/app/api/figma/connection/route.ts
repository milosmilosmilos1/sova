import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaWorkspaceQuerySchema } from '@/lib/schemas/figma'
import { disconnectFigma } from '@/services/figma/connection'

/** Prekid Figma veze za korisnika u radnom prostoru (D-161). */
export const DELETE = createHandler(
  { auth: 'user', query: figmaWorkspaceQuerySchema },
  async ({ viewer, query }) => {
    await disconnectFigma(assertViewer(viewer), query.workspaceId)
    return { disconnected: true }
  },
)
