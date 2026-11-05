import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { brandIcon } from '@/services/design/brand-design'

/** Ikonica logoa brenda za birač brenda i listu brendova (D-155); adresa nosi oznaku logoa, pa se dugo kešira. */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'brand-logo', limit: 240, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => {
    const png = await brandIcon(assertViewer(viewer), params.id)
    if (!png) throw new ApiError('NOT_FOUND', 'Brend nema kvadratan logo.')
    return new Response(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=604800, immutable' },
    })
  },
)
