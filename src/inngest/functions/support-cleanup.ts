import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { purgeOldSupportMessages } from '@/services/support/chat'

/** Chatbot podrške (D-172): svake noći u 05:15 UTC brišu se poruke starije od 90 dana. */
export const supportMessagesCleanup = inngest.createFunction(
  {
    id: 'support-messages-cleanup',
    retries: 2,
    concurrency: [{ limit: 1 }],
    triggers: [cron('15 5 * * *')],
  },
  async ({ step }) => step.run('purge', () => purgeOldSupportMessages()),
)
