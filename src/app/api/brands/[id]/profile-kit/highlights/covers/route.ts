import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { highlightCoversZip } from '@/services/brand-brain/profile-kit'

/** Sve naslovne highlights-a u jednom ZIP-u (D-144). */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'post-download', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => {
    const zip = await highlightCoversZip(assertViewer(viewer), params.id)
    return new Response(new Uint8Array(zip.bytes), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${zip.name}"`,
        'cache-control': 'private, no-store',
      },
    })
  },
)
