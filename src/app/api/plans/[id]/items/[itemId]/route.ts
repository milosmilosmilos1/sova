import { assertViewer, createHandler } from '@/lib/api/handler'
import { planItemParamsSchema, planItemUpdateSchema } from '@/lib/schemas/plans'
import { updatePlanItem } from '@/services/plans/plans'

/** Izmena stavke plana: tema, opis, vrsta, datum i vreme. */
export const PATCH = createHandler(
  { auth: 'user', params: planItemParamsSchema, body: planItemUpdateSchema },
  async ({ viewer, params, body }) => updatePlanItem(assertViewer(viewer), params.id, params.itemId, body),
)
