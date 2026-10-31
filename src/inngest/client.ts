import { Inngest } from 'inngest'

/**
 * Jedan Inngest klijent za celu aplikaciju. Ključevi (INNGEST_EVENT_KEY,
 * INNGEST_SIGNING_KEY) se čitaju iz env-a; lokalno nisu potrebni jer
 * `npm run inngest:dev` sam nalazi /api/inngest.
 */
export const inngest = new Inngest({
  id: 'sova',
  isDev: process.env.NODE_ENV !== 'production' && !process.env.INNGEST_EVENT_KEY,
  // Netlify prekida zahtev posle 30 s (D-122). SDK u jednom zahtevu izvršava korake redom dok ne
  // prođe `maxRuntime` (podrazumevano 10 s), a staje tek posle koraka koji je u toku, pa zahtev traje
  // do `maxRuntime` + jedan korak. Sa 2 s se kratki koraci i dalje spajaju, a dug korak ide sam.
  checkpointing: { maxRuntime: '2s' },
})
