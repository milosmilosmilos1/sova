import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { logger } from '@/lib/logger'
import { markCrawlFailed } from '@/services/brand-brain/crawl'
import { runAnalysisPipeline, type AnalysisJob, type StepRunner } from '@/services/brand-brain/pipeline'

/**
 * Analiza sajta (docs/ARCHITECTURE.md 3.5): jedan run po brendu u isto vreme, najviše dva
 * po workspace-u; otkazivanje kroz `brand/analyze.canceled` sa istim crawlId.
 */
export const brandAnalyze = inngest.createFunction(
  {
    id: 'brand-analyze',
    retries: 3,
    concurrency: [
      { key: 'event.data.brandId', limit: 1 },
      { key: 'event.data.workspaceId', limit: 2 },
    ],
    cancelOn: [{ event: 'brand/analyze.canceled', match: 'data.crawlId' }],
    triggers: [events.brandAnalyzeRequested],
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event?: { data?: Partial<AnalysisJob> } }).event?.data
      if (!original?.crawlId) return
      logger.error('brand_analyze_run_failed', { crawlId: original.crawlId, error: error.message })
      await markCrawlFailed(
        original.crawlId,
        'INTERNAL',
        'Analiza je prekinuta zbog greške na našoj strani. Pokušajte ponovo, a ako se ponavlja javite podršci.',
      )
    },
  },
  async ({ event, step }) => {
    const run = ((name, fn) => step.run(name, fn)) as StepRunner
    return runAnalysisPipeline(event.data, run)
  },
)
