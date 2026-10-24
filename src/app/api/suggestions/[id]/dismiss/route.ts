import { assertViewer, createHandler } from '@/lib/api/handler'
import { suggestionParamsSchema } from '@/lib/schemas/autopilot'
import { dismissSuggestion } from '@/services/suggestions'

/** Odbacivanje predloga. */
export const POST = createHandler(
  { auth: 'verified', params: suggestionParamsSchema },
  async ({ viewer, params }) => dismissSuggestion(assertViewer(viewer), params.id),
)
