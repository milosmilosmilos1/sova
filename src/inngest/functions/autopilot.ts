import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { logger } from '@/lib/logger'
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
 * - `autopilot-deadlines`: na 15 min, rokovi za odobrenje i zakazivanje odobrenih (jedno izvršavanje);
 * - `autopilot-daily`: 05:00 UTC, istek predloga, praznici, mesečna strategija od 25. u mesecu.
 */
export const autopilotWeekly = inngest.createFunction(
  { id: 'autopilot-weekly', retries: 1, triggers: [cron('0 * * * *')] },
  async ({ step }) => {
    // samo čitanje: bez brenda na redu prolaz je jedno izvršavanje, bez koraka (D-191)
    if (!(await dueWeeklyBrands(new Date())).length) return { brands: 0 }
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

// jedan posao bez koraka: korak ne štiti ništa (nema drugih koraka), a troši još jedno izvršavanje (D-191);
// na 15 min ostaje, jer odobrena objava mora da se zakaže pre svog termina
export const autopilotDeadlines = inngest.createFunction(
  { id: 'autopilot-deadlines', retries: 1, triggers: [cron('*/15 * * * *')] },
  async () => runAutopilotDeadlines(),
)

export const autopilotDaily = inngest.createFunction(
  { id: 'autopilot-daily', retries: 1, triggers: [cron('0 5 * * *')] },
  async ({ step }) => {
    const expired = await step.run('expire-suggestions', () => expireSuggestions())
    const holidays = await step.run('holiday-suggestions', () => holidaySuggestions())
    const brands = await step.run('monthly-due', () => dueMonthlyBrands(new Date()))
    const monthly: Record<string, string> = {}
    for (const brandId of brands) {
      // greška jednog brenda ne sme da zaustavi mesečni prolaz za brendove posle njega
      const r = await step.run(`monthly-${brandId}`, async () => {
        try {
          return await runMonthlyForBrand(brandId)
        } catch (error) {
          logger.error('autopilot_monthly_failed', { brandId, error })
          return { status: 'failed' as const }
        }
      })
      monthly[brandId] = r.status
    }
    return { expired, holidays, monthly }
  },
)
