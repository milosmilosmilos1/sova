import { assertViewer, createHandler } from '@/lib/api/handler'
import { mediaListQuerySchema } from '@/lib/schemas/posts'
import { listMedia } from '@/services/media'

/** Biblioteka medija brenda (slike i video, ili samo jedno uz `kind`) sa potpisanim URL-ovima za pregled. */
export const GET = createHandler({ auth: 'user', query: mediaListQuerySchema }, async ({ viewer, query }) =>
  listMedia(assertViewer(viewer), query.brandId, query.limit, query.kind),
)
