import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { refreshExpiringTokens, refreshOtherTokens } from '@/services/social/refresh'

/**
 * Na 6 h: Meta korisnički tokeni koji ističu za manje od 7 dana, TikTok tokeni (24 h) pre isteka i
 * LinkedIn (refresh ili obaveštenje pred istek). Publisher i metrike i same osvežavaju TikTok token.
 */
export const socialTokenRefresh = inngest.createFunction(
  { id: 'social-token-refresh', retries: 1, triggers: [cron('0 */6 * * *')] },
  async ({ step }) => {
    const meta = await step.run('refresh-meta', () => refreshExpiringTokens(7))
    const other = await step.run('refresh-linkedin-tiktok', () => refreshOtherTokens())
    return { meta, other }
  },
)
