import { getPaymentProvider } from '@/integrations/payments'
import { PaymentSignatureError } from '@/integrations/payments/types'
import { ApiError } from '@/lib/api/errors'
import { createHandler } from '@/lib/api/handler'
import { enqueueBillingEvent } from '@/lib/jobs/enqueue'
import { recordPaymentEvent } from '@/services/billing/events'

/**
 * Stripe webhook (D-090): sirovo telo za proveru potpisa, upis događaja (isti ID dvaput → 200 bez
 * obrade, T6) i brz 2xx; obrada ide u pozadini. Ako slanje u pozadinu padne, događaj ostaje
 * `received` i Stripe ga šalje ponovo (500), a obrada je idempotentna.
 */
export const POST = createHandler(
  { auth: 'none', rateLimit: { name: 'webhook-payments', limit: 600, windowSec: 60, by: 'ip' } },
  async ({ req, log }) => {
    const provider = getPaymentProvider()
    if (!provider.isConfigured()) throw new ApiError('BILLING_UNAVAILABLE', 'Naplata još nije podešena.')
    const raw = await req.text()
    let event
    try {
      event = provider.parseWebhook(raw, req.headers.get('stripe-signature'))
    } catch (error) {
      if (error instanceof PaymentSignatureError) {
        log.warn('payment_webhook_bad_signature', { message: error.message })
        throw new ApiError('VALIDATION', 'Potpis webhook-a nije ispravan.')
      }
      throw error
    }
    const saved = await recordPaymentEvent(event)
    // ponovljen događaj koji još nije obrađen (npr. ranije slanje u pozadinu palo) ide ponovo
    if (!saved.duplicate || saved.status === 'received' || saved.status === 'failed')
      await enqueueBillingEvent(saved.id)
    return { received: true, duplicate: saved.duplicate }
  },
)
