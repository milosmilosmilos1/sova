import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { disconnectCanva } from '@/services/canva/connection'

const query = z.object({ workspaceId: z.uuid() })

/** Prekid Canva veze za trenutnog korisnika u workspace-u. */
export const DELETE = createHandler({ auth: 'verified', query }, async ({ viewer, query: q }) => {
  await disconnectCanva(assertViewer(viewer), q.workspaceId)
  return { disconnected: true }
})
