import { assertViewer, createHandler } from '@/lib/api/handler'
import { categoryUpdateSchema } from '@/lib/schemas/gallery'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteCategory, renameCategory } from '@/services/gallery'

/** Preimenovanje kategorije galerije. */
export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: categoryUpdateSchema },
  async ({ viewer, params, body }) => renameCategory(assertViewer(viewer), params.id, body.name),
)

/** Brisanje kategorije: fotografije ostaju u galeriji, bez kategorije. */
export const DELETE = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  await deleteCategory(assertViewer(viewer), params.id)
  return { deleted: true }
})
