import { assertViewer, createHandler } from '@/lib/api/handler'
import { previewQuerySchema } from '@/lib/schemas/design'
import { renderPreview } from '@/services/design/preview'

/** Pregled stila objave (D-108): JPEG za birač stilova (sloj videa kao PNG, D-128); keš sat vremena. */
export const GET = createHandler(
  {
    auth: 'user',
    query: previewQuerySchema,
    rateLimit: { name: 'design-preview', limit: 240, windowSec: 60, by: 'user' },
  },
  async ({ viewer, query }) => {
    const image = await renderPreview(assertViewer(viewer), query)
    return new Response(new Uint8Array(image.bytes), {
      headers: { 'content-type': image.mimeType, 'cache-control': 'private, max-age=3600' },
    })
  },
)
