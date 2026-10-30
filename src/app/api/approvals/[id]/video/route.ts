import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { videoDraftSchema } from '@/lib/schemas/video-draft'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { createVideoDraft } from '@/services/posts/video-draft'

/** „Napravi video”: nov nacrt sa videom iz slajdova (napravljenim u pregledaču), bez tokena. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: videoDraftSchema,
    rateLimit: { name: 'video-draft', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body, requestId }) =>
    jsonOk(await createVideoDraft(assertViewer(viewer), params.id, body.mediaAssetId), requestId, {
      status: 201,
    }),
)
