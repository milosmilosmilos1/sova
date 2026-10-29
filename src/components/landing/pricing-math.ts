/**
 * Računica cenovnika sa landinga (D-098), bez Reacta da bi se testirala zasebno.
 * Planovi i cene tokena dolaze iz baze (`plans`, `token_prices`), pa landing prati izmene bez novog koda.
 */
export interface PricingCosts {
  text: number
  image: number
  strategy: number
  xPost: number
  xPostWithLink: number
}

export interface PricingTopup {
  tokens: number
  priceCents: number
}

export interface PricingData {
  currency: string
  costs: PricingCosts
  free: { name: string; tokens: number; brands: number; networks: number }
  monthly: {
    name: string
    priceCents: number
    /** redovna cena posle uvodnog perioda (D-106), null kad je nema */
    regularPriceCents: number | null
    tokens: number
    brands: number
    networks: number
    members: number
  }
  yearly: { name: string; priceCents: number; regularPriceCents: number | null; tokensPerMonth: number }
  topups: PricingTopup[]
}

/** Polja reda iz tabele `plans` koja cenovnik koristi. */
export interface PlanInput {
  code: string
  kind: string
  name: string
  price_cents: number
  regular_price_cents?: number | null
  currency: string
  tokens_per_period: number
  limits: unknown
}

function limit(limits: unknown, key: string): number {
  const v = limits && typeof limits === 'object' ? (limits as Record<string, unknown>)[key] : undefined
  return typeof v === 'number' ? v : 0
}

/** Redovna cena se prikazuje samo kad je veća od uvodne (D-106). */
export function regularPrice(plan: Pick<PlanInput, 'price_cents' | 'regular_price_cents'>): number | null {
  const regular = plan.regular_price_cents
  return regular && regular > plan.price_cents ? regular : null
}

/** Popust uvodne cene u odnosu na redovnu, zaokružen na ceo procenat. */
export function discountPercent(priceCents: number, regularPriceCents: number | null): number | null {
  return regularPriceCents ? Math.round((1 - priceCents / regularPriceCents) * 100) : null
}

/**
 * Podaci za cenovnik, ili null ako u bazi nema besplatnog, mesečnog ili godišnjeg plana, ili ako plaćeni
 * planovi i dopune nisu u istoj valuti (kalkulator sabira plan i dopune, D-099).
 */
export function pricingFromPlans(plans: PlanInput[], costs: PricingCosts): PricingData | null {
  const free = plans.find((p) => p.code === 'free')
  const monthly = plans.find((p) => p.code === 'monthly')
  const yearly = plans.find((p) => p.code === 'yearly')
  if (!free || !monthly || !yearly) return null
  const currency = monthly.currency.toUpperCase()
  const paid = plans.filter((p) => p.price_cents > 0)
  if (paid.some((p) => p.currency.toUpperCase() !== currency)) return null
  return {
    currency,
    costs,
    free: {
      name: free.name,
      tokens: free.tokens_per_period,
      brands: limit(free.limits, 'brands'),
      networks: limit(free.limits, 'social_accounts'),
    },
    monthly: {
      name: monthly.name,
      priceCents: monthly.price_cents,
      regularPriceCents: regularPrice(monthly),
      tokens: monthly.tokens_per_period,
      brands: limit(monthly.limits, 'brands'),
      networks: limit(monthly.limits, 'social_accounts'),
      members: limit(monthly.limits, 'members'),
    },
    yearly: {
      name: yearly.name,
      priceCents: yearly.price_cents,
      regularPriceCents: regularPrice(yearly),
      tokensPerMonth: yearly.tokens_per_period,
    },
    topups: plans
      .filter((p) => p.kind === 'topup' && p.tokens_per_period > 0)
      .map((p) => ({ tokens: p.tokens_per_period, priceCents: p.price_cents }))
      .sort((a, b) => a.tokens - b.tokens),
  }
}

export function tokensNeeded(
  costs: PricingCosts,
  textPosts: number,
  imagePosts: number,
  strategy: boolean,
): number {
  return textPosts * costs.text + imagePosts * (costs.text + costs.image) + (strategy ? costs.strategy : 0)
}

export interface TopupCombo {
  /** Veličine dopuna od najveće ka najmanjoj, npr. [300, 100]. */
  parts: number[]
  costCents: number
}

/** Najjeftinija kombinacija dopuna koja pokriva bar `excess` tokena (dopune se mogu ponavljati). */
export function cheapestTopup(excess: number, topups: PricingTopup[]): TopupCombo | null {
  if (excess <= 0) return { parts: [], costCents: 0 }
  if (!topups.length) return null
  // best[t]: najjeftinije pokrivanje bar t tokena
  const best: Array<TopupCombo | null> = [{ parts: [], costCents: 0 }]
  for (let t = 1; t <= excess; t++) {
    let pick: TopupCombo | null = null
    for (const top of topups) {
      const prev = best[Math.max(0, t - top.tokens)]
      if (!prev) continue
      const costCents = prev.costCents + top.priceCents
      if (!pick || costCents < pick.costCents) pick = { parts: [...prev.parts, top.tokens], costCents }
    }
    best[t] = pick
  }
  const result = best[excess]
  return result ? { ...result, parts: [...result.parts].sort((a, b) => b - a) } : null
}

export type Recommendation =
  | { kind: 'free' }
  | { kind: 'plan'; left: number }
  | { kind: 'topup'; excess: number; topup: TopupCombo | null }

/** Preporuka kao u dizajnu: do besplatnih tokena, do mesečnog paketa, ili plan plus dopuna. */
export function recommendPlan(tokens: number, data: PricingData): Recommendation {
  if (tokens <= data.free.tokens) return { kind: 'free' }
  if (tokens <= data.monthly.tokens) return { kind: 'plan', left: data.monthly.tokens - tokens }
  const excess = tokens - data.monthly.tokens
  return { kind: 'topup', excess, topup: cheapestTopup(excess, data.topups) }
}
