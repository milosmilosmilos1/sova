import 'server-only'

import { getPaymentProvider } from '@/integrations/payments'
import type { PaymentEvent, ProviderSubscription } from '@/integrations/payments/types'
import { addMonthsUtc, graceUntil, refundTokens, sliceReference, tokenSlice } from '@/lib/billing/rules'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/services/notifications'
import { planByCode, planForPrice, type PlanRow } from '@/services/plans'
import type { Json } from '@/types/database'

/**
 * Obrada Stripe događaja (faza 12, D-090). Webhook samo upisuje događaj (`payment_events`, UNIQUE po
 * ID-ju, T6); obrada ide u pozadini i za stanje pretplate uvek čita Stripe, ne payload (T8). Tokeni:
 * dopuna na plaćen Checkout, pretplata na `invoice.paid`, godišnji plan mesečno kroz dnevni posao.
 */
export type EventOutcome = { status: 'processed' | 'ignored'; detail?: string }

/** Greška koja ne prolazi ponovnim pokušajem (događaj ostaje `failed` za ručnu proveru). */
export class BillingEventError extends Error {
  readonly retryable = false
}

type Obj = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const ref = (v: unknown): string | null => str(v) ?? str(obj(v).id)

const GRANT_REASONS = new Set(['subscription_create', 'subscription_cycle', 'subscription_update'])

export async function recordPaymentEvent(
  event: PaymentEvent,
): Promise<{ id: string; duplicate: boolean; status: string }> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('payment_events')
    .insert({
      provider: 'stripe',
      event_id: event.id,
      event_type: event.type,
      payload: {
        id: event.id,
        type: event.type,
        created: event.created,
        object: event.object,
      } as NonNullable<Json>,
    })
    .select('id')
    .single()
  if (!error) return { id: data.id, duplicate: false, status: 'received' }
  if (error.code !== '23505') throw error
  const { data: existing } = await admin
    .from('payment_events')
    .select('id, status')
    .eq('provider', 'stripe')
    .eq('event_id', event.id)
    .single()
  return { id: existing!.id, duplicate: true, status: existing!.status }
}

/** Idempotentno: obrađen ili preskočen događaj se ne obrađuje ponovo. */
export async function processPaymentEvent(
  paymentEventId: string,
): Promise<EventOutcome | { status: 'skipped' }> {
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin
    .from('payment_events')
    .select('id, event_type, payload, status')
    .eq('id', paymentEventId)
    .maybeSingle()
  if (!row || row.status === 'processed' || row.status === 'ignored') return { status: 'skipped' }
  await admin.from('payment_events').update({ status: 'processing', error: null }).eq('id', row.id)
  try {
    const outcome = await handle(row.event_type, obj(obj(row.payload).object))
    await admin
      .from('payment_events')
      .update({
        status: outcome.status,
        error: outcome.detail ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return outcome
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await admin
      .from('payment_events')
      .update({ status: 'failed', error: message.slice(0, 1000) })
      .eq('id', row.id)
    logger.error('billing_event_failed', { paymentEventId, type: row.event_type, error })
    // ponovljive greške (Stripe ne odgovara, baza) ide na Inngest retry; trajne ostaju `failed`
    if (!(error instanceof BillingEventError)) throw error
    return { status: 'ignored', detail: message }
  }
}

async function handle(type: string, o: Obj): Promise<EventOutcome> {
  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return onCheckoutCompleted(o)
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const id = str(o.id)
      if (!id) return { status: 'ignored', detail: 'pretplata bez ID-ja' }
      await syncSubscription(await getPaymentProvider().getSubscription(id))
      return { status: 'processed' }
    }
    case 'invoice.paid':
      return onInvoicePaid(o)
    case 'invoice.payment_failed':
      return onInvoiceFailed(o)
    case 'charge.refunded':
      return onChargeRefunded(o)
    case 'charge.dispute.created':
      return onDisputeCreated(o)
    case 'charge.dispute.closed':
      return onDisputeClosed(o)
    default:
      return { status: 'ignored', detail: `događaj ${type} se ne obrađuje` }
  }
}

async function workspaceForCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null
  const { data } = await createSupabaseAdminClient()
    .from('billing_customers')
    .select('workspace_id')
    .eq('provider', 'stripe')
    .eq('provider_customer_id', customerId)
    .maybeSingle()
  return data?.workspace_id ?? null
}

