/**
 * Računica admin statistika (brif 16, D-073, D-074): MRR/ARR, churn, konverzija, vrednost tokena
 * i marža. Bez baze; jedinično testirano.
 */
export interface PlanLite {
  code: string
  kind: 'subscription' | 'topup'
  interval: 'month' | 'year' | null
  priceCents: number
  tokensPerPeriod: number
  tokenPeriod: 'once' | 'month'
}

export interface ActiveSubscriptionGroup {
  plan: string
  interval: 'month' | 'year' | null
  priceCents: number
  active: number
}

/** Mesečni ekvivalent cene pretplate u centima (godišnja / 12). */
export function monthlyCents(priceCents: number, interval: 'month' | 'year' | null): number {
  if (!priceCents || !interval) return 0
  return interval === 'year' ? Math.round(priceCents / 12) : priceCents
}

export function mrrCents(groups: ActiveSubscriptionGroup[]): number {
  return groups.reduce((sum, g) => sum + monthlyCents(g.priceCents, g.interval) * g.active, 0)
}

/** Churn za 30 dana = otkazane / (aktivne sada + otkazane u periodu); null bez osnove. */
export function churnRate(canceled30d: number, activeNow: number): number | null {
  const base = activeNow + canceled30d
  if (!base) return null
  return Math.round((canceled30d / base) * 1000) / 10
}

/** Konverzija besplatno → plaćeno = radni prostori sa plaćenom pretplatom ili dopunom / svi radni prostori. */
export function conversionRate(paidWorkspaces: number, totalWorkspaces: number): number | null {
  if (!totalWorkspaces) return null
  return Math.round((paidWorkspaces / totalWorkspaces) * 1000) / 10
}

/**
 * Vrednost jednog tokena u USD = najniža cena po tokenu među plaćenim planovima i dopunama.
 * Godišnji plan sa mesečnim tokenima deli se sa 12 meseci tokena (D-074).
 */
export function tokenValueUsd(plans: PlanLite[]): number | null {
  const perToken: number[] = []
  for (const p of plans) {
    if (!p.priceCents || !p.tokensPerPeriod) continue
    let tokens = p.tokensPerPeriod
    if (p.kind === 'subscription' && p.interval === 'year' && p.tokenPeriod === 'month') tokens *= 12
    perToken.push(p.priceCents / 100 / tokens)
  }
  if (!perToken.length) return null
  return Math.round(Math.min(...perToken) * 100000) / 100000
}

export interface MarginInput {
  tokens: number
  costUsd: number
  paid: boolean
  tokenValue: number | null
}

/** Prihod = tokeni × vrednost samo za plaćene radne prostore; marža = prihod − trošak. */
export function margin(input: MarginInput): { revenueUsd: number; marginUsd: number; negative: boolean } {
  const revenueUsd =
    input.paid && input.tokenValue ? Math.round(input.tokens * input.tokenValue * 10000) / 10000 : 0
  const marginUsd = Math.round((revenueUsd - input.costUsd) * 10000) / 10000
  return { revenueUsd, marginUsd, negative: marginUsd < 0 }
}
