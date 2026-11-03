import { assertViewer, createHandler } from '@/lib/api/handler'
import { bannerParamsSchema, bannerQuerySchema } from '@/lib/schemas/brand'
import { bannerOptionsFrom, profileBanner } from '@/services/brand-brain/profile-kit'

/** Naslovna slika profila za jednu mrežu (D-145): PNG u veličini mreže; `?download=1` je preuzima. */
export const GET = createHandler(
  {
    auth: 'user',
    params: bannerParamsSchema,
    query: bannerQuerySchema,
    // pregled crta šest slika posle svake izmene teksta
    rateLimit: { name: 'profile-banner', limit: 120, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, query }) => {
    const banner = await profileBanner(assertViewer(viewer), params.id, params.kind, bannerOptionsFrom(query))
    return new Response(new Uint8Array(banner.png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, max-age=300',
        ...(query.download ? { 'content-disposition': `attachment; filename="${banner.name}"` } : {}),
      },
    })
  },
)
