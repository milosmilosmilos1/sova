import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { brandIdQuerySchema, campaignInputSchema } from '@/lib/schemas/strategy'
import { createCampaign, listCampaigns } from '@/services/strategy/pillars'

/** Kampanje brenda (iz strategije ili ručne). */
export const GET = createHandler(
  { auth: 'verified', query: brandIdQuerySchema },
  async ({ viewer, query }) => ({
    campaigns: await listCampaigns(assertViewer(viewer), query.brandId),
  }),
)

export const POST = createHandler(
  { auth: 'verified', body: campaignInputSchema },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createCampaign(assertViewer(viewer), body), requestId, { status: 201 }),
)
