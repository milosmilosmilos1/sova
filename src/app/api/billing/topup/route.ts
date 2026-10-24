import { assertViewer, createHandler } from '@/lib/api/handler'
import { checkoutSchema } from '@/lib/schemas/billing'
import { startTopupCheckout } from '@/services/billing/billing'

/** Stripe Checkout za paket tokena (vlasnik). */
export const POST = createHandler(
  {
    auth: 'verified',
    body: checkoutSchema,
    rateLimit: { name: 'billing', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => startTopupCheckout(assertViewer(viewer), body),
)
