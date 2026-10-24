import { assertViewer, createHandler } from '@/lib/api/handler'
import { socialAccountsQuerySchema } from '@/lib/schemas/social'
import { listSocialAccounts } from '@/services/social/accounts'

/** Nalozi mreža brenda (bez tokena) + nalozi na čekanju iz tekućeg povezivanja + dostupnost. */
export const GET = createHandler(
  { auth: 'user', query: socialAccountsQuerySchema },
  async ({ viewer, query }) => listSocialAccounts(assertViewer(viewer), query.brandId, query.pending ?? null),
)
