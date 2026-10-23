import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateWorkspaceSchema, uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteWorkspace, getWorkspace, updateWorkspace } from '@/services/workspaces'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getWorkspace(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: updateWorkspaceSchema },
  async ({ viewer, params, body }) => updateWorkspace(assertViewer(viewer), params.id, body),
)

export const DELETE = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  await deleteWorkspace(assertViewer(viewer), params.id)
  return { deleted: true }
})
