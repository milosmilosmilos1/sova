import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { logger } from '@/lib/logger'
import {
  handlePublishRunFailure,
  runPublishTarget,
  type OutgoingEvent,
  type StepRunner,
} from '@/services/posts/publisher'

/** Događaji koje publisher šalje (ponovno zakazivanje, objavljeno) kao Inngest payload. */
export function toInngestEvent(ev: OutgoingEvent) {
  return ev.kind === 'scheduled'
    ? events.postTargetScheduled.create({
        targetId: ev.targetId,
        scheduledAt: ev.scheduledAt,
        version: ev.version,
        socialAccountId: ev.socialAccountId,
      })
    : events.postTargetPublished.create({
        targetId: ev.targetId,
        socialAccountId: ev.socialAccountId,
        brandId: ev.brandId,
      })
}

/**
 * Objavljivanje jednog targeta (ARCHITECTURE 3.3): spava do termina, otkazuje se na
 * `post/target.unscheduled` sa istim targetId, jedan run po nalogu mreže u isto vreme.
 * Pokušaji prema mreži (3, pauze 1/5/15 min) su u servisu; `retries` ovde pokriva samo
 * naše greške (baza, mreža do Supabase-a), a `onFailure` otključava target.
 */
export const publishTarget = inngest.createFunction(
  {
    id: 'publish-target',
    retries: 3,
    concurrency: [{ key: 'event.data.socialAccountId', limit: 1 }],
    cancelOn: [{ event: 'post/target.unscheduled', match: 'data.targetId' }],
    triggers: [events.postTargetScheduled],
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event?: { data?: { targetId?: string } } }).event?.data
      if (!original?.targetId) return
      logger.error('publish_target_run_failed', { targetId: original.targetId, error: error.message })
      await handlePublishRunFailure(original.targetId, error.message)
    },
  },
  async ({ event, step, runId }) => {
    const run = ((name, fn) => step.run(name, fn)) as StepRunner
    return runPublishTarget(event.data, {
      run,
      runId,
      sleepUntil: (name, at) => step.sleepUntil(name, at),
      sleep: (name, ms) => step.sleep(name, ms),
      sendEvent: async (name, ev) => {
        await step.sendEvent(name, toInngestEvent(ev))
      },
    })
  },
)
