import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return { ...mod, enqueueBillingEvent: vi.fn(async () => {}) }
})

import Stripe from 'stripe'

import { POST as checkoutPost } from '@/app/api/billing/checkout/route'
import { GET as ledgerGet } from '@/app/api/billing/ledger/route'
import { POST as portalPost } from '@/app/api/billing/portal/route'
import { GET as billingGet } from '@/app/api/billing/route'
import { POST as topupPost } from '@/app/api/billing/topup/route'
import { POST as webhookPost } from '@/app/api/webhooks/payments/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueBillingEvent } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { addMonthsUtc } from '@/lib/billing/rules'
import { getTokenBalance } from '@/lib/tokens/reservation'
import { startGeneration } from '@/services/ai/generations'
import { runBillingDaily } from '@/services/billing/daily'
import { processPaymentEvent } from '@/services/billing/events'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { resetStripeState, stripeHandlers, stripeState } from './stripe-mock'

/** Faza 12 (D-090): Stripe kroz MSW, webhook sa pravim potpisom, obrada događaja bez Inngest-a. */
let owner: TestUser
let editor: TestUser
let wsId = ''
let customerId = ''

// samo za potpis test webhook-a (generateTestHeaderString ne ide na mrežu)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const DAY = 86_400
const nowSec = () => Math.floor(Date.now() / 1000)

let seq = 0
async function deliver(
  type: string,
  object: Record<string, unknown>,
  eventId = `evt_test_${Date.now()}_${++seq}`,
) {
  const event = {
    id: eventId,
    object: 'event',
    api_version: '2026-09-30.endive',
    created: nowSec(),
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  }
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: JSON.stringify(event),
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  })
  const r = await call<{ received: boolean; duplicate: boolean }>(webhookPost, '/api/webhooks/payments', {
    body: event,
    headers: { 'stripe-signature': signature },
  })
  expect(r.status).toBe(200)
  const { data } = await admin.from('payment_events').select('id').eq('event_id', eventId).single()
  return { response: r.json.data!, outcome: await processPaymentEvent(data!.id) }
}

async function available(): Promise<number> {
  return (await getTokenBalance(wsId)).available
}

async function subscriptionRow(id: string) {
  const { data } = await admin
    .from('subscriptions')
    .select('status, grace_until, dunning_step, cancel_at_period_end, current_period_end, plans!inner(code)')
    .eq('provider_subscription_id', id)
    .single()
  return data!
}

function invoice(id: string, sub: string, reason: string, start: number, end: number) {
  return {
    id,
    object: 'invoice',
    billing_reason: reason,
    customer: customerId,
    parent: { type: 'subscription_details', subscription_details: { subscription: sub, metadata: {} } },
    lines: {
      object: 'list',
      data: [{ id: `il_${id}`, period: { start, end }, parent: { type: 'subscription_item_details' } }],
    },
  }
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...stripeHandlers)
  owner = await createTestUser('billing-owner')
  editor = await createTestUser('billing-editor')
  const ws = await call<{ workspaceId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Naplata test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: editor.id, role: 'editor', all_brands: true })
})

afterEach(() => {
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(editor)
  await deleteTestUser(owner)
})

