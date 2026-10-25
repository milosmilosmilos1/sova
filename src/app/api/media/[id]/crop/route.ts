import { assertViewer, createHandler } from '@/lib/api/handler'
import { cropMediaSchema } from '@/lib/schemas/posts'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { cropImage, signedUrl } from '@/services/media'

/** Sečenje i ponovno kodiranje slike. */
export const maxDuration = 60

/** Sečenje slike na odnos stranica mreže (EDGE_CASES N9): odgovor je nova slika iz biblioteke. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: cropMediaSchema,
    rateLimit: { name: 'media-crop', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => {
    const asset = await cropImage(assertViewer(viewer), params.id, body)
    return {
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration_ms,
      sizeBytes: asset.size_bytes,
      altText: asset.alt_text,
      url: await signedUrl(asset),
    }
  },
)
