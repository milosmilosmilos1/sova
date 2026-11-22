import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getAsset } from '@/services/media'
import { previewUrl } from '@/services/media-urls'

/** Adresa za pregled medija: Unsplash sa Unsplash adrese (D-190), ostalo potpisan URL. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  const asset = await getAsset(assertViewer(viewer), params.id)
  return {
    id: asset.id,
    url: await previewUrl(asset),
    mimeType: asset.mime_type,
    width: asset.width,
    height: asset.height,
  }
})
