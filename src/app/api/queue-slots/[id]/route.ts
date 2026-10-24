import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteQueueSlot } from '@/services/posts/calendar'

export const DELETE = createHandler(
  { auth: 'verified', params: uuidParamSchema },
  async ({ viewer, params }) => {
    await deleteQueueSlot(assertViewer(viewer), params.id)
    return { deleted: true }
  },
)
