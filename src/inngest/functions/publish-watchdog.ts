import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { toInngestEvent } from '@/inngest/functions/publish-target'
import { runWatchdog, type StepRunner } from '@/services/posts/publisher'

/**
 * Sigurnosna mreža (ARCHITECTURE 3.3, K11): na 5 min traži targete koji kasne > 3 min bez
 * skorašnjeg pokušaja i ponovo šalje `post/target.scheduled`; posle 15 min alarm vlasnicima;
 * `publishing` bez pokušaja 30 min vraća u `scheduled`.
 */
export const publishWatchdog = inngest.createFunction(
  { id: 'publish-watchdog', retries: 1, triggers: [cron('*/5 * * * *')] },
  async ({ step }) =>
    runWatchdog({
      run: ((name, fn) => step.run(name, fn)) as StepRunner,
      sendEvent: async (name, ev) => {
        await step.sendEvent(name, toInngestEvent(ev))
      },
    }),
)
