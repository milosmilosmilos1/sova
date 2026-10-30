import { assertViewer, createHandler } from '@/lib/api/handler'
import { pushEndpointSchema } from '@/lib/schemas/push'
import { removePushSubscription } from '@/services/push'

/** Isključivanje obaveštenja na ovom uređaju. */
export const POST = createHandler({ auth: 'user', body: pushEndpointSchema }, async ({ viewer, body }) =>
  removePushSubscription(assertViewer(viewer), body.endpoint),
)
