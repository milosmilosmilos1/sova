import { assertViewer, createHandler } from '@/lib/api/handler'
import { deskScheduleSchema } from '@/lib/schemas/review'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { saveAndSchedule } from '@/services/posts/review'

/** „Sačuvaj i zakaži”: izmene, odobrenje i zakazivanje u jednom potezu. */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: deskScheduleSchema },
  async ({ viewer, params, body }) => saveAndSchedule(assertViewer(viewer), params.id, body),
)
