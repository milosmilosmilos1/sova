import { assertViewer, createHandler } from '@/lib/api/handler'
import { markReadSchema } from '@/lib/schemas/notifications'
import { markNotificationsRead } from '@/services/notifications'

/** Označavanje pročitanih: po ID-jevima ili sva (opciono u jednom workspace-u). */
export const POST = createHandler({ auth: 'verified', body: markReadSchema }, async ({ viewer, body }) => ({
  updated: await markNotificationsRead(assertViewer(viewer), body),
}))
