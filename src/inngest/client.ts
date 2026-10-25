import { Inngest } from 'inngest'

/**
 * Jedan Inngest klijent za celu aplikaciju. Ključevi (INNGEST_EVENT_KEY,
 * INNGEST_SIGNING_KEY) se čitaju iz env-a; lokalno nisu potrebni jer
 * `npm run inngest:dev` sam nalazi /api/inngest.
 */
export const inngest = new Inngest({
  id: 'sova',
  isDev: process.env.NODE_ENV !== 'production' && !process.env.INNGEST_EVENT_KEY,
})
