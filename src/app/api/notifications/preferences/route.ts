import type { NotificationType } from '@/config/notifications'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { preferencesBodySchema, preferencesQuerySchema } from '@/lib/schemas/notifications'
import { getNotificationPreferences, setNotificationPreferences } from '@/services/notifications'

/** Podešavanja obaveštenja po workspace-u: koji tip ide u aplikaciju, a koji i na email. */
export const GET = createHandler(
  { auth: 'verified', query: preferencesQuerySchema },
  async ({ viewer, query }) => ({
    items: await getNotificationPreferences(assertViewer(viewer), query.workspaceId),
  }),
)

export const PUT = createHandler(
  { auth: 'verified', body: preferencesBodySchema },
  async ({ viewer, body }) => ({
    items: await setNotificationPreferences(
      assertViewer(viewer),
      body.workspaceId,
      body.items.map((i) => ({ type: i.type as NotificationType, inApp: i.inApp, email: i.email })),
    ),
  }),
)
