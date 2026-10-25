import { assertViewer, createHandler } from '@/lib/api/handler'
import { completeUploadSchema } from '@/lib/schemas/posts'
import { completeUpload, signedUrl } from '@/services/media'

/** Video do MEDIA_MAX_VIDEO_MB: preuzimanje iz skladišta, čitanje zaglavlja, ponovni upis. */
export const maxDuration = 120

/** Posle otpremanja: provera tipa po sadržaju, obrada slike ili čitanje video zaglavlja, red u biblioteci. */
export const POST = createHandler(
  { auth: 'verified', body: completeUploadSchema },
  async ({ viewer, body }) => {
    const asset = await completeUpload(assertViewer(viewer), body)
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
