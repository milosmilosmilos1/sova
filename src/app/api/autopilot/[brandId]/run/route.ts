import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { nextWeekRange } from '@/lib/autopilot/rules'
import { ADMIN_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueAutopilotWeek } from '@/lib/jobs/enqueue'
import { brandParamsSchema } from '@/lib/schemas/autopilot'
import { getBrand } from '@/services/brands'

/** „Pripremi narednu nedelju sada”: isti prolaz kao ponedeljkom, odmah (vlasnik i administrator, 3 na sat). */
export const POST = createHandler(
  {
    auth: 'verified',
    params: brandParamsSchema,
    rateLimit: { name: 'autopilot-run', limit: 3, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, params, requestId }) => {
    const v = assertViewer(viewer)
    const brand = await getBrand(v, params.brandId)
    await requireMembership(v, brand.workspace_id, ADMIN_ROLES)
    if (brand.autopilot_level < 1)
      throw new ApiError('VALIDATION', 'Autopilot je isključen (nivo 0). Izaberite nivo 1 ili više.')
    const week = nextWeekRange(new Date(), brand.timezone)
    await enqueueAutopilotWeek(brand.id, week.start, v.user.id)
    return jsonOk({ queued: true, weekStart: week.start, weekEnd: week.end }, requestId, { status: 202 })
  },
)
