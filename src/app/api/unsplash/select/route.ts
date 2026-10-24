import { assertViewer, createHandler } from '@/lib/api/handler'
import { unsplashSelectSchema } from '@/lib/schemas/visuals'
import { signedUrl } from '@/services/media'
import { selectUnsplashPhoto } from '@/services/visuals/unsplash'

/** Izbor fotografije: beleži preuzimanje kod Unsplash-a i čuva kopiju u biblioteci brenda. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: unsplashSelectSchema,
    rateLimit: { name: 'unsplash-select', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => {
    const r = await selectUnsplashPhoto(assertViewer(viewer), body)
    return {
      id: r.asset.id,
      url: await signedUrl(r.asset),
      width: r.asset.width,
      height: r.asset.height,
      altText: r.asset.alt_text,
      attribution: r.attribution,
      reused: r.reused,
    }
  },
)
