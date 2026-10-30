import { assertViewer, createHandler } from '@/lib/api/handler'
import { deskEditsSchema } from '@/lib/schemas/review'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { publishFromDesk } from '@/services/posts/review'

/** „Objavi odmah”: izmene, odobrenje i objava. */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: deskEditsSchema },
  async ({ viewer, params, body }) => publishFromDesk(assertViewer(viewer), params.id, body),
)
