import { assertViewer, createHandler } from '@/lib/api/handler'
import { highlightParamsSchema } from '@/lib/schemas/brand'
import { highlightCover } from '@/services/brand-brain/profile-kit'

/** Naslovna jednog highlights-a (D-144): PNG 1080×1920 u boji teme; `?download=1` je preuzima. */
export const GET = createHandler(
  {
    auth: 'user',
    params: highlightParamsSchema,
    rateLimit: { name: 'highlight-cover', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, params }) => {
    const cover = await highlightCover(assertViewer(viewer), params.id, params.index)
    const download = new URL(req.url).searchParams.get('download') === '1'
    return new Response(new Uint8Array(cover.png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, max-age=300',
        ...(download ? { 'content-disposition': `attachment; filename="${cover.name}"` } : {}),
      },
    })
  },
)
