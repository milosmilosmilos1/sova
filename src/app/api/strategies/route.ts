import { assertViewer, createHandler } from '@/lib/api/handler'
import { listStrategiesQuerySchema } from '@/lib/schemas/strategy'
import { listStrategies } from '@/services/strategy/strategy'

/** Strategije brenda, najnoviji period i verzija prvi. */
export const GET = createHandler(
  { auth: 'verified', query: listStrategiesQuerySchema },
  async ({ viewer, query }) => ({
    strategies: await listStrategies(assertViewer(viewer), query.brandId),
  }),
)
