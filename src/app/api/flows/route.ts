import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { createFlowSchema, listFlowsQuerySchema } from '@/lib/schemas/flows'
import { createFlow, listFlows } from '@/services/flows/flows'

/** Tokovi automatizacije brenda (D-108). */
export const GET = createHandler(
  { auth: 'user', query: listFlowsQuerySchema },
  async ({ viewer, query }) => ({
    flows: await listFlows(assertViewer(viewer), query.brandId),
  }),
)

export const POST = createHandler(
  {
    auth: 'verified',
    body: createFlowSchema,
    rateLimit: { name: 'flows-write', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createFlow(assertViewer(viewer), body), requestId, { status: 201 }),
)
