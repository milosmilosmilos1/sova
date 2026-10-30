import { assertViewer, createHandler } from '@/lib/api/handler'
import { replySchema, threadParamsSchema } from '@/lib/schemas/inbox'
import { replyToThread } from '@/services/inbox/threads'

/** Odgovor kroz mrežu: komentar, poruka ili odgovor na recenziju. */
export const POST = createHandler(
  {
    auth: 'user',
    params: threadParamsSchema,
    body: replySchema,
    rateLimit: { name: 'inbox-reply', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => replyToThread(assertViewer(viewer), params.id, body.text),
)
