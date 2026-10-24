import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateStrategySchema } from '@/lib/schemas/strategy'
import { getStrategy, updateStrategy } from '@/services/strategy/strategy'

const params = z.object({ id: z.uuid({ error: 'Neispravan identifikator.' }) })

/** Jedna strategija sa stubovima, kampanjama i brojem nacrta iz nje. */
export const GET = createHandler({ auth: 'verified', params }, async ({ viewer, params: p }) =>
  getStrategy(assertViewer(viewer), p.id),
)

/** Izmena polja strategije; `status: 'active'` arhivira ostale aktivne za brend. */
export const PATCH = createHandler(
  { auth: 'verified', params, body: updateStrategySchema },
  async ({ viewer, params: p, body }) => updateStrategy(assertViewer(viewer), p.id, body),
)
