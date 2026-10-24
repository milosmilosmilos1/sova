import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { runAccountMetricsSweep } from '@/services/analytics/metrics'

/** Dnevno u 04:00 UTC: metrike naloga (pratioci, doseg, pregledi profila) za jučerašnji dan. */
export const socialAccountMetrics = inngest.createFunction(
  { id: 'social-account-metrics', retries: 1, triggers: [cron('0 4 * * *')] },
  async ({ step }) => step.run('sweep', () => runAccountMetricsSweep()),
)
