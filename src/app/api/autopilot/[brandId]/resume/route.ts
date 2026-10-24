import { assertViewer, createHandler } from '@/lib/api/handler'
import { brandParamsSchema } from '@/lib/schemas/autopilot'
import { resumeAll } from '@/services/autopilot/settings'

/** Nastavak posle „Pauziraj sve” (vlasnik i administrator). */
export const POST = createHandler(
  { auth: 'verified', params: brandParamsSchema },
  async ({ viewer, params }) => resumeAll(assertViewer(viewer), params.brandId),
)
