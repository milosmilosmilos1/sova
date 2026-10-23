import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { revokeInvitation } from '@/services/team'

export const DELETE = createHandler(
  { auth: 'user', params: uuidParamSchema, body: z.object({ workspaceId: z.uuid() }) },
  async ({ viewer, params, body }) => {
    await revokeInvitation(assertViewer(viewer), body.workspaceId, params.id)
    return { revoked: true }
  },
)
