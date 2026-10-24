import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { queueSlotSchema, queueSlotsQuerySchema } from '@/lib/schemas/posts'
import { createQueueSlot, listQueueSlots, nextFreeSlot } from '@/services/posts/calendar'

const nextQuery = z.object({
  brandId: z.uuid(),
  socialAccountId: z.uuid().optional(),
  next: z.string().optional(),
})

/** Red objava: termini po nalogu i danu; `?next=1&socialAccountId=` daje sledeći slobodan termin. */
export const GET = createHandler({ auth: 'user', query: nextQuery }, async ({ viewer, query }) => {
  const v = assertViewer(viewer)
  if (query.next && query.socialAccountId) {
    return { next: await nextFreeSlot(v, query.brandId, query.socialAccountId) }
  }
  return listQueueSlots(v, queueSlotsQuerySchema.parse({ brandId: query.brandId }).brandId)
})

export const POST = createHandler(
  { auth: 'verified', body: queueSlotSchema },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createQueueSlot(assertViewer(viewer), body), requestId, { status: 201 }),
)
