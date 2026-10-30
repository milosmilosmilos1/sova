import { assertViewer, createHandler } from '@/lib/api/handler'
import { threadParamsSchema, threadStatusSchema } from '@/lib/schemas/inbox'
import { getThread, setThreadStatus } from '@/services/inbox/threads'

/** Razgovor sa porukama; otvaranje ga označava kao pročitan. */
export const GET = createHandler({ auth: 'user', params: threadParamsSchema }, async ({ viewer, params }) =>
  getThread(assertViewer(viewer), params.id),
)

/** Status razgovora: otvoren ili rešen. */
export const PATCH = createHandler(
  { auth: 'user', params: threadParamsSchema, body: threadStatusSchema },
  async ({ viewer, params, body }) => setThreadStatus(assertViewer(viewer), params.id, body.status),
)
