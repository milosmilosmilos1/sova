import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { createInvitationSchema } from '@/lib/schemas/workspace'
import { createInvitation, listInvitations } from '@/services/team'

export const GET = createHandler(
  { auth: 'user', query: z.object({ workspaceId: z.uuid() }) },
  async ({ viewer, query }) => listInvitations(assertViewer(viewer), query.workspaceId),
)

export const POST = createHandler(
  {
    auth: 'user',
    body: createInvitationSchema,
    rateLimit: { name: 'invitation-create', limit: 10, windowSec: 60 * 60, by: 'user' },
  },
  async ({ viewer, body }) => createInvitation(assertViewer(viewer), body),
)
