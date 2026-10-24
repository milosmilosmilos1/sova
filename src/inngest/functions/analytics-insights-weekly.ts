import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { runWeeklyInsights } from '@/services/analytics/insights'

/** Nedeljom u 18:00 UTC: 3–5 uvida po brendu za poslednjih 7 dana → `insights` + predlozi u Inbox. */
export const analyticsInsightsWeekly = inngest.createFunction(
  { id: 'analytics-insights-weekly', retries: 1, triggers: [cron('0 18 * * 0')] },
  async ({ step }) => step.run('insights', () => runWeeklyInsights()),
)
