import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { generateCalendarSchema } from '@/lib/schemas/strategy'
import { generateCalendar } from '@/services/strategy/strategy'

const params = z.object({ id: z.uuid({ error: 'Neispravan identifikator.' }) })

/** Nacrti sa terminom iz strategije (bez tokena); ponovni poziv ne duplira termine. */
export const POST = createHandler(
  {
    auth: 'verified',
    params,
    body: generateCalendarSchema,
    rateLimit: { name: 'strategy-calendar', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params: p, body, requestId }) =>
    jsonOk(await generateCalendar(assertViewer(viewer), p.id, body), requestId, { status: 201 }),
)
