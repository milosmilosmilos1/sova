import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { listVersions } from '@/services/posts/posts'

/** Istorija verzija objave (snimci pri svakoj izmeni i prelazu statusa). */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  listVersions(assertViewer(viewer), params.id),
)
