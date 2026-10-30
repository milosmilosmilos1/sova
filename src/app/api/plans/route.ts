import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { planQuerySchema, planRequestSchema } from '@/lib/schemas/plans'
import { getPlanPage, requestPlan } from '@/services/plans/plans'

/** Mesečni plan (D-119): poslednji plan brenda i podešavanja za nov. */
export const GET = createHandler({ auth: 'user', query: planQuerySchema }, async ({ viewer, query }) =>
  getPlanPage(assertViewer(viewer), query.brandId),
)

/** Nov plan: termini odmah, teme u pozadini (3 tokena). */
export const POST = createHandler(
  {
    auth: 'verified',
    body: planRequestSchema,
    rateLimit: { name: 'month-plan', limit: 5, windowSec: 600, by: 'user' },
  },
  async ({ viewer, body, requestId }) =>
    jsonOk(await requestPlan(assertViewer(viewer), body), requestId, { status: 202 }),
)
