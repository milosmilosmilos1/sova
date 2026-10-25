import 'server-only'

import {
  churnRate,
  conversionRate,
  margin,
  mrrCents,
  tokenValueUsd,
  type ActiveSubscriptionGroup,
  type PlanLite,
} from '@/lib/admin/metrics'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getUsdRates } from '@/lib/tokens/prices'

/**
 * Statistike admin panela (brif 16 „Statistike”, D-073): agregati iz baze (`admin_dashboard_stats`,
 * `admin_activity_counts`) + računica naplate i marže. Naplata je nula do faze 12.
 */
export interface DashboardData {
  generatedAt: string
  users: {
    total: number
    new1d: number
    new7d: number
    new30d: number
    banned: number
    dau: number
    wau: number
    mau: number
    perDay: Array<{ day: string; count: number }>
  }
  workspaces: number
  brands: number
  billing: {
    enabled: boolean
    activeByPlan: Array<ActiveSubscriptionGroup & { name: string }>
    activeTotal: number
    mrrUsd: number
    arrUsd: number
    /** kurs po kom su cene planova preračunate u USD (D-099) */
    fxNote: string | null
    churn30d: number | null
    conversion: number | null
    paidWorkspaces: number
    topupWorkspaces: number
  }
  tokens: { consumed7d: number; consumed30d: number; granted30d: number; valueUsd: number | null }
  ai: {
    generations30d: number
    failed30d: number
    cost7dUsd: number
    cost30dUsd: number
    tokensCharged30d: number
    revenue30dUsd: number
    margin30dUsd: number
  }
  publishing: {
    byPlatform: Array<{ platform: string; published: number; failed: number }>
    late: number
    failed24h: number
  }
}

type Raw = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0)

export interface PlanCatalog {
  /** aktivni planovi sa cenom u USD centima */
  plans: PlanLite[]
  /** kurs (USD za jedinicu valute plana) po kodu plana, i za neaktivne planove koji još imaju pretplate */
  usdRateByCode: Map<string, number>
  /** napomena za panel, npr. „1 EUR = 1,1193 USD”; null kad su sve cene u USD */
  fxNote: string | null
}

/**
 * Planovi u USD: cene su u evrima, a admin izveštava u dolarima jer je trošak AI-ja u dolarima (D-099).
 * Plan u valuti bez kursa ne ulazi u zbirove dok se kurs ne doda u `platform_settings.fx_usd_rates`.
 */
export async function loadPlans(): Promise<PlanCatalog> {
  const admin = createSupabaseAdminClient()
  const [{ data }, rates] = await Promise.all([
    admin
      .from('plans')
      .select('code, kind, interval, price_cents, currency, tokens_per_period, token_period, is_active'),
    getUsdRates(),
  ])
  const plans: PlanLite[] = []
  const usdRateByCode = new Map<string, number>()
  const converted = new Set<string>()
  for (const p of data ?? []) {
    const currency = p.currency.toUpperCase()
    const rate = rates[currency]
    if (!rate) continue
    usdRateByCode.set(p.code, rate)
    if (currency !== 'USD' && p.price_cents > 0) converted.add(currency)
    if (!p.is_active) continue
    plans.push({
      code: p.code,
      kind: p.kind,
      interval: (p.interval as PlanLite['interval']) ?? null,
      priceCents: Math.round(p.price_cents * rate),
      tokensPerPeriod: p.tokens_per_period,
      tokenPeriod: p.token_period as PlanLite['tokenPeriod'],
    })
  }
  const fxNote =
    [...converted]
      .map((c) => `1 ${c} = ${rates[c]!.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 4 })} USD`)
      .join(', ') || null
  return { plans, usdRateByCode, fxNote }
}

