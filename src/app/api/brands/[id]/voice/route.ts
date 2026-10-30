import { assertViewer, createHandler } from '@/lib/api/handler'
import { brandVoiceSchema } from '@/lib/schemas/voice'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getVoiceView, saveVoice } from '@/services/brand-brain/voice'

/** Glas brenda (D-112): sačuvan, ili predlog iz profila sa sajta dok vlasnik ne sačuva svoj. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getVoiceView(assertViewer(viewer), params.id),
)

export const PUT = createHandler(
  { auth: 'user', params: uuidParamSchema, body: brandVoiceSchema },
  async ({ viewer, params, body }) => saveVoice(assertViewer(viewer), params.id, body),
)
