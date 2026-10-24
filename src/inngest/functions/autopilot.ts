import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { runAutopilotDeadlines } from '@/services/autopilot/deadlines'
import {
  dueMonthlyBrands,
  dueWeeklyBrands,
  runMonthlyForBrand,
  runWeeklyForBrand,
  type StepRunner,
} from '@/services/autopilot/runner'
import { expireSuggestions, holidaySuggestions } from '@/services/autopilot/triggers'

/**
 * Autopilot (ARCHITECTURE 6, brif 9.3):
 * - `autopilot-weekly`: cron na sat; brendovima kojima je ponedeljak 06:00+ po njihovoj zoni šalje događaj;
 * - `autopilot-brand-week`: jedan brend, jedan run u isto vreme; svaki nacrt je poseban step;
 * - `autopilot-deadlines`: na 15 min, rokovi za odobrenje i zakazivanje odobrenih;
 * - `autopilot-daily`: 05:00 UTC, istek predloga, praznici, mesečna strategija od 25. u mesecu.
 */
export const autopilotWeekly = inngest.createFunction(
  { id: 'autopilot-weekly', retries: 1, triggers: [cron('0 * * * *')] },
  async ({ step }) => {
    const due = await step.run('due', () => dueWeeklyBrands(new Date()))
    if (due.length) {
      await step.sendEvent(
        'fan-out',
        due.map((d) =>
          events.autopilotWeekRequested.create({
            brandId: d.brandId,
            weekStart: d.weekStart,
            triggeredBy: null,
          }),
        ),
      )
    }
    return { brands: due.length }
  },
)

export const autopilotBrandWeek = inngest.createFunction(
  {
    id: 'autopilot-brand-week',
    retries: 2,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.autopilotWeekRequested],
  },
  async ({ event, step }) => {
    const run = ((name, fn) => step.run(name, fn)) as StepRunner
    return runWeeklyForBrand(event.data, run)
  },
)

export const autopilotDeadlines = inngest.createFunction(
  { id: 'autopilot-deadlines', retries: 1, triggers: [cron('*/15 * * * *')] },
  async ({ step }) => step.run('deadlines', () => runAutopilotDeadlines()),
)

export const autopilotDaily = inngest.createFunction(
  { id: 'autopilot-daily', retries: 1, triggers: [cron('0 5 * * *')] },
  async ({ step }) => {
    const expired = await step.run('expire-suggestions', () => expireSuggestions())
    const holidays = await step.run('holiday-suggestions', () => holidaySuggestions())
    const brands = await step.run('monthly-due', () => dueMonthlyBrands(new Date()))
    const monthly: Record<string, string> = {}
    for (const brandId of brands) {
      const r = await step.run(`monthly-${brandId}`, () => runMonthlyForBrand(brandId))
      monthly[brandId] = r.status
    }
    return { expired, holidays, monthly }
  },
)
