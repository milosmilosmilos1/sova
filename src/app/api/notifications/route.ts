import { assertViewer, createHandler } from '@/lib/api/handler'
import { listNotificationsQuerySchema } from '@/lib/schemas/notifications'
import { listNotifications } from '@/services/notifications'

/** Obaveštenja prijavljenog korisnika (RLS: sopstveni redovi), najnovija prva, sa brojem nepročitanih. */
export const GET = createHandler(
  { auth: 'verified', query: listNotificationsQuerySchema },
  async ({ viewer, query }) =>
    listNotifications(assertViewer(viewer), {
      workspaceId: query.workspaceId ?? null,
      unreadOnly: query.unread === '1' || query.unread === 'true',
      limit: query.limit,
    }),
)
