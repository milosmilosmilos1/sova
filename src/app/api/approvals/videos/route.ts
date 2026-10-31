import { assertViewer, createHandler } from '@/lib/api/handler'
import { pendingVideosQuerySchema } from '@/lib/schemas/theme-video'
import { listPendingThemeVideos } from '@/services/posts/theme-video'

/** Videi u temi koji čekaju da ih pregledač napravi (D-128). */
export const GET = createHandler(
  { auth: 'user', query: pendingVideosQuerySchema },
  async ({ viewer, query }) => listPendingThemeVideos(assertViewer(viewer), query.brandId),
)