describe('Naplata: pregled i kupovina', () => {
  it('pregled bez pretplate: besplatan plan, cenovnik, naplata podešena; editor ne kupuje i ne vidi istoriju', async () => {
    resetStripeState()
    const r = await call<{
      configured: boolean
      canManage: boolean
      plan: { code: string }
      subscription: unknown
      balance: { available: number }
      plans: Array<{ code: string; kind: string; priceCents: number }>
    }>(billingGet, '/api/billing', { token: owner.token, query: { workspaceId: wsId } })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      configured: true,
      canManage: true,
      plan: { code: 'free' },
      subscription: null,
    })
    expect(r.json.data!.balance.available).toBe(50)
    expect(r.json.data!.plans.map((p) => p.code)).toEqual([
      'monthly',
      'yearly',
      'topup_100',
      'topup_300',
      'topup_1000',
    ])

    const asEditor = await call(checkoutPost, '/api/billing/checkout', {
      token: editor.token,
      body: { workspaceId: wsId, planCode: 'monthly' },
    })
    expect(asEditor.status).toBe(403)
    const editorLedger = await call(ledgerGet, '/api/billing/ledger', {
      token: editor.token,
      query: { workspaceId: wsId },
    })
    expect(editorLedger.status).toBe(403)
    expect(stripeState.customers).toHaveLength(0)
  })

  it('checkout pretplate: jedan Stripe kupac po radnom prostoru, cena, metadata, povratne adrese, zakucana API verzija', async () => {
    resetStripeState()
    const r = await call<{ url: string }>(checkoutPost, '/api/billing/checkout', {
      token: owner.token,
      body: { workspaceId: wsId, planCode: 'monthly' },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
    expect(stripeState.customers).toHaveLength(1)
    expect(stripeState.customers[0]).toMatchObject({
      idempotencyKey: `customer:${wsId}`,
      body: { name: 'Naplata test', email: owner.email, 'metadata[workspace_id]': wsId },
    })
    const s = stripeState.sessions[0]!
    expect(s).toMatchObject({
      mode: 'subscription',
      customer: 'cus_test_1',
      client_reference_id: wsId,
      'line_items[0][price]': 'price_test_monthly',
      'metadata[plan_code]': 'monthly',
      'subscription_data[metadata][workspace_id]': wsId,
      locale: 'auto',
      allow_promotion_codes: 'true',
    })
    expect(s.success_url).toContain('/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}')
    expect(Object.keys(s).some((k) => k.startsWith('payment_method_types'))).toBe(false)
    expect(stripeState.versions.every((v) => v === '2026-09-30.endive')).toBe(true)
    expect(stripeState.auth[0]).toBe(`Bearer ${process.env.STRIPE_SECRET_KEY}`)

    const again = await call(checkoutPost, '/api/billing/checkout', {
      token: owner.token,
      body: { workspaceId: wsId, planCode: 'yearly' },
    })
    expect(again.status).toBe(200)
    expect(stripeState.customers).toHaveLength(1)
    expect(stripeState.sessions[1]!['line_items[0][price]']).toBe('price_test_yearly')
    const { data: c } = await admin
      .from('billing_customers')
      .select('provider_customer_id')
      .eq('workspace_id', wsId)
      .single()
    customerId = c!.provider_customer_id
  })

  it('webhook: neispravan potpis 400; isti događaj dvaput se upisuje jednom (T6)', async () => {
    const bad = await call(webhookPost, '/api/webhooks/payments', {
      body: { id: 'evt_bad', type: 'invoice.paid', data: { object: {} } },
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
    })
    expect(bad.status).toBe(400)
    const missing = await call(webhookPost, '/api/webhooks/payments', { body: { id: 'evt_x' } })
    expect(missing.status).toBe(400)

    const id = `evt_dup_${Date.now()}`
    const first = await deliver('invoice.created', { id: 'in_ignored', object: 'invoice' }, id)
    expect(first.response.duplicate).toBe(false)
    expect(first.outcome.status).toBe('ignored')
    const second = await deliver('invoice.created', { id: 'in_ignored', object: 'invoice' }, id)
    expect(second.response.duplicate).toBe(true)
    expect(second.outcome.status).toBe('skipped')
    const { count } = await admin
      .from('payment_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
    expect(count).toBe(1)
    expect(vi.mocked(enqueueBillingEvent)).toHaveBeenCalledTimes(1)
  })
})

describe('Naplata: pretplata', () => {
  const sub = 'sub_test_monthly'
  let start = 0
  let end = 0

  it('checkout.session.completed sinhronizuje pretplatu; tokeni tek uz invoice.paid (500 do kraja perioda), bez duplikata', async () => {
    start = nowSec() - 60
    end = start + 30 * DAY
    stripeState.subscriptions[sub] = {
      customer: customerId,
      status: 'active',
      price: 'price_test_monthly',
      start,
      end,
      metadata: { workspace_id: wsId, plan_code: 'monthly' },
    }
    const done = await deliver('checkout.session.completed', {
      id: 'cs_test_sub',
      object: 'checkout.session',
      mode: 'subscription',
      payment_status: 'paid',
      customer: customerId,
      subscription: sub,
      client_reference_id: wsId,
      metadata: { workspace_id: wsId, plan_code: 'monthly' },
    })
    expect(done.outcome.status).toBe('processed')
    expect(await subscriptionRow(sub)).toMatchObject({ status: 'active', plans: { code: 'monthly' } })
    expect(await available()).toBe(50)
    const view = await call<{ plan: { code: string } }>(billingGet, '/api/billing', {
      token: owner.token,
      query: { workspaceId: wsId },
    })
    expect(view.json.data!.plan.code).toBe('monthly')

    await deliver('invoice.paid', invoice('in_test_1', sub, 'subscription_create', start, end))
    expect(await available()).toBe(550)
    const { data: grant } = await admin
      .from('token_grants')
      .select('amount, expires_at, reference, note')
      .eq('workspace_id', wsId)
      .eq('source', 'subscription')
      .single()
    expect(grant).toMatchObject({ amount: 500, note: 'in_test_1' })
    expect(new Date(grant!.expires_at!).getTime()).toBe(end * 1000)

    // isti račun u drugom događaju (Stripe ponavlja) ne daje tokene dvaput
    await deliver('invoice.paid', invoice('in_test_1', sub, 'subscription_create', start, end))
    expect(await available()).toBe(550)

    const checkoutAgain = await call(checkoutPost, '/api/billing/checkout', {
      token: owner.token,
      body: { workspaceId: wsId, planCode: 'yearly' },
    })
    expect(checkoutAgain.status).toBe(409)
  })

  it('neuspelo plaćanje: past_due sa rokom 7 dana, obaveštenje, podsetnici dan 1 i 3; posle roka generisanje staje (T9)', async () => {
    stripeState.subscriptions[sub]!.status = 'past_due'
    const failed = await deliver(
      'invoice.payment_failed',
      invoice('in_test_2', sub, 'subscription_cycle', end, end + 30 * DAY),
    )
    expect(failed.outcome).toMatchObject({ status: 'processed', detail: 'rok za plaćanje počinje' })
    const row = await subscriptionRow(sub)
    expect(row.status).toBe('past_due')
    const graceMs = new Date(row.grace_until!).getTime() - Date.now()
    expect(graceMs).toBeGreaterThan(6.9 * DAY * 1000)
    expect(graceMs).toBeLessThan(7.1 * DAY * 1000)
    const { data: notes } = await admin
      .from('notifications')
      .select('title')
      .eq('user_id', owner.id)
      .eq('type', 'billing_payment_failed')
    expect(notes!.map((n) => n.title)).toContain('Plaćanje pretplate nije uspelo')

    const t0 = Date.now()
    await runBillingDaily(new Date(t0 + 1.05 * DAY * 1000))
    await runBillingDaily(new Date(t0 + 1.1 * DAY * 1000))
    expect((await subscriptionRow(sub)).dunning_step).toBe(1)
    await runBillingDaily(new Date(t0 + 3.05 * DAY * 1000))
    expect((await subscriptionRow(sub)).dunning_step).toBe(2)
    const { count: reminders } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', owner.id)
      .eq('type', 'billing_payment_failed')
    expect(reminders).toBe(3)

    // u roku generisanje radi; posle roka staje sa PAYMENT_REQUIRED
    const ok = await startGeneration({
      workspaceId: wsId,
      brandId: null,
      userId: owner.id,
      type: 'text',
      tokens: 2,
      input: {},
    })
    await admin.from('token_reservations').update({ status: 'released' }).eq('id', ok.reservationId!)
    await admin
      .from('subscriptions')
      .update({ grace_until: new Date(Date.now() - 60_000).toISOString() })
      .eq('provider_subscription_id', sub)
    await expect(
      startGeneration({
        workspaceId: wsId,
        brandId: null,
        userId: owner.id,
        type: 'text',
        tokens: 2,
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' })
    const view = await call<{ subscription: { blocked: boolean } }>(billingGet, '/api/billing', {
      token: owner.token,
      query: { workspaceId: wsId },
    })
    expect(view.json.data!.subscription.blocked).toBe(true)
  })

  it('plaćanje posle opomene: aktivna pretplata, rok obrisan, tokeni za novi period', async () => {
    stripeState.subscriptions[sub] = {
      ...stripeState.subscriptions[sub]!,
      status: 'active',
      start: end,
      end: end + 30 * DAY,
    }
    const before = await available()
    await deliver('invoice.paid', invoice('in_test_2', sub, 'subscription_cycle', end, end + 30 * DAY))
    const row = await subscriptionRow(sub)
    expect(row).toMatchObject({ status: 'active', grace_until: null, dunning_step: 0 })
    expect(await available()).toBe(before + 500)
    const g = await startGeneration({
      workspaceId: wsId,
      brandId: null,
      userId: owner.id,
      type: 'text',
      tokens: 2,
      input: {},
    })
    expect(g.reservationId).toBeTruthy()
    await admin.from('token_reservations').update({ status: 'released' }).eq('id', g.reservationId!)
  })
})

describe('Naplata: kraj pretplate i godišnji plan', () => {
  it('otkaz: customer.subscription.deleted → završena, besplatan plan, obaveštenje (K6)', async () => {
    stripeState.subscriptions.sub_test_monthly!.status = 'canceled'
    stripeState.subscriptions.sub_test_monthly!.canceledAt = nowSec()
    await deliver('customer.subscription.deleted', { id: 'sub_test_monthly', object: 'subscription' })
    expect((await subscriptionRow('sub_test_monthly')).status).toBe('canceled')
    const view = await call<{ plan: { code: string }; subscription: { status: string } }>(
      billingGet,
      '/api/billing',
      {
        token: owner.token,
        query: { workspaceId: wsId },
      },
    )
    expect(view.json.data!.plan.code).toBe('free')
    const { data: notes } = await admin
      .from('notifications')
      .select('title')
      .eq('user_id', owner.id)
      .eq('type', 'billing_subscription')
    expect(notes!.map((n) => n.title)).toEqual(
      expect.arrayContaining(['Pretplata je aktivna', 'Pretplata je završena']),
    )
  })

  it('godišnji plan: tokeni za tekući mesec odmah, sledeći mesec kroz dnevni posao, bez duplikata (T13)', async () => {
    const sub = 'sub_test_yearly'
    const start = nowSec() - 40 * DAY
    const end = start + 365 * DAY
    stripeState.subscriptions[sub] = {
      customer: customerId,
      status: 'active',
      price: 'price_test_yearly',
      start,
      end,
      metadata: { workspace_id: wsId, plan_code: 'yearly' },
    }
    const before = await available()
    await deliver('invoice.paid', invoice('in_test_year', sub, 'subscription_create', start, end))
    expect(await subscriptionRow(sub)).toMatchObject({ plans: { code: 'yearly' } })
    expect(await available()).toBe(before + 500)
    const { data: first } = await admin
      .from('token_grants')
      .select('reference, expires_at')
      .eq('workspace_id', wsId)
      .like('reference', `${sub}:%`)
      .single()
    // 40 dana posle početka je drugi mesečni deo
    expect(first!.reference).toBe(
      `${sub}:${addMonthsUtc(new Date(start * 1000), 1)
        .toISOString()
        .slice(0, 10)}`,
    )
    expect(new Date(first!.expires_at!).getTime()).toBeGreaterThan(Date.now())

    const r1 = await runBillingDaily(new Date())
    expect(r1.yearlyGrants).toBe(0)
    const nextMonth = new Date(new Date(first!.expires_at!).getTime() + 3_600_000)
    const r2 = await runBillingDaily(nextMonth)
    expect(r2.yearlyGrants).toBe(1)
    expect((await runBillingDaily(nextMonth)).yearlyGrants).toBe(0)
    const { count } = await admin
      .from('token_grants')
      .select('id', { count: 'exact', head: true })
      .like('reference', `${sub}:%`)
    expect(count).toBe(2)
  })
})

describe('Naplata: dopuna, povraćaj, spor', () => {
  function topupSession(id: string, plan: string, paymentStatus: string) {
    return {
      id,
      object: 'checkout.session',
      mode: 'payment',
      payment_status: paymentStatus,
      customer: customerId,
      client_reference_id: wsId,
      metadata: { workspace_id: wsId, plan_code: plan },
    }
  }

  it('dopuna: Checkout sa cenom paketa i fakturom; tokeni tek kad je plaćeno, bez isteka', async () => {
    resetStripeState()
    const r = await call<{ url: string }>(topupPost, '/api/billing/topup', {
      token: owner.token,
      body: { workspaceId: wsId, planCode: 'topup_300' },
    })
    expect(r.status).toBe(200)
    expect(stripeState.customers).toHaveLength(0)
    expect(stripeState.sessions[0]).toMatchObject({
      mode: 'payment',
      customer: customerId,
      'line_items[0][price_data][unit_amount]': '3000',
      'line_items[0][price_data][currency]': 'eur',
      'invoice_creation[enabled]': 'true',
      'metadata[plan_code]': 'topup_300',
    })
    const bad = await call(topupPost, '/api/billing/topup', {
      token: owner.token,
      body: { workspaceId: wsId, planCode: 'monthly' },
    })
    expect(bad.status).toBe(400)

    const before = await available()
    const pending = await deliver(
      'checkout.session.completed',
      topupSession('cs_topup_1', 'topup_300', 'unpaid'),
    )
    expect(pending.outcome).toMatchObject({ status: 'processed', detail: 'plaćanje još nije potvrđeno' })
    expect(await available()).toBe(before)
    await deliver('checkout.session.async_payment_succeeded', topupSession('cs_topup_1', 'topup_300', 'paid'))
    expect(await available()).toBe(before + 300)
    const { data: grant } = await admin
      .from('token_grants')
      .select('expires_at')
      .eq('reference', 'cs_topup_1')
      .single()
    expect(grant!.expires_at).toBeNull()
    const { data: notes } = await admin
      .from('notifications')
      .select('title')
      .eq('user_id', owner.id)
      .eq('type', 'billing_tokens')
    expect(notes!.map((n) => n.title)).toContain('Stiglo je 300 tokena')
  })

  it('povraćaj oduzima tokene srazmerno; delimičan pa pun povraćaj, ponovljen događaj ne duplira (T5)', async () => {
    stripeState.sessionsByPaymentIntent.pi_topup_1 = 'cs_topup_1'
    const charge = {
      id: 'ch_topup_1',
      object: 'charge',
      amount: 3000,
      customer: customerId,
      payment_intent: 'pi_topup_1',
    }
    const before = await available()
    await deliver('charge.refunded', { ...charge, amount_refunded: 1000 })
    expect(await available()).toBe(before - 100)
    await deliver('charge.refunded', { ...charge, amount_refunded: 3000 })
    expect(await available()).toBe(before - 300)
    await deliver('charge.refunded', { ...charge, amount_refunded: 3000 })
    expect(await available()).toBe(before - 300)
    const { data: rows } = await admin
      .from('token_ledger')
      .select('delta, reason')
      .eq('workspace_id', wsId)
      .eq('reference', 'refund:ch_topup_1')
      .order('id')
    expect(rows!.map((r) => r.delta)).toEqual([-100, -200])
  })

  it('spor oduzima tokene i označava vlasnika; dobijen spor vraća tokene (T12)', async () => {
    await deliver('checkout.session.completed', topupSession('cs_topup_2', 'topup_100', 'paid'))
    stripeState.sessionsByPaymentIntent.pi_topup_2 = 'cs_topup_2'
    stripeState.charges.ch_topup_2 = {
      amount: 1200,
      amount_refunded: 0,
      customer: customerId,
      payment_intent: 'pi_topup_2',
    }
    const before = await available()
    await deliver('charge.dispute.created', {
      id: 'dp_test_1',
      object: 'dispute',
      charge: 'ch_topup_2',
      amount: 1200,
      status: 'needs_response',
    })
    expect(await available()).toBe(before - 100)
    const { data: flag } = await admin
      .from('user_flags')
      .select('kind, count')
      .eq('user_id', owner.id)
      .single()
    expect(flag).toMatchObject({ kind: 'chargeback', count: 1 })
    await deliver('charge.dispute.closed', {
      id: 'dp_test_1',
      object: 'dispute',
      charge: 'ch_topup_2',
      amount: 1200,
      status: 'won',
    })
    expect(await available()).toBe(before)
  })
})

describe('Naplata: Portal i istorija tokena', () => {
  it('Portal za vlasnika sa kupcem; radni prostor bez plaćanja dobija 404', async () => {
    resetStripeState()
    const r = await call<{ url: string }>(portalPost, '/api/billing/portal', {
      token: owner.token,
      body: { workspaceId: wsId },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.url).toMatch(/^https:\/\/billing\.stripe\.com\//)
    expect(stripeState.portals[0]).toMatchObject({ customer: customerId })
    expect(stripeState.portals[0]!.return_url).toContain('/app/billing')

    const other = await call<{ workspaceId: string }>(workspacesPost, '/api/workspaces', {
      token: editor.token,
      body: { name: 'Bez plaćanja', type: 'business' },
    })
    const none = await call(portalPost, '/api/billing/portal', {
      token: editor.token,
      body: { workspaceId: other.json.data!.workspaceId },
    })
    expect(none.status).toBe(404)
  })

  it('istorija tokena: stavke sa izvorom i stanjem, najnovije prvo, stranice', async () => {
    const page = await call<{
      entries: Array<{ delta: number; reason: string; source: string | null }>
      nextBefore: number | null
    }>(ledgerGet, '/api/billing/ledger', { token: owner.token, query: { workspaceId: wsId, limit: '3' } })
    expect(page.status).toBe(200)
    expect(page.json.data!.entries).toHaveLength(3)
    expect(page.json.data!.nextBefore).not.toBeNull()
    const all = await call<{ entries: Array<{ delta: number; reason: string; source: string | null }> }>(
      ledgerGet,
      '/api/billing/ledger',
      {
        token: owner.token,
        query: { workspaceId: wsId, limit: '200' },
      },
    )
    const sources = all.json.data!.entries.map((e) => `${e.reason}:${e.source ?? ''}`)
    expect(sources).toEqual(
      expect.arrayContaining([
        'grant:signup',
        'grant:subscription',
        'grant:topup',
        'refund:topup',
        'grant:refund',
      ]),
    )
  })
})
