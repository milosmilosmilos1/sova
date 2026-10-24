import { assertViewer, createHandler } from '@/lib/api/handler'
import { acceptSuggestionSchema, suggestionParamsSchema } from '@/lib/schemas/autopilot'
import { acceptSuggestion } from '@/services/suggestions'

/** Prihvatanje predloga: nastaje nacrt (ili vodimo na Brand Brain / strategiju); opcione izmene naslova i teksta. */
export const POST = createHandler(
  { auth: 'verified', params: suggestionParamsSchema, body: acceptSuggestionSchema },
  async ({ viewer, params, body }) => acceptSuggestion(assertViewer(viewer), params.id, body),
)
