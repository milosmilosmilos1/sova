import { assertViewer, createHandler } from '@/lib/api/handler'
import { pushSubscriptionSchema } from '@/lib/schemas/push'
import { savePushSubscription } from '@/services/push'

/** Uključivanje obaveštenja na ovom uređaju. */
export const POST = createHandler(
  {
    auth: 'user',
    body: pushSubscriptionSchema,
    rateLimit: { name: 'push-subscribe', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body }) =>
    savePushSubscription(assertViewer(viewer), body, req.headers.get('user-agent')),
)
