import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import type { StepRunner } from '@/services/autopilot/runner'
import { claimDueRuns } from '@/services/flows/flows'
import { runFlow } from '@/services/flows/runner'

/**
 * Tokovi automatizacije (D-108):
 * - `flows-tick`: na 15 min upisuje prolaze tokova kojima je došao termin i šalje događaj po prolazu;
 * - `flow-run`: jedan prolaz (tekst, slajdovi, nacrt na odobravanje), najviše dva u isto vreme po radnom prostoru.
 */
export const flowsTick = inngest.createFunction(
  { id: 'flows-tick', retries: 1, triggers: [cron('*/15 * * * *')] },
  async ({ step }) => {
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