async function ownerOf(workspaceId: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .maybeSingle()
  return data?.owner_id ?? null
}

async function notifyOwner(
  workspaceId: string,
  type: 'billing_payment_failed' | 'billing_subscription' | 'billing_tokens',
  title: string,
  body: string,
): Promise<void> {
  const owner = await ownerOf(workspaceId)
  if (!owner) return
  await notifyUsers({
    userIds: [owner],
    workspaceId,
    brandId: null,
    type,
    title,
    body,
    link: '/app/billing',
  })
}

const dateSr = (iso: string) =>
  new Date(iso).toLocaleDateString('sr-Latn-RS', { timeZone: 'Europe/Belgrade' })

/** Pretplata iz Stripe-a → red u `subscriptions` (status, plan, period, rok za plaćanje). */
export async function syncSubscription(
  sub: ProviderSubscription,
): Promise<{ workspaceId: string; plan: PlanRow; previousStatus: string | null }> {
  const admin = createSupabaseAdminClient()
  const workspaceId = sub.metadata.workspace_id ?? (await workspaceForCustomer(sub.customerId))
  if (!workspaceId) throw new BillingEventError(`Pretplata ${sub.id} nema radni prostor.`)
  const plan = await planForPrice(sub.priceId, sub.metadata.plan_code)
  if (!plan) throw new BillingEventError(`Cena ${sub.priceId ?? '?'} ne odgovara nijednom planu.`)
  const { data: existing } = await admin
    .from('subscriptions')
    .select('status, grace_until, dunning_step')
    .eq('provider', 'stripe')
    .eq('provider_subscription_id', sub.id)
    .maybeSingle()
  const pastDue = sub.status === 'past_due'
  const { error } = await admin.from('subscriptions').upsert(
    {
      workspace_id: workspaceId,
      provider: 'stripe',
      provider_customer_id: sub.customerId,
      provider_subscription_id: sub.id,
      plan_id: plan.id,
      status: sub.status,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      canceled_at: sub.canceledAt,
      grace_until: pastDue ? graceUntil(existing?.grace_until ?? null, new Date()) : null,
      dunning_step: pastDue ? (existing?.dunning_step ?? 0) : 0,
      raw: { priceId: sub.priceId, metadata: sub.metadata, syncedAt: new Date().toISOString() } as Json,
    },
    { onConflict: 'provider,provider_subscription_id' },
  )
  if (error?.code === '23505') {
    logger.error('billing_second_active_subscription', { workspaceId, subscriptionId: sub.id })
    throw new BillingEventError(
      `Radni prostor ${workspaceId} već ima aktivnu pretplatu; ${sub.id} treba otkazati ili vratiti novac u Stripe-u.`,
    )
  }
  if (error) throw error
  await admin
    .from('billing_customers')
    .upsert(
      { workspace_id: workspaceId, provider: 'stripe', provider_customer_id: sub.customerId },
      { onConflict: 'workspace_id', ignoreDuplicates: true },
    )
  const previousStatus = existing?.status ?? null
  if (previousStatus !== sub.status) {
    if (sub.status === 'active' && previousStatus !== 'past_due')
      await notifyOwner(workspaceId, 'billing_subscription', 'Pretplata je aktivna', `Plan: ${plan.name}.`)
    if (sub.status === 'active' && previousStatus === 'past_due')
      await notifyOwner(
        workspaceId,
        'billing_subscription',
        'Plaćanje je prošlo',
        'Pretplata je ponovo aktivna.',
      )
    if (sub.status === 'canceled' && previousStatus)
      await notifyOwner(
        workspaceId,
        'billing_subscription',
        'Pretplata je završena',
        'Radni prostor je prešao na besplatan plan. Zakazane objave ostaju; Autopilot i generisanje troše samo preostale tokene.',
      )
  }
  return { workspaceId, plan, previousStatus }
}

