import { assertViewer, createHandler } from '@/lib/api/handler'
import { planItemsDeleteSchema, planParamsSchema } from '@/lib/schemas/plans'
import { deletePlanItems } from '@/services/plans/plans'

/** Brisanje označenih stavki plana. */
export const POST = createHandler(
  { auth: 'user', params: planParamsSchema, body: planItemsDeleteSchema },
  async ({ viewer, params, body }) => deletePlanItems(assertViewer(viewer), params.id, body.ids),
)
