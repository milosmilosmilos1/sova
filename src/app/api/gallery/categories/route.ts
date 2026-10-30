import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { categoryCreateSchema } from '@/lib/schemas/gallery'
import { createCategory } from '@/services/gallery'

/** Nova kategorija galerije (D-114); naziv je jedinstven po brendu. */
export const POST = createHandler(
  {
    auth: 'user',
    body: categoryCreateSchema,
    rateLimit: { name: 'gallery-category', limit: 30, windowSec: 600, by: 'user' },
  },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createCategory(assertViewer(viewer), body.brandId, body.name), requestId, { status: 201 }),
)
