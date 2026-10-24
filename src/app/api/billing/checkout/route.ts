import { assertViewer, createHandler } from '@/lib/api/handler'
import { checkoutSchema } from '@/lib/schemas/billing'
import { startSubscriptionCheckout } from '@/services/billing/billing'

/** Stripe Checkout za mesečni ili godišnji plan (vlasnik); klijent ide na vraćeni `url`. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: checkoutSchema,
    rateLimit: { name: 'billing', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => startSubscriptionCheckout(assertViewer(viewer), body),
)
