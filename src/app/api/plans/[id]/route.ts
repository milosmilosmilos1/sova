import { assertViewer, createHandler } from '@/lib/api/handler'
import { planParamsSchema } from '@/lib/schemas/plans'
import { deletePlan, getPlan } from '@/services/plans/plans'

/** Plan sa stavkama (ekran ga osvežava dok Sova radi). */
export const GET = createHandler({ auth: 'user', params: planParamsSchema }, async ({ viewer, params }) =>
  getPlan(assertViewer(viewer), params.id),
)

/** Brisanje plana; napravljeni nacrti ostaju. */
export const DELETE = createHandler(
  { auth: 'user', params: planParamsSchema },
  async ({ viewer, params }) => {
    await deletePlan(assertViewer(viewer), params.id)
    return { deleted: true }
  },
)
