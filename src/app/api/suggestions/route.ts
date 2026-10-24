import { assertViewer, createHandler } from '@/lib/api/handler'
import { listSuggestionsQuerySchema } from '@/lib/schemas/autopilot'
import { listSuggestions } from '@/services/suggestions'

/** Inbox predloga brenda (podrazumevano novi, po oceni), sa brojem po statusu. */
export const GET = createHandler(
  { auth: 'verified', query: listSuggestionsQuerySchema },
  async ({ viewer, query }) =>
    listSuggestions(assertViewer(viewer), query.brandId, query.status, query.limit),
)
