import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { brandIdQuerySchema, pillarInputSchema } from '@/lib/schemas/strategy'
import { createPillar, listPillars } from '@/services/strategy/pillars'

/** Stubovi sadržaja brenda. */
export const GET = createHandler(
  { auth: 'verified', query: brandIdQuerySchema },
  async ({ viewer, query }) => ({
    pillars: await listPillars(assertViewer(viewer), query.brandId, true),
  }),
)

export const POST = createHandler(
  { auth: 'verified', body: pillarInputSchema },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createPillar(assertViewer(viewer), body), requestId, { status: 201 }),
)
