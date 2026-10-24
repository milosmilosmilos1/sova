import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { commentSchema } from '@/lib/schemas/posts'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { addComment, listComments } from '@/services/posts/comments'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  listComments(assertViewer(viewer), params.id),
)

export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: commentSchema },
  async ({ viewer, params, body, requestId }) =>
    jsonOk(await addComment(assertViewer(viewer), params.id, body.body, body.mentions ?? []), requestId, {
      status: 201,
    }),
)
