import { assertViewer, createHandler } from '@/lib/api/handler'
import { slideTextPreviewSchema } from '@/lib/schemas/slide-text'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { previewSlideText } from '@/services/posts/slide-text'

/** Pregled slajda dok se tekst kuca (D-129): JPEG u temi objave, sa istom fotografijom. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: slideTextPreviewSchema,
    rateLimit: { name: 'slide-text-preview', limit: 120, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => {
    const image = await previewSlideText(assertViewer(viewer), params.id, body)
    return new Response(new Uint8Array(image.bytes), {
      headers: { 'content-type': image.mimeType, 'cache-control': 'no-store' },
    })
  },
)
