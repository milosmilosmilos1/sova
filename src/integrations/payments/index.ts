import 'server-only'

import { StripePaymentProvider } from './stripe'
import type { PaymentProvider } from './types'

let override: PaymentProvider | null = null
let singleton: PaymentProvider | null = null

/** Provajder naplate iz `PAYMENT_PROVIDER` (danas samo Stripe, D-090). */
export function getPaymentProvider(): PaymentProvider {
  return override ?? (singleton ??= new StripePaymentProvider())
}

export function setPaymentProviderForTests(provider: PaymentProvider | null): void {
  override = provider
  singleton = null
}
