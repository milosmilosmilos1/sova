import { assertViewer, createHandler } from '@/lib/api/handler'
import { galleryDescribeSchema } from '@/lib/schemas/gallery'
import { describeGalleryPhotos } from '@/services/gallery'

/** Gemini čita fotografije; do šest u zahtevu, tri istovremeno. */
export const maxDuration = 60

/** „Opiši automatski” (D-114): opis i pojmovi za pretragu, 1 token po fotografiji. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: galleryDescribeSchema,
    rateLimit: { name: 'gallery-describe', limit: 20, windowSec: 600, by: 'user' },
  },
  async ({ viewer, body, requestId }) =>
    describeGalleryPhotos(assertViewer(viewer), body.brandId, body.assetIds, { requestId }),
)
