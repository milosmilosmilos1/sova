import { assertViewer, createHandler } from '@/lib/api/handler'
import { galleryQuerySchema, galleryUpdateSchema } from '@/lib/schemas/gallery'
import { getGallery, updateGalleryItems } from '@/services/gallery'

/** Galerija brenda (D-114): fotografije, kategorije sa brojem i brojači opisa. */
export const GET = createHandler({ auth: 'user', query: galleryQuerySchema }, async ({ viewer, query }) =>
  getGallery(assertViewer(viewer), query.brandId, { category: query.category ?? null }),
)

/** „Sačuvaj sve izmene”: opis i kategorija za više fotografija. */
export const PATCH = createHandler(
  {
    auth: 'user',
    body: galleryUpdateSchema,
    rateLimit: { name: 'gallery-update', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => updateGalleryItems(assertViewer(viewer), body.brandId, body.items),
)
