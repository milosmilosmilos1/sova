import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import type { StepRunner } from '@/services/autopilot/runner'
import { runMediaCleanup } from '@/services/media-cleanup'

/**
 * Čišćenje skladišta (D-168): svake noći u 04:30 UTC po pravilima vlasnika (pomoćni fajlovi 30 dana
 * posle objave, korpa 30 dana, stare verzije 7 dana). Isto čišćenje pokrenuto iz admin panela
 * („Očisti otpad sada”) briše odmah sve što nijedna objava ne koristi.
 */
export const mediaCleanupDaily = inngest.createFunction(
  { id: 'media-cleanup-daily', retries: 2, concurrency: [{ limit: 1 }], triggers: [cron('30 4 * * *')] },
  async ({ step }) => runMediaCleanup(((name, fn) => step.run(name, fn)) as StepRunner, 'daily', null),
)

export const mediaCleanupNow = inngest.createFunction(
  {
    id: 'media-cleanup-now',
    retries: 2,
    concurrency: [{ limit: 1 }],
    triggers: [events.mediaCleanupRequested],
  },
  async ({ event, step }) =>
    runMediaCleanup(((name, fn) => step.run(name, fn)) as StepRunner, 'catch-up', event.data.requestedBy),
)
