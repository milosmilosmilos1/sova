import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { getCanvaStatus } from '@/services/canva/connection'

const query = z.object({ workspaceId: z.uuid() })

/** Da li je Canva podešena, uključena i povezana za trenutnog korisnika. */
export const GET = createHandler({ auth: 'user', query }, async ({ viewer, query: q }) =>
  getCanvaStatus(assertViewer(viewer), q.workspaceId),
)
