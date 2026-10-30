import { assertViewer, createHandler } from '@/lib/api/handler'
import { documentParamsSchema } from '@/lib/schemas/setup'
import { deleteDocument } from '@/services/brand-brain/documents'

/** Brisanje dokumenta: fajl, odlomci u bazi znanja i red (meko). */
export const DELETE = createHandler(
  { auth: 'user', params: documentParamsSchema },
  async ({ viewer, params }) => {
    await deleteDocument(assertViewer(viewer), params.id, params.documentId)
    return { deleted: true }
  },
)
