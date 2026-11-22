import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { toInngestEvent } from '@/inngest/functions/publish-target'
import { hasLateTargets, runWatchdog, type StepRunner } from '@/services/posts/publisher'

/**
 * Sigurnosna mreža (ARCHITECTURE 3.3, K11): traži targete koji kasne > 3 min bez skorašnjeg
 * pokušaja i ponovo šalje `post/target.scheduled`; posle 15 min alarm vlasnicima; `publishing` bez
 * pokušaja 30 min vraća u `scheduled`. Na 15 min, ne na 5 (D-191): objava ima svoj `sleepUntil`, a
 * watchdog hvata samo izgubljen događaj, pa 10 minuta više u tom retkom slučaju ne smeta. Bez
 * zakasnelih targeta prolaz je jedno izvršavanje, bez koraka.
 */
export const publishWatchdog = inngest.createFunction(
  { id: 'publish-watchdog', retries: 1, triggers: [cron('*/15 * * * *')] },
  async ({ step }) => {
    if (!(await hasLateTargets(new Date()))) return { resent: 0, alarms: 0, unstuck: 0 }
    return runWatchdog({
      run: ((name, fn) => step.run(name, fn)) as StepRunner,
      sendEvent: async (name, ev) => {
        await step.sendEvent(name, toInngestEvent(ev))
      },
    })
  },
)
