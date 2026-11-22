import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import type { StepRunner } from '@/services/autopilot/runner'
import { claimDueRuns, hasDueFlows } from '@/services/flows/flows'
import { runFlow } from '@/services/flows/runner'

/**
 * Tokovi automatizacije (D-108):
 * - `flows-tick`: na 30 min upisuje prolaze tokova kojima je došao termin i šalje događaj po prolazu;
 *   tok pravi nacrt za odobravanje, pa pola sata kasnije ne smeta; bez dospelog toka jedno
 *   izvršavanje, bez koraka (D-191);
 * - `flow-run`: jedan prolaz (tekst, slajdovi, nacrt na odobravanje), najviše dva u isto vreme po radnom prostoru.
 */
export const flowsTick = inngest.createFunction(
  { id: 'flows-tick', retries: 1, triggers: [cron('*/30 * * * *')] },
  async ({ step }) => {
    if (!(await hasDueFlows(new Date()))) return { runs: 0 }
    const claimed = await step.run('claim', () => claimDueRuns(new Date()))
    if (claimed.length)
      await step.sendEvent(
        'fan-out',
        claimed.map((c) => events.flowRunRequested.create({ runId: c.runId, workspaceId: c.workspaceId })),
      )
    return { runs: claimed.length }
  },
)

export const flowRun = inngest.createFunction(
  {
    id: 'flow-run',
    retries: 1,
    concurrency: [{ key: 'event.data.workspaceId', limit: 2 }],
    triggers: [events.flowRunRequested],
  },
  async ({ event, step }) => {
    const run = ((name, fn) => step.run(name, fn)) as StepRunner
    return runFlow(event.data.runId, run)
  },
)
