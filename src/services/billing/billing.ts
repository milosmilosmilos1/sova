import 'server-only'

import { getPaymentProvider } from '@/integrations/payments'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, requireMembership } from '@/lib/auth/workspace'
import { billingBlocked } from '@/lib/billing/rules'
import { env } from '@/lib/env'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenBalance } from '@/lib/tokens/reservation'
import { getWorkspacePlan, listPlans, planByCode, stripePriceId, type PlanLimits } from '@/services/plans'

/**
 * Naplata za korisnika (faza 12, D-090): pregled, Checkout za pretplatu i dopunu, Customer Portal,
 * istorija tokena. Tokeni se nikad ne dodeljuju ovde: sve dodeljuje webhook (T7).
 */
export interface BillingPlanView {
  code: string
  name: string
  kind: 'subscription' | 'topup'
  interval: string | null
  priceCents: number
  /** redovna cena posle uvodnog perioda (D-106), samo kad je veća od uvodne */
  regularPriceCents: number | null
  currency: string
  tokens: number
  tokenPeriod: string
}

export interface BillingOverview {
  workspaceId: string
  configured: boolean
  canManage: boolean
  plan: { code: string; name: string; limits: PlanLimits }
  subscription: {
    status: string
    planCode: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    graceUntil: string | null
    blocked: boolean
  } | null
  hasCustomer: boolean
  balance: { total: number; reserved: number; available: number }
  plans: BillingPlanView[]
}

const appUrl = () => env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const billingPage = '/app/billing'

