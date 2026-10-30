import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { planGenerateSchema, planParamsSchema } from '@/lib/schemas/plans'
import { startPlanGeneration } from '@/services/plans/plans'

/** „Generiši sve”: svi nacrti iz plana u pozadini (2 tokena po objavi). */
export const POST = createHandler(
  {
    auth: 'verified',
    params: planParamsSchema,
    body: planGenerateSchema,
    rateLimit: { name: 'month-plan-generate', limit: 5, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body, requestId }) =>
    jsonOk(await startPlanGeneration(assertViewer(viewer), params.id, body.mode), requestId, { status: 202 }),
)
