import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { campaignPatchSchema } from '@/lib/schemas/strategy'
import { deleteCampaign, updateCampaign } from '@/services/strategy/pillars'

const params = z.object({ id: z.uuid({ error: 'Neispravan identifikator.' }) })

export const PATCH = createHandler(
  { auth: 'verified', params, body: campaignPatchSchema },
  async ({ viewer, params: p, body }) => updateCampaign(assertViewer(viewer), p.id, body),
)

export const DELETE = createHandler({ auth: 'verified', params }, async ({ viewer, params: p }) => {
  await deleteCampaign(assertViewer(viewer), p.id)
  return { deleted: true }
})
