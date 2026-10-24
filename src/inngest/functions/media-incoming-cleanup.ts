import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { cleanupIncomingUploads } from '@/services/media'

/** Svaki dan u 03:30: privremeni fajlovi direktnog otpremanja koji nisu završeni za 24 h (D-082). */
export const mediaIncomingCleanup = inngest.createFunction(
  { id: 'media-incoming-cleanup', retries: 2, triggers: [cron('30 3 * * *')] },
  async ({ step }) => {
    const removed = await step.run('remove-stale-incoming', () => cleanupIncomingUploads(24))
    return { removed }
  },
)
