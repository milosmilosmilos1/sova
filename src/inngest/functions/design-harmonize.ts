import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { logger } from '@/lib/logger'
import type { StepRunner } from '@/services/autopilot/runner'
import { harmonizePost, offThemeDraftIds } from '@/services/design/harmonize'

/**
 * Uskladi nacrte sa temom (D-125): svaka objava koja nije u temi brenda crta se ponovo u svojim
 * koracima (D-122), jedan brend u isto vreme. Objava koja ne uspe ne zaustavlja ostale.
 */
export const designHarmonize = inngest.createFunction(
  {
    id: 'design-harmonize',
    retries: 1,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.designHarmonize],
  },
  async ({ event, step }) => {
    const ids = await step.run('list', () => offThemeDraftIds(event.data.brandId))
    let done = 0
    for (const id of ids) {
      const run = ((name, fn) => step.run(`post-${id}-${name}`, fn)) as StepRunner
      try {
        if ((await harmonizePost(id, run)) === 'done') done++
      } catch (error) {
        logger.warn('harmonize_post_failed', { postId: id, error })
      }
    }
    return { total: ids.length, done }
  },
)