/** Dopuna: tokeni tek kad je plaćeno (`payment_status = paid`); pretplata: samo sinhronizacija. */
async function onCheckoutCompleted(session: Obj): Promise<EventOutcome> {
  const meta = obj(session.metadata)
  const workspaceId = str(meta.workspace_id) ?? str(session.client_reference_id)
  if (!workspaceId) return { status: 'ignored', detail: 'sesija bez radnog prostora' }
  if (session.mode === 'subscription') {
    const subId = ref(session.subscription)
    if (!subId) return { status: 'ignored', detail: 'sesija bez pretplate' }
    await syncSubscription(await getPaymentProvider().getSubscription(subId))
    return { status: 'processed', detail: 'tokeni stižu sa plaćenom fakturom' }
  }
  if (session.mode !== 'payment') return { status: 'ignored', detail: `mod ${String(session.mode)}` }
  if (session.payment_status !== 'paid') return { status: 'processed', detail: 'plaćanje još nije potvrđeno' }
  const plan = await planByCode(str(meta.plan_code) ?? '')
  if (!plan || plan.kind !== 'topup') throw new BillingEventError(`Nepoznat paket ${String(meta.plan_code)}.`)
  const sessionId = str(session.id)!
  const customerId = ref(session.customer)
  if (customerId)
    await createSupabaseAdminClient()
      .from('billing_customers')
      .upsert(
        { workspace_id: workspaceId, provider: 'stripe', provider_customer_id: customerId },
        { onConflict: 'workspace_id', ignoreDuplicates: true },
      )
  const created = await grant(
    workspaceId,
    'topup',
    plan.tokens_per_period,
    'checkout',
    sessionId,
    null,
    plan.code,
  )
  if (created)
    await notifyOwner(
      workspaceId,
      'billing_tokens',
      `Stiglo je ${plan.tokens_per_period} tokena`,
      `Paket: ${plan.name}.`,
    )
  return { status: 'processed', detail: created ? `+${plan.tokens_per_period}` : 'već dodeljeno' }
}

/** grant_tokens je idempotentan (UNIQUE source+reference); vraća da li je grant nov. */
async function grant(
  workspaceId: string,
  source: 'topup' | 'subscription' | 'refund',
  amount: number,
  referenceType: string,
  reference: string,
  expiresAt: string | null,
  note: string | null,
): Promise<boolean> {
  const admin = createSupabaseAdminClient()
  const { data: before } = await admin
    .from('token_grants')
    .select('id')
    .eq('source', source)
    .eq('reference', reference)
    .maybeSingle()
  if (before) return false
  const { error } = await admin.rpc('grant_tokens', {
    p_workspace_id: workspaceId,
    p_source: source,
    p_amount: amount,
    p_reference_type: referenceType,
    p_reference: reference,
    p_expires_at: expiresAt ?? undefined,
    p_note: note ?? undefined,
  })
  if (error) throw error
  return true
}

/** Period koji faktura plaća (stavka pretplate); rezerva je tekući period pretplate. */
function invoicePeriod(invoice: Obj): { start: Date; end: Date } | null {
  const lines = (obj(invoice.lines).data as Obj[] | undefined) ?? []
  const line = lines.find((l) => obj(l.parent).type === 'subscription_item_details') ?? lines[0]
  const p = obj(line?.period)
  if (!num(p.start) || !num(p.end)) return null
  return { start: new Date(num(p.start) * 1000), end: new Date(num(p.end) * 1000) }
}

/**
 * Tokeni za plaćen period: mesečni plan ceo period, godišnji tekući mesečni deo (ostale delove daje
 * dnevni posao, T13). Referenca `pretplata:datum početka` štiti od duplikata; `note` čuva ID fakture
 * za povraćaj novca.
 */
export async function grantSubscriptionSlice(input: {
  workspaceId: string
  plan: PlanRow
  subscriptionId: string
  periodStart: Date
  periodEnd: Date
  invoiceId: string | null
  now: Date
}): Promise<boolean> {
  let start = input.periodStart
  let end = input.periodEnd
  if (input.plan.interval === 'year') {
    const slice = tokenSlice(input.periodStart, input.periodEnd, input.now)
    start = slice?.start ?? input.periodStart
    end =
      slice?.end ??
      new Date(Math.min(addMonthsUtc(input.periodStart, 1).getTime(), input.periodEnd.getTime()))
  }
  return grant(
    input.workspaceId,
    'subscription',
    input.plan.tokens_per_period,
    'invoice',
    sliceReference(input.subscriptionId, start),
    end.toISOString(),
    input.invoiceId,
  )
}

