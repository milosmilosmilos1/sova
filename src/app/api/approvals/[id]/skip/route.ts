import { assertViewer, createHandler } from '@/lib/api/handler'
import { deskVersionSchema } from '@/lib/schemas/review'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { skipPost } from '@/services/posts/review'

/** „Preskoči”: nacrt se otkazuje i prelazi u preskočene; može da se vrati iz editora. */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: deskVersionSchema },
  async ({ viewer, params, body }) => skipPost(assertViewer(viewer), params.id, body.version),
)
