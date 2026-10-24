import { assertViewer, createHandler } from '@/lib/api/handler'
import { uploadTargetSchema } from '@/lib/schemas/posts'
import { createUploadTarget } from '@/services/media'

/** Potpisan URL za otpremanje slike ili videa pravo u skladište (D-082); fajl se zatim javlja na /complete. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: uploadTargetSchema,
    rateLimit: { name: 'media-upload', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => createUploadTarget(assertViewer(viewer), body),
)
