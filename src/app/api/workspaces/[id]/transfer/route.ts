import { assertViewer, createHandler } from '@/lib/api/handler'
import { transferOwnershipSchema } from '@/lib/schemas/account'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { transferOwnership } from '@/services/account'

/** Prenos vlasništva radnog prostora na postojećeg člana (samo vlasnik). */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: transferOwnershipSchema,
    rateLimit: { name: 'workspace-transfer', limit: 10, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, params, body }) => {
    await transferOwnership(assertViewer(viewer), params.id, body.userId)
    return { transferred: true }
  },
)
