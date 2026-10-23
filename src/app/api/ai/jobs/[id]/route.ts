import { assertViewer, createHandler } from '@/lib/api/handler'
import { jobIdParamSchema } from '@/lib/schemas/ai'
import { getGenerationView } from '@/services/ai/generations'

/** Status i rezultat AI posla (klijent ovo poziva dok ne stigne Realtime). */
export const GET = createHandler({ auth: 'user', params: jobIdParamSchema }, async ({ viewer, params }) =>
  getGenerationView(assertViewer(viewer), params.id),
)
