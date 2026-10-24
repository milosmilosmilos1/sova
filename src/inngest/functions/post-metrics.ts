import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { CAPTURE_HORIZONS, horizonDue } from '@/lib/analytics/aggregate'
import { capturePostMetrics, publishedAtOf, type CaptureStatus } from '@/services/analytics/metrics'

/**
 * Metrike objave (ARCHITECTURE 6, `post-metrics`): posle objavljivanja spava do +1 h, +24 h, +7 d i
 * +30 d i svaki put povlači snimak (poseban step). Prestaje ako je objava obrisana na mreži (N6)
 * ili target više nije objavljen.
 */
export const postMetrics = inngest.createFunction(
  {
    id: 'post-metrics',
    retries: 3,
    concurrency: [{ key: 'event.data.socialAccountId', limit: 2 }],
    triggers: [events.postTargetPublished],
  },
  async ({ event, step }) => {
    const publishedAt = await step.run('load', () => publishedAtOf(event.data.targetId))
    if (!publishedAt) return { status: 'skipped' as const }
    const results: Partial<Record<(typeof CAPTURE_HORIZONS)[number], CaptureStatus>> = {}
    for (const horizon of CAPTURE_HORIZONS) {
      const due = horizonDue(publishedAt, horizon)
      if (due.getTime() > Date.now()) await step.sleepUntil(`wait-${horizon}`, due)
      const r = await step.run(`capture-${horizon}`, () => capturePostMetrics(event.data.targetId, horizon))
      results[horizon] = r.status
      if (r.status === 'deleted') break
      if (r.status === 'skipped' && /target|nalog/.test(r.reason ?? '')) break
    }
    return { status: 'done' as const, results }
  },
)
