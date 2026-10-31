import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { StepRunner } from '@/services/autopilot/runner'
import {
  finishPlan,
  finishPlanning,
  interruptPlan,
  pendingItems,
  planningMonths,
  runPlanItem,
  runPlanningMonth,
} from '@/services/plans/runner'

/** Koliko puta se plan sam nastavlja posle pada posla; svaki nastavak troši bar jednu stavku. */
const MAX_PLAN_RESUMES = 20

/**
 * Mesečni plan (D-119): teme za sve termine, jedan korak (i jedan poziv Gemini-ja) po mesecu
 * (D-120), pa posle „Generiši sve” svaki nacrt u svojim koracima (D-122: tekst, fotografije,
 * slajdovi po tri, nacrt), jedan brend u isto vreme. Greška jednog meseca ili jedne stavke ne
 * zaustavlja ostale; pad celog posla ostavlja zaglavljenu stavku u neuspelima i nastavlja dalje.
 */
export const monthPlanCreate = inngest.createFunction(
  {
    id: 'month-plan-create',
    retries: 1,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.monthPlanRequested],
    onFailure: async ({ event }) => {
      await createSupabaseAdminClient()
        .from('month_plans')
        .update({ status: 'failed', error: 'Plan nije napravljen. Pokušajte ponovo.' })
        .eq('id', event.data.event.data.planId)
        .eq('status', 'planning')
    },
  },
  async ({ event, step }) => {
    const months = await step.run('months', () => planningMonths(event.data.planId))
    for (const month of months)
      await step.run(`plan-${month}`, () => runPlanningMonth(event.data.planId, month))
    return step.run('ready', () => finishPlanning(event.data.planId))
  },
)

export const monthPlanGenerate = inngest.createFunction(
  {
    id: 'month-plan-generate',
    retries: 1,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.monthPlanGenerate],
    onFailure: async ({ event, step }) => {
      const data = event.data.event.data
      const left = await step.run('interrupted', () => interruptPlan(data.planId))
      const resumes = data.resumes ?? 0
      if (left > 0 && resumes < MAX_PLAN_RESUMES)
        await step.sendEvent(
          'resume',
          events.monthPlanGenerate.create({ ...data, resume: true, resumes: resumes + 1 }),
        )
      else await step.run('finish', () => finishPlan(data.planId))
    },
  },
  async ({ event, step }) => {
    const ids = await step.run('items', () =>
      pendingItems(event.data.planId, { onlyPlanned: event.data.resume }),
    )
    for (const id of ids) {
      const run = ((name, fn) => step.run(`item-${id}-${name}`, fn)) as StepRunner
      await runPlanItem(id, run)
    }
    return step.run('finish', () => finishPlan(event.data.planId))
  },
)
