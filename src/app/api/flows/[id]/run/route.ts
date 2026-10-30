import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { startManualRun } from '@/services/flows/flows'

/** „Generiši odmah” (D-108): prolaz toka bez čekanja termina; napredak kroz GET /api/flows/runs/[runId]. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    rateLimit: { name: 'flows-run', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, requestId }) =>
    jsonOk(await startManualRun(assertViewer(viewer), params.id), requestId, { status: 202 }),
)
