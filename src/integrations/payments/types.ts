/**
 * Provajder naplate (D-001, D-090): danas Stripe, iza istog interfejsa i drugi ako zatreba.
 * Tipovi su normalizovani, pa servis naplate ne zavisi od oblika Stripe objekata.
 */
export type ProviderSubscriptionStatus =
  'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'paused'

export interface ProviderSubscription {
  id: string
  customerId: string
  status: ProviderSubscriptionStatus
  priceId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  metadata: Record<string, string>
}

interface CheckoutBase {
  customerId: string
  workspaceId: string
  planCode: string
  successUrl: string
  cancelUrl: string
}

export interface SubscriptionCheckoutInput extends CheckoutBase {
  priceId: string
}

export interface TopupCheckoutInput extends CheckoutBase {
  name: string
  amountCents: number
  currency: string
}

/** Događaj sa proverenim potpisom; `object` je `data.object` iz webhook-a. */
export interface PaymentEvent {
  id: string
  type: string
  created: number
  object: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: 'stripe'
  isConfigured(): boolean
  createCustomer(input: { workspaceId: string; email: string | null; name: string }): Promise<string>
  createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<{ id: string; url: string }>
  createTopupCheckout(input: TopupCheckoutInput): Promise<{ id: string; url: string }>
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>
  /** Proverava potpis; neispravan ili zastareo potpis baca `PaymentSignatureError`. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent
  getSubscription(id: string): Promise<ProviderSubscription>
  /** ID fakture plaćene ovim payment intent-om (povraćaj novca za pretplatu). */
  invoiceForPaymentIntent(paymentIntentId: string): Promise<string | null>
  /** ID Checkout sesije plaćene ovim payment intent-om (povraćaj novca za dopunu). */
  checkoutForPaymentIntent(paymentIntentId: string): Promise<string | null>
  /** Naplata za spor: iznos, kupac i payment intent. */
  getCharge(id: string): Promise<ProviderCharge>
}

export interface ProviderCharge {
  id: string
  amount: number
  amountRefunded: number
  customerId: string | null
  paymentIntentId: string | null
}

export class PaymentSignatureError extends Error {
  constructor(message = 'Potpis webhook-a nije ispravan.') {
    super(message)
    this.name = 'PaymentSignatureError'
  }
}
