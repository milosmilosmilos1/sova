import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { refreshExpiringTokens } from '@/services/social/refresh'

/** Dnevno u 03:00 UTC: produžava Meta korisničke tokene koji ističu za manje od 7 dana. */
export const socialTokenRefresh = inngest.createFunction(
  { id: 'social-token-refresh', retries: 1, triggers: [cron('0 3 * * *')] },
  async ({ step }) => step.run('refresh', () => refreshExpiringTokens(7)),
)
