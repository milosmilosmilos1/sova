import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { pillarPatchSchema } from '@/lib/schemas/strategy'
import { deletePillar, updatePillar } from '@/services/strategy/pillars'

const params = z.object({ id: z.uuid({ error: 'Neispravan identifikator.' }) })

export const PATCH = createHandler(
  { auth: 'verified', params, body: pillarPatchSchema },
  async ({ viewer, params: p, body }) => updatePillar(assertViewer(viewer), p.id, body),
)

export const DELETE = createHandler({ auth: 'verified', params }, async ({ viewer, params: p }) => {
  await deletePillar(assertViewer(viewer), p.id)
  return { deleted: true }
})
