import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { logger } from '@/lib/logger'
import { capturePostMetrics, dueMetricCaptures, type DueCapture } from '@/services/analytics/metrics'
import { checkOutlier } from '@/services/autopilot/triggers'

/** Snimaka u jednom koraku: mreže odgovaraju za 1 do 2 s, pa grupa staje u jedan zahtev. */
const CHUNK = 8

/**
 * Metrike objava (D-191): jednom na sat snimci +1 h, +24 h, +7 d i +30 d za sve objave kojima su
 * dospeli. Ranije je svaka objava imala svoj run koji je spavao do svakog horizonta (oko 9
 * izvršavanja po objavi). Prolaz bez posla je jedno izvršavanje (provera pre prvog koraka); spisak
 * se zatim pamti u koraku `due`, a snimci idu u grupama. Greška jedne objave ne prekida grupu:
 * snimak bez zapisa ostaje dospeo i hvata ga sledeći prolaz.
 */
export const postMetricsSweep = inngest.createFunction(
  { id: 'post-metrics-sweep', retries: 1, concurrency: { limit: 1 }, triggers: [cron('7 * * * *')] },
  async ({ step }) => {
    if (!(await dueMetricCaptures(new Date(), 1)).length) return { due: 0, captured: 0 }
    const due = await step.run('due', () => dueMetricCaptures(new Date(), 200))
    let captured = 0
    for (let i = 0; i < due.length; i += CHUNK) {
      const chunk: DueCapture[] = due.slice(i, i + CHUNK)
      captured += await step.run(`capture-${i / CHUNK}`, async () => {
        let n = 0
        for (const d of chunk) {
          try {
            const r = await capturePostMetrics(d.targetId, d.horizon)
            if (r.status !== 'captured') continue
            n += 1
            if (d.horizon === '24h') await checkOutlier(d.targetId)
          } catch (error) {
            logger.warn('post_metrics_sweep_failed', { targetId: d.targetId, horizon: d.horizon, error })
          }
        }
        return n
      })
    }
    return { due: due.length, captured }
  },
)
