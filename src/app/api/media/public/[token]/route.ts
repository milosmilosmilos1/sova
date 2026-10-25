import sharp from 'sharp'
import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { createHandler } from '@/lib/api/handler'
import { verifyMediaToken } from '@/lib/media/public-url'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** Pretvaranje slike u JPEG za mrežu koja sama preuzima fajl (TikTok). */
export const maxDuration = 60

/**
 * Javni medij za mreže koje fajl preuzimaju same (TikTok PULL_FROM_URL, D-077): potpisan token sa
 * istekom, bajtovi direktno (TikTok ne prati preusmeravanja). Varijanta `tiktok` je JPEG do 1080 px
 * širine i 1920 px visine, jer TikTok foto prima samo JPEG i WebP do 1080p; varijanta `jpeg` je ista
 * obrada za Pinterest i Google poslovni profil, koji ne primaju WebP.
 */
export const GET = createHandler(
  {
    auth: 'none',
    params: z.object({ token: z.string().min(20).max(300) }),
    rateLimit: { name: 'public-media', limit: 240, windowSec: 60, by: 'ip' },
  },
  async ({ params }) => {
    const parsed = verifyMediaToken(params.token)
    if (!parsed) throw new ApiError('NOT_FOUND', 'Medij ne postoji ili je link istekao.')
    const admin = createSupabaseAdminClient()
    const { data: asset } = await admin
      .from('media_assets')
      .select('bucket, storage_path, mime_type, deleted_at')
      .eq('id', parsed.assetId)
      .maybeSingle()
    if (!asset || asset.deleted_at) throw new ApiError('NOT_FOUND', 'Medij ne postoji ili je link istekao.')
    const { data: file, error } = await admin.storage.from(asset.bucket).download(asset.storage_path)
    if (error || !file) throw new ApiError('NOT_FOUND', 'Medij ne postoji ili je link istekao.')
    let bytes = Buffer.from(await file.arrayBuffer())
    let type = asset.mime_type
    if (parsed.variant !== 'orig' && type.startsWith('image/')) {
      bytes = await sharp(bytes)
        .rotate()
        .resize({ width: 1080, height: 1920, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer()
      type = 'image/jpeg'
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(bytes.length),
        'cache-control': 'private, max-age=3600',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  },
)
