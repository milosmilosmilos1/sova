import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { createPostSchema, listPostsQuerySchema } from '@/lib/schemas/posts'
import { createPost, listPosts } from '@/services/posts/posts'

/** Lista objava brenda (filter po statusu, opsegu, tekstu; stranice). */
export const GET = createHandler({ auth: 'user', query: listPostsQuerySchema }, async ({ viewer, query }) =>
  listPosts(assertViewer(viewer), query),
)

/** Nova objava (nacrt) sa targetima po nalogu i medijima. */
export const POST = createHandler(
  { auth: 'verified', body: createPostSchema },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createPost(assertViewer(viewer), body), requestId, { status: 201 }),
)
