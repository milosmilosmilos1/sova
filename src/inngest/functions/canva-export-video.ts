import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { logger } from '@/lib/logger'
import {
  collectCanvaVideoExport,
  failCanvaVideoExport,
  startCanvaVideoExport,
  VIDEO_RESOLUTIONS,
} from '@/services/canva/video'

/** Provera na 5 s prvih pola minuta, pa na 15 s; ukupno oko 9 minuta čekanja po rezoluciji. */
const POLL_DELAYS_MS = [...Array<number>(6).fill(5_000), ...Array<number>(34).fill(15_000)]

/**
 * Video iz Canve u biblioteku (D-104). Svaki korak je poseban poziv funkcije, pa ni dug Canva
 * export ne prelazi Netlify limit od 60 s; prevelik 1080p fajl se ponavlja u 720p.
 */
export const canvaExportVideo = inngest.createFunction(
  {
    id: 'canva-export-video',
    retries: 2,
    concurrency: [{ key: 'event.data.workspaceId', limit: 2 }],
    triggers: [events.canvaVideoExportRequested],
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event?: { data?: { generationId?: string } } }).event?.data
      if (!original?.generationId) return
      logger.error('canva_video_run_failed', { generationId: original.generationId, error: error.message })
      await failCanvaVideoExport(original.generationId, 'internal')
    },
  },
  async ({ event, step }) => {
    const { generationId } = event.data
    for (const resolution of VIDEO_RESOLUTIONS) {
      const started = await step.run(`start-${resolution}`, () =>
        startCanvaVideoExport(generationId, resolution),
      )
      if (started.status !== 'started') return started

      let outcome: Awaited<ReturnType<typeof collectCanvaVideoExport>> = { status: 'in_progress' }
      for (let i = 0; i < POLL_DELAYS_MS.length && outcome.status === 'in_progress'; i++) {
        await step.sleep(`wait-${resolution}-${i}`, POLL_DELAYS_MS[i]!)
        outcome = await step.run(`collect-${resolution}-${i}`, () =>
          collectCanvaVideoExport(generationId, started.jobId, resolution),
        )
      }
      if (outcome.status === 'in_progress')
        return step.run('timeout', () => failCanvaVideoExport(generationId, 'timeout'))
      if (outcome.status !== 'too_large') return outcome
    }
    return step.run('too-large', () => failCanvaVideoExport(generationId, 'too_large'))
  },
)
