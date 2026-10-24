import { assertViewer, createHandler } from '@/lib/api/handler'
import { brandParamsSchema, updateAutopilotSchema } from '@/lib/schemas/autopilot'
import { getAutopilot, updateAutopilot } from '@/services/autopilot/settings'

/** Podešavanja i stanje Autopilota za brend (nivo, budžet, rokovi, poslednji prolazi). */
export const GET = createHandler(
  { auth: 'verified', params: brandParamsSchema },
  async ({ viewer, params }) => getAutopilot(assertViewer(viewer), params.brandId),
)

/** Izmena (vlasnik i administrator); nivo 3 traži naziv brenda u `confirm` i izbor naloga. */
export const PATCH = createHandler(
  { auth: 'verified', params: brandParamsSchema, body: updateAutopilotSchema },
  async ({ viewer, params, body }) => updateAutopilot(assertViewer(viewer), params.brandId, body),
)
