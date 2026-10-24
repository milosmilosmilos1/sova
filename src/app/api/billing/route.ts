import { assertViewer, createHandler } from '@/lib/api/handler'
import { billingWorkspaceSchema } from '@/lib/schemas/billing'
import { getBillingOverview } from '@/services/billing/billing'

/** Plan, pretplata, stanje tokena i cenovnik radnog prostora (svaki član vidi, menja samo vlasnik). */
export const GET = createHandler({ auth: 'user', query: billingWorkspaceSchema }, async ({ viewer, query }) =>
  getBillingOverview(assertViewer(viewer), query.workspaceId),
)
