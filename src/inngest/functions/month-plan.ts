import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  finishPlan,
  finishPlanning,
  pendingItems,
  planningMonths,
  runPlanItem,
  runPlanningMonth,
} from '@/services/plans/runner'

/**
 * Mesečni plan (D-119): teme za sve termine, jedan korak (i jedan poziv Gemini-ja) po mesecu
 * (D-120), pa posle „Generiši sve” svaki nacrt kao poseban korak, jedan brend u isto vreme.
 * Greška jednog meseca ili jedne stavke ne zaustavlja ostale.
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
    onFailure: async ({ event }) => {
      await finishPlan(event.data.event.data.planId)
    },
  },
  async ({ event, step }) => {
    const ids = await step.run('items', () => pendingItems(event.data.planId))
    for (const id of ids) await step.run(`item-${id}`, () => runPlanItem(id))
    return step.run('finish', () => finishPlan(event.data.planId))
  },
)
