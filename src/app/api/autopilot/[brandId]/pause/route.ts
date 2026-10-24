import { assertViewer, createHandler } from '@/lib/api/handler'
import { brandParamsSchema } from '@/lib/schemas/autopilot'
import { pauseAll } from '@/services/autopilot/settings'

/** „Pauziraj sve”: zaustavlja Autopilot i sve zakazane objave brenda (urednik i više). */
export const POST = createHandler(
  { auth: 'verified', params: brandParamsSchema },
  async ({ viewer, params }) => pauseAll(assertViewer(viewer), params.brandId),
)
