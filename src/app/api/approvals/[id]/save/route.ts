import { assertViewer, createHandler } from '@/lib/api/handler'
import { deskEditsSchema } from '@/lib/schemas/review'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { saveDeskEdits } from '@/services/posts/review'

/** Samo izmene opisa i heštegova (urednik bez prava odobravanja). */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: deskEditsSchema },
  async ({ viewer, params, body }) => saveDeskEdits(assertViewer(viewer), params.id, body),
)
