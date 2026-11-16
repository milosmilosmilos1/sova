import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { logger } from '@/lib/logger'
import type { StepRunner } from '@/services/autopilot/runner'
import { refreshBrandPhotos } from '@/services/design/harmonize'

/**
 * Nove fotografije za nacrte koji čekaju (D-170), za nacrte napravljene pre provere predmeta i oblika
 * fotografije. Jedan brend po pokretanju, nacrt po nacrt sa pauzom. Na kraju posao sam šalje ostale
 * brendove: uspavan posao ne drži mesto u ograničenju istovremenih koraka, pa bi brendovi poslati
 * odjednom radili ispreplitano i zajedno trošili limit sata izvora fotografija. Kad posao padne (korak
 * koji Netlify prekine posle 30 s ne stigne da prijavi grešku, pa pada ceo posao), ostali brendovi se
 * šalju iz `onFailure`, a nacrti palog brenda ostaju za sledeće slanje (D-171).
 */
export const designPhotosRefresh = inngest.createFunction(
  {
    id: 'design-photos-refresh',
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [events.designPhotosRefresh],
    onFailure: async ({ event, step, error }) => {
      const [brandId, ...rest] = event.data.event.data.brandIds
      logger.warn('photo_refresh_run_failed', { brandId, next: rest.length, error })
      if (rest.length)
        await step.sendEvent('next-brand', events.designPhotosRefresh.create({ brandIds: rest }))
    },
  },
  async ({ event, step }) => {
    const [brandId, ...rest] = event.data.brandIds
    const counts = await refreshBrandPhotos(brandId!, {
      run: ((name, fn) => step.run(name, fn)) as StepRunner,
      sleep: async (name, ms) => {
        await step.sleep(name, ms)
      },
    })
    if (rest.length) await step.sendEvent('next-brand', events.designPhotosRefresh.create({ brandIds: rest }))
    return { brandId, ...counts, next: rest.length }
  },
)
