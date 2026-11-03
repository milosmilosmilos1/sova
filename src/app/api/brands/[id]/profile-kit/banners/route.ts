import { assertViewer, createHandler } from '@/lib/api/handler'
import { bannerQuerySchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { bannerOptionsFrom, profileBannersZip } from '@/services/brand-brain/profile-kit'

/** Šest naslovnih u punoj veličini može da potraje. */
export const maxDuration = 30

/** Sve naslovne slike profila u jednom ZIP-u (D-145), sa tekstom iz upita. */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    query: bannerQuerySchema,
    rateLimit: { name: 'post-download', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, query }) => {
    const zip = await profileBannersZip(assertViewer(viewer), params.id, {
      ...bannerOptionsFrom(query),
      preview: false,
    })
    return new Response(new Uint8Array(zip.bytes), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${zip.name}"`,
        'cache-control': 'private, no-store',
      },
    })
  },
)
