import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { removeSocialAccount } from '@/services/social/accounts'

/** Prekid veze sa nalogom (owner ili admin): token se briše, uvezene objave kaskadno. */
export const DELETE = createHandler(
  { auth: 'verified', params: uuidParamSchema },
  async ({ viewer, params }) => {
    await removeSocialAccount(assertViewer(viewer), params.id)
    return { removed: true }
  },
)