async function onInvoicePaid(invoice: Obj): Promise<EventOutcome> {
  const details = obj(obj(invoice.parent).subscription_details)
  const subId = ref(details.subscription)
  if (!subId) return { status: 'ignored', detail: 'faktura bez pretplate' }
  const sub = await getPaymentProvider().getSubscription(subId)
  const { workspaceId, plan } = await syncSubscription(sub)
  const admin = createSupabaseAdminClient()
  const invoiceId = str(invoice.id)
  await admin
    .from('subscriptions')
    .update({ last_invoice_id: invoiceId })
    .eq('provider', 'stripe')
    .eq('provider_subscription_id', sub.id)
  const reason = str(invoice.billing_reason) ?? ''
  if (!GRANT_REASONS.has(reason)) return { status: 'processed', detail: `bez tokena (${reason})` }
  if (sub.status !== 'active' && sub.status !== 'trialing')
    return { status: 'processed', detail: `pretplata je ${sub.status}` }
  if (reason === 'subscription_update') {
    // promena plana usred perioda ne daje dodatne tokene dok traje tekući mesec (T11)
    const { count } = await admin
      .from('token_grants')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('source', 'subscription')
      .like('reference', `${sub.id}:%`)
      .gt('expires_at', new Date().toISOString())
    if ((count ?? 0) > 0) return { status: 'processed', detail: 'tokeni za tekući mesec već postoje' }
  }
  const period =
    invoicePeriod(invoice) ??
    (sub.currentPeriodStart && sub.currentPeriodEnd
      ? { start: new Date(sub.currentPeriodStart), end: new Date(sub.currentPeriodEnd) }
      : null)
  if (!period) throw new BillingEventError(`Faktura ${invoiceId ?? '?'} nema period.`)
  const created = await grantSubscriptionSlice({
    workspaceId,
    plan,
    subscriptionId: sub.id,
    periodStart: period.start,
    periodEnd: period.end,
    invoiceId,
    now: new Date(),
  })
  return { status: 'processed', detail: created ? `+${plan.tokens_per_period}` : 'već dodeljeno' }
}

async function onInvoiceFailed(invoice: Obj): Promise<EventOutcome> {
  const subId = ref(obj(obj(invoice.parent).subscription_details).subscription)
  if (!subId) return { status: 'ignored', detail: 'faktura bez pretplate' }
  const sub = await getPaymentProvider().getSubscription(subId)
  const { workspaceId, previousStatus } = await syncSubscription(sub)
  if (sub.status !== 'past_due' || previousStatus === 'past_due')
    return { status: 'processed', detail: `pretplata je ${sub.status}` }
  const { data: row } = await createSupabaseAdminClient()
    .from('subscriptions')
    .select('grace_until')
    .eq('provider', 'stripe')
    .eq('provider_subscription_id', sub.id)
    .single()
  await notifyOwner(
    workspaceId,
    'billing_payment_failed',
    'Plaćanje pretplate nije uspelo',
    `Ažurirajte karticu do ${dateSr(row!.grace_until!)}. Posle toga generisanje staje, a zakazane objave ostaju.`,
  )
  return { status: 'processed', detail: 'rok za plaćanje počinje' }
}

/** Grantovi plaćeni ovim payment intent-om: dopuna po Checkout sesiji, pretplata po fakturi. */
async function grantsForPayment(
  workspaceId: string,
  paymentIntentId: string | null,
): Promise<Array<{ id: string; amount: number }>> {
  if (!paymentIntentId) return []
  const provider = getPaymentProvider()
  const admin = createSupabaseAdminClient()
  const sessionId = await provider.checkoutForPaymentIntent(paymentIntentId)
  if (sessionId) {
    const { data } = await admin
      .from('token_grants')
      .select('id, amount')
      .eq('workspace_id', workspaceId)
      .eq('source', 'topup')
      .eq('reference', sessionId)
    if (data?.length) return data
  }
  const invoiceId = await provider.invoiceForPaymentIntent(paymentIntentId)
  if (!invoiceId) return []
  const { data } = await admin
    .from('token_grants')
    .select('id, amount')
    .eq('workspace_id', workspaceId)
    .eq('source', 'subscription')
    .eq('note', invoiceId)
    .order('created_at')
  return data ?? []
}

