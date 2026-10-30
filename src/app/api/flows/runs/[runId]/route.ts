import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { getRun } from '@/services/flows/flows'

/** Stanje prolaza toka za prozor napretka (copy → images → check → done). */
export const GET = createHandler(
  { auth: 'user', params: z.object({ runId: z.uuid() }) },
  async ({ viewer, params }) => getRun(assertViewer(viewer), params.runId),
)
