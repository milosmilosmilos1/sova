import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { refreshExpiringTokens, refreshOtherTokens } from '@/services/social/refresh'

/**
 * Na 6 h: Meta korisnički tokeni koji ističu za manje od 7 dana, TikTok tokeni (24 h) pre isteka i
 * LinkedIn (refresh ili obaveštenje pred istek). Publisher i metrike i same osvežavaju TikTok token.
 */
export const socialTokenRefresh = inngest.createFunction(
  { id: 'social-token-refresh', retries: 1, triggers: [cron('0 */6 * * *')] },
  // bez koraka (D-191): osvežavanje je idempotentno, pa ponovljen pokušaj posle greške ne smeta
  async () => {
    const meta = await refreshExpiringTokens(7)
    const other = await refreshOtherTokens()
    return { meta, other }
  },
)
