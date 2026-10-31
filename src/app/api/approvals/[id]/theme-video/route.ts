import { assertViewer, createHandler } from '@/lib/api/handler'
import { themeVideoAttachSchema } from '@/lib/schemas/theme-video'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { attachThemeVideo, getThemeVideoSpec } from '@/services/posts/theme-video'

/** Video u temi (D-128): kadrovi za pregledač i prijem gotovog MP4. */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'theme-video', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => getThemeVideoSpec(assertViewer(viewer), params.id),
)

export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: themeVideoAttachSchema,
    rateLimit: { name: 'theme-video-attach', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => attachThemeVideo(assertViewer(viewer), params.id, body),
)
