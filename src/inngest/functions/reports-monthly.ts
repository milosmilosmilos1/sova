import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { deliverMonthlyReport, listDueMonthlyReports } from '@/services/reports/monthly'

/**
 * Mesečni PDF izveštaj (D-094):
 * - `reports-monthly`: na sat 1. i 2. u mesecu (UTC); brendovima kojima je po njihovoj zoni 1. od
 *   06:00 šalje događaj, kao Autopilot nedeljni prolaz;
 * - `report-monthly-brand`: jedan brend, jedan izveštaj u isto vreme; poslat izveštaj se preskače.
 */
export const reportsMonthly = inngest.createFunction(
  { id: 'reports-monthly', retries: 1, triggers: [cron('0 * 1,2 * *')] },
  async ({ step }) => {
    const due = await step.run('due', () => listDueMonthlyReports(new Date()))
    if (due.length)
      await step.sendEvent(
        'fan-out',
        due.map((d) => events.reportMonthlyRequested.create(d)),
      )
    return { brands: due.length }
  },
)

export const reportMonthlyBrand = inngest.createFunction(
  {
    id: 'report-monthly-brand',
    retries: 2,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.reportMonthlyRequested],
  },
  async ({ event, step }) =>
    step.run('deliver', () => deliverMonthlyReport(event.data.brandId, event.data.month)),
)
