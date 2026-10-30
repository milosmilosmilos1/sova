import { assertViewer, createHandler } from '@/lib/api/handler'
import { sendTestPush } from '@/services/push'

/** Probno obaveštenje na sve uređaje korisnika. */
export const POST = createHandler(
  { auth: 'user', rateLimit: { name: 'push-test', limit: 3, windowSec: 60, by: 'user' } },
  async ({ viewer }) => sendTestPush(assertViewer(viewer)),
)
