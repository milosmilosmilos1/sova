import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateFlowSchema } from '@/lib/schemas/flows'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteFlow, getFlow, updateFlow } from '@/services/flows/flows'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getFlow(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: updateFlowSchema,
    rateLimit: { name: 'flows-write', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => updateFlow(assertViewer(viewer), params.id, body),
)

export const DELETE = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  await deleteFlow(assertViewer(viewer), params.id)
  return { deleted: true }
})
