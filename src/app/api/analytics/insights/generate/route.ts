import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { generateInsightsSchema } from '@/lib/schemas/analytics'
import { generateInsights } from '@/services/analytics/insights'
import { getBrand } from '@/services/brands'

/** Ručno pokretanje uvida za period (podrazumevano poslednjih 7 dana); platforma plaća, 2 na sat. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: generateInsightsSchema,
    rateLimit: { name: 'insights-generate', limit: 2, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const brand = await getBrand(v, body.brandId)
    await requireMembership(v, brand.workspace_id, EDIT_ROLES)
    const result = await generateInsights(body.brandId, {
      from: body.periodStart ?? null,
      to: body.periodEnd ?? null,
      userId: v.user.id,
      requestId,
    })
    return jsonOk(result, requestId, { status: result.status === 'created' ? 201 : 200 })
  },
)
