import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteMediaAsset } from '@/services/media'

/** Brisanje medija iz biblioteke; medij u zakazanoj objavi daje 409 (MEDIA_IN_USE). */
export const DELETE = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  await deleteMediaAsset(assertViewer(viewer), params.id)
  return { deleted: true }
})