export async function getDashboard(days = 30): Promise<DashboardData> {
  const admin = createSupabaseAdminClient()
  const [stats, activity, catalog] = await Promise.all([
    admin.rpc('admin_dashboard_stats', { p_days: days }),
    admin.rpc('admin_activity_counts'),
    loadPlans(),
  ])
  if (stats.error) throw mapDbError(stats.error)
  if (activity.error) throw mapDbError(activity.error)
  const s = (stats.data ?? {}) as Raw
  const a = (activity.data ?? {}) as Raw
  const plans = catalog.plans
  const subs = (Array.isArray(s.subscriptions) ? s.subscriptions : []) as Raw[]
  // cena iz pretplate je u valuti plana; MRR je u USD kao i ostatak panela
  const activeByPlan = subs.map((g) => ({
    plan: String(g.plan),
    name: String(g.name),
    interval: (g.interval as ActiveSubscriptionGroup['interval']) ?? null,
    priceCents: Math.round(num(g.price_cents) * (catalog.usdRateByCode.get(String(g.plan)) ?? 0)),
    active: num(g.active),
  }))
  const activeTotal = activeByPlan.reduce((n, g) => n + g.active, 0)
  const mrr = mrrCents(activeByPlan) / 100
  const valueUsd = tokenValueUsd(plans)
  const tokensCharged30d = num(s.tokens_charged_30d)
  const cost30 = num(s.ai_cost_30d)
  const paidShare = num(s.workspaces_total)
    ? (num(s.paid_workspaces) + num(s.topup_workspaces)) / num(s.workspaces_total)
    : 0
  // grubo za pregled: deo naplaćenih tokena srazmeran udelu plaćenih radnih prostora (tačno po radnom prostoru je na strani AI troškova)
  const m = margin({
    tokens: Math.round(tokensCharged30d * Math.min(1, paidShare)),
    costUsd: cost30,
    paid: true,
    tokenValue: valueUsd,
  })
  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: num(s.users_total),
      new1d: num(s.users_new_1d),
      new7d: num(s.users_new_7d),
      new30d: num(s.users_new_30d),
      banned: num(s.users_banned),
      dau: num(a.dau),
      wau: num(a.wau),
      mau: num(a.mau),
      perDay: ((Array.isArray(s.users_per_day) ? s.users_per_day : []) as Raw[]).map((d) => ({
        day: String(d.day),
        count: num(d.count),
      })),
    },
    workspaces: num(s.workspaces_total),
    brands: num(s.brands_total),
    billing: {
      enabled: activeTotal > 0,
      activeByPlan,
      activeTotal,
      mrrUsd: Math.round(mrr * 100) / 100,
      fxNote: catalog.fxNote,
      arrUsd: Math.round(mrr * 12 * 100) / 100,
      churn30d: churnRate(num(s.subscriptions_canceled_30d), activeTotal),
      conversion: conversionRate(num(s.paid_workspaces), num(s.workspaces_total)),
      paidWorkspaces: num(s.paid_workspaces),
      topupWorkspaces: num(s.topup_workspaces),
    },
    tokens: {
      consumed7d: num(s.tokens_consumed_7d),
      consumed30d: num(s.tokens_consumed_30d),
      granted30d: num(s.tokens_granted_30d),
      valueUsd,
    },
    ai: {
      generations30d: num(s.ai_generations_30d),
      failed30d: num(s.ai_failed_30d),
      cost7dUsd: Math.round(num(s.ai_cost_7d) * 10000) / 10000,
      cost30dUsd: Math.round(cost30 * 10000) / 10000,
      tokensCharged30d,
      revenue30dUsd: m.revenueUsd,
      margin30dUsd: m.marginUsd,
    },
    publishing: {
      byPlatform: ((Array.isArray(s.posts_by_platform) ? s.posts_by_platform : []) as Raw[]).map((p) => ({
        platform: String(p.platform),
        published: num(p.published),
        failed: num(p.failed),
      })),
      late: num(s.targets_late),
      failed24h: num(s.targets_failed_24h),
    },
  }
}

export interface AiCostsData {
  days: number
  tokenValueUsd: number | null
  fxNote: string | null
  byModel: Array<{ model: string; generations: number; failed: number; costUsd: number; tokens: number }>
  byDay: Array<{ day: string; costUsd: number; tokens: number; generations: number }>
  byWorkspace: Array<{
    workspaceId: string
    workspaceName: string
    ownerEmail: string | null
    generations: number
    costUsd: number
    tokens: number
    paid: boolean
    revenueUsd: number
    marginUsd: number
    negative: boolean
  }>
  negativeCount: number
}

/** AI troškovi po modelu, danu i radnom prostoru, sa maržom (brif 16, D-074). */
export async function getAiCosts(days = 30): Promise<AiCostsData> {
  const admin = createSupabaseAdminClient()
  const [res, catalog] = await Promise.all([admin.rpc('admin_ai_costs', { p_days: days }), loadPlans()])
  if (res.error) throw mapDbError(res.error)
  const d = (res.data ?? {}) as Raw
  const value = tokenValueUsd(catalog.plans)
  const byWorkspace = ((Array.isArray(d.by_workspace) ? d.by_workspace : []) as Raw[]).map((w) => {
    const costUsd = num(w.cost_usd)
    const tokens = num(w.tokens)
    const paid = w.paid === true
    const m = margin({ tokens, costUsd, paid, tokenValue: value })
    return {
      workspaceId: String(w.workspace_id),
      workspaceName: String(w.workspace_name ?? ''),
      ownerEmail: (w.owner_email as string | null) ?? null,
      generations: num(w.generations),
      costUsd,
      tokens,
      paid,
      revenueUsd: m.revenueUsd,
      marginUsd: m.marginUsd,
      negative: m.negative,
    }
  })
  return {
    days,
    tokenValueUsd: value,
    fxNote: catalog.fxNote,
    byModel: ((Array.isArray(d.by_model) ? d.by_model : []) as Raw[]).map((m) => ({
      model: String(m.model),
      generations: num(m.generations),
      failed: num(m.failed),
      costUsd: num(m.cost_usd),
      tokens: num(m.tokens),
    })),
    byDay: ((Array.isArray(d.by_day) ? d.by_day : []) as Raw[]).map((x) => ({
      day: String(x.day),
      costUsd: num(x.cost_usd),
      tokens: num(x.tokens),
      generations: num(x.generations),
    })),
    byWorkspace,
    negativeCount: byWorkspace.filter((w) => w.negative && w.costUsd > 0).length,
  }
}
