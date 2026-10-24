import { http, HttpResponse } from 'msw'

/**
 * MSW mock Stripe API-ja (2026-09-30.endive) za fazu 12: kupci, Checkout sesije (pravljenje i lista po
 * payment intent-u), Customer Portal, pretplate (period na stavci), invoice_payments i naplate.
 * Telo zahteva je form-urlencoded sa ugnježdenim ključevima (`metadata[workspace_id]`).
 */
export interface SubscriptionFixture {
  customer: string
  status: string
  price: string
  start: number
  end: number
  metadata: Record<string, string>
  cancelAtPeriodEnd?: boolean
  canceledAt?: number | null
}

export const stripeState = {
  customers: [] as Array<{ body: Record<string, string>; idempotencyKey: string | null }>,
  sessions: [] as Array<Record<string, string>>,
  portals: [] as Array<Record<string, string>>,
  subscriptions: {} as Record<string, SubscriptionFixture>,
  sessionsByPaymentIntent: {} as Record<string, string>,
  invoicesByPaymentIntent: {} as Record<string, string>,
  charges: {} as Record<
    string,
    { amount: number; amount_refunded: number; customer: string; payment_intent: string }
  >,
  versions: [] as string[],
  auth: [] as string[],
}

export function resetStripeState(): void {
  stripeState.customers = []
  stripeState.sessions = []
  stripeState.portals = []
  stripeState.subscriptions = {}
  stripeState.sessionsByPaymentIntent = {}
  stripeState.invoicesByPaymentIntent = {}
  stripeState.charges = {}
  stripeState.versions = []
  stripeState.auth = []
}

const S = 'https://api.stripe.com/v1'

function track(request: Request) {
  stripeState.versions.push(request.headers.get('stripe-version') ?? '')
  stripeState.auth.push(request.headers.get('authorization') ?? '')
}

const form = async (request: Request) => Object.fromEntries(new URLSearchParams(await request.text()))

export function subscriptionObject(id: string, s: SubscriptionFixture) {
  return {
    id,
    object: 'subscription',
    customer: s.customer,
    status: s.status,
    cancel_at_period_end: s.cancelAtPeriodEnd ?? false,
    cancel_at: null,
    canceled_at: s.canceledAt ?? null,
    metadata: s.metadata,
    items: {
      object: 'list',
      data: [
        {
          id: `si_${id}`,
          object: 'subscription_item',
          price: { id: s.price, object: 'price' },
          current_period_start: s.start,
          current_period_end: s.end,
        },
      ],
    },
  }
}

export const stripeHandlers = [
  http.post(`${S}/customers`, async ({ request }) => {
    track(request)
    const body = await form(request)
    stripeState.customers.push({ body, idempotencyKey: request.headers.get('idempotency-key') })
    return HttpResponse.json({
      id: `cus_test_${stripeState.customers.length}`,
      object: 'customer',
      metadata: {},
    })
  }),
  http.post(`${S}/checkout/sessions`, async ({ request }) => {
    track(request)
    const body = await form(request)
    stripeState.sessions.push(body)
    const id = `cs_test_${stripeState.sessions.length}`
    return HttpResponse.json({
      id,
      object: 'checkout.session',
      mode: body.mode,
      url: `https://checkout.stripe.com/c/pay/${id}`,
    })
  }),
  http.get(`${S}/checkout/sessions`, ({ request }) => {
    track(request)
    const pi = new URL(request.url).searchParams.get('payment_intent') ?? ''
    const id = stripeState.sessionsByPaymentIntent[pi]
    return HttpResponse.json({
      object: 'list',
      data: id ? [{ id, object: 'checkout.session' }] : [],
      has_more: false,
      url: '/v1/checkout/sessions',
    })
  }),
  http.post(`${S}/billing_portal/sessions`, async ({ request }) => {
    track(request)
    stripeState.portals.push(await form(request))
    return HttpResponse.json({
      id: `bps_test_${stripeState.portals.length}`,
      object: 'billing_portal.session',
      url: `https://billing.stripe.com/p/session/test_${stripeState.portals.length}`,
    })
  }),
  http.get(`${S}/subscriptions/:id`, ({ request, params }) => {
    track(request)
    const id = String(params.id)
    const s = stripeState.subscriptions[id]
    if (!s)
      return HttpResponse.json(
        {
          error: {
            type: 'invalid_request_error',
            code: 'resource_missing',
            message: `No such subscription: '${id}'`,
          },
        },
        { status: 404 },
      )
    return HttpResponse.json(subscriptionObject(id, s))
  }),
  http.get(`${S}/invoice_payments`, ({ request }) => {
    track(request)
    const url = new URL(request.url)
    const pi = url.searchParams.get('payment[payment_intent]') ?? ''
    const invoice = stripeState.invoicesByPaymentIntent[pi]
    return HttpResponse.json({
      object: 'list',
      data: invoice ? [{ id: `inpay_${pi}`, object: 'invoice_payment', invoice }] : [],
      has_more: false,
      url: '/v1/invoice_payments',
    })
  }),
  http.get(`${S}/charges/:id`, ({ request, params }) => {
    track(request)
    const c = stripeState.charges[String(params.id)]
    if (!c)
      return HttpResponse.json(
        { error: { type: 'invalid_request_error', message: 'No such charge' } },
        { status: 404 },
      )
    return HttpResponse.json({ id: String(params.id), object: 'charge', ...c })
  }),
]
