import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { syncSocialAccount } from '@/services/social/accounts'

/** Osvežavanje naloga sa mreže (ime, avatar, pratioci, token) + nov uvoz istorije. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    rateLimit: { name: 'social-sync', limit: 10, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params }) => syncSocialAccount(assertViewer(viewer), params.id),
)