/** Oduzima tokene srazmerno vraćenom novcu (do ukupnog iznosa za referencu, ponovljen događaj ne duplira). */
async function revokeFor(
  workspaceId: string,
  grants: Array<{ id: string; amount: number }>,
  amountBack: number,
  amountCharged: number,
  reference: string,
): Promise<{ target: number; taken: number }> {
  const granted = grants.reduce((a, g) => a + g.amount, 0)
  const target = refundTokens(granted, amountBack, amountCharged)
  if (target === 0) return { target, taken: 0 }
  const { data, error } = await createSupabaseAdminClient().rpc('revoke_tokens_to', {
    p_workspace_id: workspaceId,
    p_target: target,
    p_reference: reference,
    p_grant_id: grants[0]?.id,
    p_note: `vraćeno ${amountBack} od ${amountCharged}`,
  })
  if (error) throw error
  return { target, taken: Number(data ?? 0) }
}

/** T5: povraćaj novca oduzima srazmeran deo tokena tog plaćanja (potrošeni tokeni se ne mogu vratiti). */
async function onChargeRefunded(charge: Obj): Promise<EventOutcome> {
  const workspaceId = await workspaceForCustomer(ref(charge.customer))
  if (!workspaceId) return { status: 'ignored', detail: 'kupac nije poznat' }
  const grants = await grantsForPayment(workspaceId, ref(charge.payment_intent))
  if (!grants.length) return { status: 'processed', detail: 'nema tokena vezanih za ovo plaćanje' }
  const r = await revokeFor(
    workspaceId,
    grants,
    num(charge.amount_refunded),
    num(charge.amount),
    `refund:${str(charge.id)}`,
  )
  return { status: 'processed', detail: `oduzeto ${r.taken} (cilj ${r.target})` }
}

/** T12: spor oduzima tokene kao povraćaj, označava vlasnika i javlja se u log grešaka (alarm). */
async function onDisputeCreated(dispute: Obj): Promise<EventOutcome> {
  const chargeId = ref(dispute.charge)
  if (!chargeId) return { status: 'ignored', detail: 'spor bez naplate' }
  const charge = await getPaymentProvider().getCharge(chargeId)
  const workspaceId = await workspaceForCustomer(charge.customerId)
  if (!workspaceId) return { status: 'ignored', detail: 'kupac nije poznat' }
  const grants = await grantsForPayment(workspaceId, charge.paymentIntentId)
  const r = await revokeFor(
    workspaceId,
    grants,
    num(dispute.amount),
    charge.amount,
    `dispute:${str(dispute.id)}`,
  )
  const owner = await ownerOf(workspaceId)
  if (owner) {
    const admin = createSupabaseAdminClient()
    const { data: flag } = await admin
      .from('user_flags')
      .select('id, count')
      .eq('user_id', owner)
      .eq('kind', 'chargeback')
      .maybeSingle()
    if (flag)
      await admin
        .from('user_flags')
        .update({ count: flag.count + 1, last_at: new Date().toISOString() })
        .eq('id', flag.id)
    else
      await admin
        .from('user_flags')
        .insert({ user_id: owner, kind: 'chargeback', note: `spor ${str(dispute.id)}` })
  }
  logger.error('billing_dispute_created', {
    workspaceId,
    disputeId: str(dispute.id),
    amount: num(dispute.amount),
  })
  return { status: 'processed', detail: `oduzeto ${r.taken} (cilj ${r.target})` }
}

/** Dobijen spor vraća oduzete tokene. */
async function onDisputeClosed(dispute: Obj): Promise<EventOutcome> {
  if (dispute.status !== 'won') return { status: 'processed', detail: `spor ${String(dispute.status)}` }
  const reference = `dispute:${str(dispute.id)}`
  const admin = createSupabaseAdminClient()
  const { data: rows } = await admin
    .from('token_ledger')
    .select('workspace_id, delta')
    .eq('reason', 'refund')
    .eq('reference', reference)
  const revoked = -(rows ?? []).reduce((a, r) => a + r.delta, 0)
  const workspaceId = rows?.[0]?.workspace_id
  if (!workspaceId || revoked <= 0) return { status: 'processed', detail: 'nema oduzetih tokena' }
  await grant(workspaceId, 'refund', revoked, 'dispute', reference, null, 'dobijen spor')
  return { status: 'processed', detail: `vraćeno ${revoked}` }
}
