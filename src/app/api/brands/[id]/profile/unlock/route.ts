import { assertViewer, createHandler } from '@/lib/api/handler'
import { unlockFieldsSchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { unlockProfileFields } from '@/services/brand-brain/profile'

/** Otključavanje polja: sledeća analiza sme ponovo da ih popuni. */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: unlockFieldsSchema },
  async ({ viewer, params, body }) => unlockProfileFields(assertViewer(viewer), params.id, body.paths),
)
