import { assertViewer, createHandler } from '@/lib/api/handler'
import { billingWorkspaceSchema } from '@/lib/schemas/billing'
import { openBillingPortal } from '@/services/billing/billing'

/** Stripe Customer Portal: kartica, fakture, otkaz i promena plana (vlasnik). */
export const POST = createHandler(
  {
    auth: 'verified',
    body: billingWorkspaceSchema,
    rateLimit: { name: 'billing', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => openBillingPortal(assertViewer(viewer), body.workspaceId),
)
