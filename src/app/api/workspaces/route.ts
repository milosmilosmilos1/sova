import { assertViewer, createHandler } from '@/lib/api/handler'
import { createWorkspaceSchema } from '@/lib/schemas/workspace'
import { createWorkspace, listWorkspaces } from '@/services/workspaces'

export const GET = createHandler({ auth: 'user' }, async ({ viewer }) => listWorkspaces(assertViewer(viewer)))

export const POST = createHandler(
  {
    auth: 'user',
    body: createWorkspaceSchema,
    rateLimit: { name: 'workspace-create', limit: 5, windowSec: 60 * 60, by: 'user' },
  },
  async ({ viewer, body }) => createWorkspace(assertViewer(viewer), body),
)
