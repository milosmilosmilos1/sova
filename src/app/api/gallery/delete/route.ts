import { assertViewer, createHandler } from '@/lib/api/handler'
import { galleryDeleteSchema } from '@/lib/schemas/bulk'
import { bulkDeleteMedia } from '@/services/posts/bulk'

/** Brisanje označenih fotografija iz galerije (D-119). */
export const POST = createHandler(
  {
    auth: 'user',
    body: galleryDeleteSchema,
    rateLimit: { name: 'gallery-delete', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => bulkDeleteMedia(assertViewer(viewer), body.brandId, body.ids),
)
