import { describe, expect, it } from 'vitest'

import { cheapestTopup, pricingFromPlans, recommendPlan, tokensNeeded, type PlanInput } from './pricing-math'

const COSTS = { text: 2, image: 8, strategy: 20, xPost: 1, xPostWithLink: 6 }
const TOPUPS = [
  { tokens: 100, priceCents: 1200 },
  { tokens: 300, priceCents: 3000 },
  { tokens: 1000, priceCents: 8500 },
]
const PLANS: PlanInput[] = [
  {
    code: 'free',
    kind: 'subscription',
    name: 'Besplatno',
    price_cents: 0,
    currency: 'EUR',
    tokens_per_period: 50,
    limits: { brands: 1, social_accounts: 2, members: 1 },
  },
  {
    code: 'monthly',
    kind: 'subscription',
    name: 'Mesečni',
    price_cents: 4700,
    currency: 'EUR',
    tokens_per_period: 500,
    limits: { brands: 5, social_accounts: 10, members: 2 },
  },
  {
    code: 'yearly',
    kind: 'subscription',
    name: 'Godišnji',
    price_cents: 29700,
    currency: 'EUR',
    tokens_per_period: 500,
    limits: { brands: 5, social_accounts: 10, members: 2 },
  },
  {
    code: 'topup_1000',
    kind: 'topup',
    name: '1.000 tokena',
    price_cents: 8500,
    currency: 'EUR',
    tokens_per_period: 1000,
    limits: {},
  },
  {
    code: 'topup_100',
    kind: 'topup',
    name: '100 tokena',
    price_cents: 1200,
    currency: 'EUR',
    tokens_per_period: 100,
    limits: {},
  },
  {
    code: 'topup_300',
    kind: 'topup',
    name: '300 tokena',
    price_cents: 3000,
    currency: 'EUR',
    tokens_per_period: 300,
    limits: {},
  },
]

describe('cenovnik na landingu', () => {
  it('slaže planove i dopune iz baze, dopune od najmanje', () => {
    const data = pricingFromPlans(PLANS, COSTS)!
    expect(data.free).toEqual({ name: 'Besplatno', tokens: 50, brands: 1, networks: 2 })
    expect(data.monthly).toMatchObject({ priceCents: 4700, tokens: 500, brands: 5, networks: 10, members: 2 })
    expect(data.topups.map((t) => t.tokens)).toEqual([100, 300, 1000])
    expect(
      pricingFromPlans(
        PLANS.filter((p) => p.code !== 'yearly'),
        COSTS,
      ),
    ).toBeNull()
  })

  it('plaćeni planovi i dopune moraju biti u istoj valuti; besplatni plan se ne broji', () => {
    const mixed = PLANS.map((p) => (p.code === 'topup_100' ? { ...p, currency: 'USD' } : p))
    expect(pricingFromPlans(mixed, COSTS)).toBeNull()
    const freeInUsd = PLANS.map((p) => (p.code === 'free' ? { ...p, currency: 'USD' } : p))
    expect(pricingFromPlans(freeInUsd, COSTS)?.currency).toBe('EUR')
  })

  it('objava sa slikom košta tekst i sliku, strategija se dodaje po izboru', () => {
    expect(tokensNeeded(COSTS, 8, 16, true)).toBe(196)
    expect(tokensNeeded(COSTS, 8, 16, false)).toBe(176)
  })

  it('preporuka: besplatno, plan, pa plan sa najjeftinijom dopunom', () => {
    const data = pricingFromPlans(PLANS, COSTS)!
    expect(recommendPlan(50, data)).toEqual({ kind: 'free' })
    expect(recommendPlan(196, data)).toEqual({ kind: 'plan', left: 304 })
    expect(recommendPlan(740, data)).toEqual({
      kind: 'topup',
      excess: 240,
      topup: { parts: [300], costCents: 3000 },
    })
  })

  it('kombinacija dopuna je najjeftinija, ne najmanja', () => {
    expect(cheapestTopup(200, TOPUPS)).toEqual({ parts: [100, 100], costCents: 2400 })
    expect(cheapestTopup(700, TOPUPS)).toEqual({ parts: [300, 300, 100], costCents: 7200 })
    expect(cheapestTopup(900, TOPUPS)).toEqual({ parts: [1000], costCents: 8500 })
    expect(cheapestTopup(10, [])).toBeNull()
  })
})
