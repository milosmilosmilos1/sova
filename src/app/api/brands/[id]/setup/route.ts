import { assertViewer, createHandler } from '@/lib/api/handler'
import { completeSetupSchema } from '@/lib/schemas/setup'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { completeSetup, getSetupState } from '@/services/setup'

/** Stanje uvoda u sedam koraka (D-112). */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getSetupState(assertViewer(viewer), params.id),
)

/** Kraj uvoda: izabrane teme postaju tokovi, ili preskok bez tokova. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: completeSetupSchema,
    rateLimit: { name: 'brand-setup', limit: 10, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body }) => completeSetup(assertViewer(viewer), params.id, body),
)
