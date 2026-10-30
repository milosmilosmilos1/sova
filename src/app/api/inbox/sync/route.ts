import { assertViewer, createHandler } from '@/lib/api/handler'
import { inboxSyncSchema } from '@/lib/schemas/inbox'
import { syncBrandInbox } from '@/services/inbox/threads'

/** „Osveži Inbox”: nalozi brenda odmah, sa DM automatizacijom. */
export const POST = createHandler(
  {
    auth: 'user',
    body: inboxSyncSchema,
    rateLimit: { name: 'inbox-sync', limit: 6, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => syncBrandInbox(assertViewer(viewer), body.brandId),
)
