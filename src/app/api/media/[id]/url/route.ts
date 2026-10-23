import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getAsset, signedUrl } from '@/services/media'

/** Potpisan URL za pregled medija (1 h). */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  const asset = await getAsset(assertViewer(viewer), params.id)
  return {
    id: asset.id,
    url: await signedUrl(asset),
    mimeType: asset.mime_type,
    width: asset.width,
    height: asset.height,
  }
})
