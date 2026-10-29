import { assertViewer, createHandler } from '@/lib/api/handler'
import { pexelsSelectSchema } from '@/lib/schemas/visuals'
import { signedUrl } from '@/services/media'
import { selectPexelsMedia } from '@/services/visuals/pexels'

/** Izbor snimka ili fotografije sa Pexels-a: kopija u biblioteci brenda sa imenom autora (D-107). */
export const POST = createHandler(
  {
    auth: 'verified',
    body: pexelsSelectSchema,
    rateLimit: { name: 'pexels-select', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => {
    const r = await selectPexelsMedia(assertViewer(viewer), body)
    return {
      id: r.asset.id,
      kind: r.asset.kind,
      url: await signedUrl(r.asset),
      width: r.asset.width,
      height: r.asset.height,
      durationMs: r.asset.duration_ms,
      attribution: r.attribution,
      reused: r.reused,
    }
  },
)
