import { assertViewer, createHandler } from '@/lib/api/handler'
import { updatePostSchema } from '@/lib/schemas/posts'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { deletePost, getPostView, updatePost } from '@/services/posts/posts'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getPostView(assertViewer(viewer), params.id),
)

/** Izmena sadržaja; `version` u telu je optimistic lock (409 kad je zastarela). */
export const PATCH = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: updatePostSchema },
  async ({ viewer, params, body }) => updatePost(assertViewer(viewer), params.id, body),
)

export const DELETE = createHandler(
  { auth: 'verified', params: uuidParamSchema },
  async ({ viewer, params }) => {
    await deletePost(assertViewer(viewer), params.id)
    return { deleted: true }
  },
)
