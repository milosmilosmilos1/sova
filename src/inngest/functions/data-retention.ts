import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { logger } from '@/lib/logger'
import { purgeExpiredNetworkData } from '@/services/data-retention'

/**
 * Rokovi čuvanja (D-181): svake noći u 05:30 UTC brišu se YouTube i Google podaci koji 30 dana nisu
 * osveženi i Inbox razgovori bez nove poruke 12 meseci.
 */
export const dataRetention = inngest.createFunction(
  {
    id: 'data-retention',
    retries: 2,
    concurrency: [{ limit: 1 }],
    triggers: [cron('30 5 * * *')],
  },
  async ({ step }) => {
    const result = await step.run('purge', () => purgeExpiredNetworkData())
    logger.info('data_retention_done', { ...result })
    return result
  },
)