export async function getBillingOverview(viewer: Viewer, workspaceId: string): Promise<BillingOverview> {
  const membership = await requireMembership(viewer, workspaceId)
  const admin = createSupabaseAdminClient()
  const [plan, balance, plans, subRes, customerRes] = await Promise.all([
    getWorkspacePlan(workspaceId),
    getTokenBalance(workspaceId),
    listPlans(),
    admin
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end, grace_until, plans!inner(code)')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(1),
    admin.from('billing_customers').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  const sub = subRes.data?.[0] ?? null
  return {
    workspaceId,
    configured: getPaymentProvider().isConfigured(),
    canManage: membership.role === 'owner',
    plan: { code: plan.code, name: plan.name, limits: plan.limits },
    subscription: sub
      ? {
          status: sub.status,
          planCode: sub.plans.code,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          graceUntil: sub.grace_until,
          blocked: billingBlocked(sub, new Date()),
        }
      : null,
    hasCustomer: Boolean(customerRes.data),
    balance,
    plans: plans
      .filter((p) => p.code !== 'free')
      .map((p) => ({
        code: p.code,
        name: p.name,
        kind: p.kind,
        interval: p.interval,
        priceCents: p.price_cents,
        regularPriceCents:
          p.regular_price_cents && p.regular_price_cents > p.price_cents ? p.regular_price_cents : null,
        currency: p.currency,
        tokens: p.tokens_per_period,
        tokenPeriod: p.token_period,
      })),
  }
}

/** Jedan Stripe kupac po radnom prostoru (Checkout bez `customer` bi svaki put pravio novog). */
async function ensureCustomer(workspaceId: string): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data: existing } = await admin
    .from('billing_customers')
    .select('provider_customer_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (existing) return existing.provider_customer_id
  const { data: ws } = await admin
    .from('workspaces')
    .select('name, billing_email, profiles!workspaces_owner_id_fkey(email)')
    .eq('id', workspaceId)
    .single()
  const customerId = await getPaymentProvider().createCustomer({
    workspaceId,
    name: ws?.name ?? 'Sova',
    email: ws?.billing_email ?? ws?.profiles?.email ?? null,
  })
  const { error } = await admin
    .from('billing_customers')
    .upsert(
      { workspace_id: workspaceId, provider: 'stripe', provider_customer_id: customerId },
      { onConflict: 'workspace_id', ignoreDuplicates: true },
    )
  if (error) throw error
  const { data: saved } = await admin
    .from('billing_customers')
    .select('provider_customer_id')
    .eq('workspace_id', workspaceId)
    .single()
  return saved!.provider_customer_id
}

function requireConfigured() {
  const provider = getPaymentProvider()
  if (!provider.isConfigured()) throw new ApiError('BILLING_UNAVAILABLE', 'Naplata još nije podešena.')
  return provider
}

/** Checkout za mesečni ili godišnji plan; radni prostor sa aktivnom pretplatom menja plan kroz Portal. */
export async function startSubscriptionCheckout(
  viewer: Viewer,
  input: { workspaceId: string; planCode: string },
): Promise<{ url: string }> {
  await requireMembership(viewer, input.workspaceId, ['owner'])
  const provider = requireConfigured()
  const plan = await planByCode(input.planCode)
  if (!plan || plan.kind !== 'subscription' || plan.code === 'free' || !plan.is_active)
    throw new ApiError('VALIDATION', 'Izabrani plan ne postoji.')
  const priceId = stripePriceId(plan)
  if (!priceId) throw new ApiError('BILLING_UNAVAILABLE', 'Cena ovog plana još nije podešena.')
  const current = await getWorkspacePlan(input.workspaceId)
  if (current.subscriptionStatus)
    throw new ApiError('CONFLICT', 'Radni prostor već ima pretplatu. Plan menjate u upravljanju pretplatom.')
  const customerId = await ensureCustomer(input.workspaceId)
  const session = await provider.createSubscriptionCheckout({
    customerId,
    workspaceId: input.workspaceId,
    planCode: plan.code,
    priceId,
    successUrl: `${appUrl()}${billingPage}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}${billingPage}?checkout=canceled`,
  })
  return { url: session.url }
}

/** Checkout za paket tokena (bez isteka). */
export async function startTopupCheckout(
  viewer: Viewer,
  input: { workspaceId: string; planCode: string },
): Promise<{ url: string }> {
  await requireMembership(viewer, input.workspaceId, ['owner'])
  const provider = requireConfigured()
  const plan = await planByCode(input.planCode)
  if (!plan || plan.kind !== 'topup' || !plan.is_active)
    throw new ApiError('VALIDATION', 'Izabrani paket ne postoji.')
  const customerId = await ensureCustomer(input.workspaceId)
  const session = await provider.createTopupCheckout({
    customerId,
    workspaceId: input.workspaceId,
    planCode: plan.code,
    name: `Sova tokeni: ${plan.name}`,
    amountCents: plan.price_cents,
    currency: plan.currency,
    successUrl: `${appUrl()}${billingPage}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}${billingPage}?checkout=canceled`,
  })
  return { url: session.url }
}

/** Customer Portal: kartica, fakture, otkaz i promena plana (pravila podešava vlasnik u Stripe-u). */
export async function openBillingPortal(viewer: Viewer, workspaceId: string): Promise<{ url: string }> {
  await requireMembership(viewer, workspaceId, ['owner'])
  const provider = requireConfigured()
  const { data } = await createSupabaseAdminClient()
    .from('billing_customers')
    .select('provider_customer_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!data) throw new ApiError('NOT_FOUND', 'Radni prostor još nema plaćanja.')
  return provider.createPortalSession({
    customerId: data.provider_customer_id,
    returnUrl: `${appUrl()}${billingPage}`,
  })
}

export interface LedgerEntry {
  id: number
  delta: number
  balanceAfter: number
  reason: string
  source: string | null
  createdAt: string
}

/** Istorija tokena (vlasnik i administrator), najnovije prvo, stranice po `before`. */
export async function listTokenLedger(
  viewer: Viewer,
  workspaceId: string,
  opts: { before?: number; limit?: number } = {},
): Promise<{ entries: LedgerEntry[]; nextBefore: number | null }> {
  await requireMembership(viewer, workspaceId, ADMIN_ROLES)
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  let q = createSupabaseAdminClient()
    .from('token_ledger')
    .select('id, delta, balance_after, reason, created_at, token_grants(source)')
    .eq('workspace_id', workspaceId)
    .order('id', { ascending: false })
    .limit(limit)
  if (opts.before) q = q.lt('id', opts.before)
  const { data, error } = await q
  if (error) throw error
  const entries = (data ?? []).map((r) => ({
    id: r.id,
    delta: r.delta,
    balanceAfter: r.balance_after,
    reason: r.reason,
    source: r.token_grants?.source ?? null,
    createdAt: r.created_at,
  }))
  return { entries, nextBefore: entries.length === limit ? entries[entries.length - 1]!.id : null }
}
