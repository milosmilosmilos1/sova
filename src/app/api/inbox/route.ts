import { assertViewer, createHandler } from '@/lib/api/handler'
import { inboxQuerySchema } from '@/lib/schemas/inbox'
import { getInbox } from '@/services/inbox/threads'

/** Inbox (D-117): razgovori jedne vrste, brojači po vrstama i nalozi sa dozvolama. */
export const GET = createHandler({ auth: 'user', query: inboxQuerySchema }, async ({ viewer, query }) =>
  getInbox(assertViewer(viewer), query),
)
