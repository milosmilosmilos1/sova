import 'server-only'

import Stripe from 'stripe'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

import {
  PaymentSignatureError,
  type PaymentEvent,
  type PaymentProvider,
  type ProviderCharge,
  type ProviderSubscription,
  type ProviderSubscriptionStatus,
  type SubscriptionCheckoutInput,
  type TopupCheckoutInput,
} from './types'

/**
 * Stripe (D-090): hosted Checkout za pretplatu i dopunu, Customer Portal za karticu, otkaz i promenu
 * plana, webhook sa proverom potpisa. API verzija je zakucana (`2026-09-30.endive`, stripe-node 23):
 * period pretplate je na stavci (`items.data[].current_period_*`), a `payment_method_types` se ne
 * šalje (endive ga odbija). HTTP ide kroz fetch, pa ga testovi presreću MSW-om.
 */
export const STRIPE_API_VERSION = '2026-09-30.endive'
const WEBHOOK_TOLERANCE_SEC = 300

export interface StripeProviderOptions {
  secretKey?: string
  webhookSecret?: string
  /** Stripe Tax: tek kad vlasnik izabere poreski model (D-090) */
  automaticTax?: boolean
}

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null)

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const
  private client: Stripe | null = null

  constructor(private readonly options: StripeProviderOptions = {}) {}

  private get secretKey() {
    return this.options.secretKey ?? env.STRIPE_SECRET_KEY
  }

  private get webhookSecret() {
    return this.options.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET
  }

  private get automaticTax() {
    return this.options.automaticTax ?? env.STRIPE_AUTOMATIC_TAX
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey && this.webhookSecret)
  }

  private stripe(): Stripe {
    if (!this.secretKey) throw new ApiError('BILLING_UNAVAILABLE', 'Naplata još nije podešena.')
    this.client ??= new Stripe(this.secretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: 'Sova', url: 'https://sovaai.rs' },
    })
    return this.client
  }

  /** Stripe greška → PROVIDER_ERROR (ponovljiva za webhook posao), uz zapis u log bez tajni. */
  private async call<T>(label: string, fn: (s: Stripe) => Promise<T>): Promise<T> {
    try {
      return await fn(this.stripe())
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        logger.warn('stripe_error', {
          label,
          type: error.type,
          code: error.code,
          status: error.statusCode,
          requestId: error.requestId,
          message: error.message,
        })
        throw new ApiError('PROVIDER_ERROR', 'Stripe trenutno ne odgovara. Pokušajte ponovo.', {
          cause: error,
          details: { provider: 'stripe', code: error.code ?? null },
        })
      }
      throw error
    }
  }

  private taxParams() {
    return this.automaticTax
      ? {
          automatic_tax: { enabled: true },
          customer_update: { address: 'auto' as const, name: 'auto' as const },
          tax_id_collection: { enabled: true },
        }
      : {}
  }

  async createCustomer(input: { workspaceId: string; email: string | null; name: string }): Promise<string> {
    const customer = await this.call('customers.create', (s) =>
      s.customers.create(
        {
          name: input.name,
          ...(input.email ? { email: input.email } : {}),
          metadata: { workspace_id: input.workspaceId },
        },
        // dvostruki klik ne pravi dva kupca
        { idempotencyKey: `customer:${input.workspaceId}` },
      ),
    )
    return customer.id
  }

  async createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<{ id: string; url: string }> {
    const metadata = { workspace_id: input.workspaceId, plan_code: input.planCode }
    const session = await this.call('checkout.subscription', (s) =>
      s.checkout.sessions.create({
        mode: 'subscription',
        customer: input.customerId,
        client_reference_id: input.workspaceId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        locale: 'auto',
        ...this.taxParams(),
      }),
    )
    if (!session.url) throw new ApiError('PROVIDER_ERROR', 'Stripe nije vratio adresu za plaćanje.')
    return { id: session.id, url: session.url }
  }

  async createTopupCheckout(input: TopupCheckoutInput): Promise<{ id: string; url: string }> {
    const metadata = { workspace_id: input.workspaceId, plan_code: input.planCode }
    const session = await this.call('checkout.topup', (s) =>
      s.checkout.sessions.create({
        mode: 'payment',
        customer: input.customerId,
        client_reference_id: input.workspaceId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: { name: input.name, metadata: { plan_code: input.planCode } },
            },
          },
        ],
        metadata,
        payment_intent_data: { metadata },
        invoice_creation: { enabled: true, invoice_data: { metadata } },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        billing_address_collection: 'auto',
        locale: 'auto',
        ...this.taxParams(),
      }),
    )
    if (!session.url) throw new ApiError('PROVIDER_ERROR', 'Stripe nije vratio adresu za plaćanje.')
    return { id: session.id, url: session.url }
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.call('billing_portal', (s) =>
      s.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl }),
    )
    return { url: session.url }
  }

  parseWebhook(rawBody: string, signature: string | null): PaymentEvent {
    if (!this.webhookSecret) throw new ApiError('BILLING_UNAVAILABLE', 'Naplata još nije podešena.')
    if (!signature) throw new PaymentSignatureError('Nedostaje Stripe-Signature zaglavlje.')
    let event: Stripe.Event
    try {
      event = this.stripe().webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
        WEBHOOK_TOLERANCE_SEC,
      )
    } catch (error) {
      throw new PaymentSignatureError(error instanceof Error ? error.message : undefined)
    }
    return {
      id: event.id,
      type: event.type,
      created: event.created,
      object: event.data.object as unknown as Record<string, unknown>,
    }
  }

  async getSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.call('subscriptions.retrieve', (s) => s.subscriptions.retrieve(id))
    const item = sub.items.data[0]
    const status: ProviderSubscriptionStatus =
      sub.status === 'incomplete_expired' ? 'canceled' : (sub.status as ProviderSubscriptionStatus)
    return {
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status,
      priceId: item?.price?.id ?? null,
      currentPeriodStart: iso(item?.current_period_start),
      currentPeriodEnd: iso(item?.current_period_end),
      // zakazan otkaz: klasično cancel_at_period_end, a u fleksibilnom režimu cancel_at
      cancelAtPeriodEnd: sub.cancel_at_period_end || Boolean(sub.cancel_at),
      canceledAt: iso(sub.canceled_at),
      metadata: sub.metadata ?? {},
    }
  }

  async invoiceForPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const list = await this.call('invoice_payments.list', (s) =>
      s.invoicePayments.list({
        payment: { type: 'payment_intent', payment_intent: paymentIntentId },
        limit: 1,
      }),
    )
    const invoice = list.data[0]?.invoice
    if (!invoice) return null
    return typeof invoice === 'string' ? invoice : (invoice.id ?? null)
  }

  async checkoutForPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const list = await this.call('checkout.list', (s) =>
      s.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 }),
    )
    return list.data[0]?.id ?? null
  }

  async getCharge(id: string): Promise<ProviderCharge> {
    const charge = await this.call('charges.retrieve', (s) => s.charges.retrieve(id))
    const ref = (v: string | { id: string } | null) => (v === null ? null : typeof v === 'string' ? v : v.id)
    return {
      id: charge.id,
      amount: charge.amount,
      amountRefunded: charge.amount_refunded,
      customerId: ref(charge.customer),
      paymentIntentId: ref(charge.payment_intent),
    }
  }
}
