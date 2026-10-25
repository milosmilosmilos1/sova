import { describe, expect, it } from 'vitest'

import {
  cheapestTopup,
  plural,
  pricingFromPlans,
  recommendPlan,
  tokensNeeded,
  type PlanInput,
} from './pricing-math'

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
    currency: 'USD',
    tokens_per_period: 50,
    limits: { brands: 1, social_accounts: 2, members: 1 },
  },
  {
    code: 'monthly',
    kind: 'subscription',
    name: 'Mesečni',
    price_cents: 3900,
    currency: 'USD',
    tokens_per_period: 500,
    limits: { brands: 3, social_accounts: 10, members: 3 },
  },
  {
    code: 'yearly',
    kind: 'subscription',
    name: 'Godišnji',
    price_cents: 19900,
    currency: 'USD',
    tokens_per_period: 500,
    limits: { brands: 3, social_accounts: 10, members: 3 },
  },
  {
    code: 'topup_1000',
    kind: 'topup',
    name: '1.000 tokena',
    price_cents: 8500,
    currency: 'USD',
    tokens_per_period: 1000,
    limits: {},
  },
  {
    code: 'topup_100',
    kind: 'topup',
    name: '100 tokena',
    price_cents: 1200,
    currency: 'USD',
    tokens_per_period: 100,
    limits: {},
  },
  {
    code: 'topup_300',
    kind: 'topup',
    name: '300 tokena',
    price_cents: 3000,
    currency: 'USD',
    tokens_per_period: 300,
    limits: {},
  },
]

describe('cenovnik na landingu', () => {
  it('slaže planove i dopune iz baze, dopune od najmanje', () => {
    const data = pricingFromPlans(PLANS, COSTS)!
    expect(data.free).toEqual({ name: 'Besplatno', tokens: 50, brands: 1, networks: 2 })
    expect(data.monthly).toMatchObject({ priceCents: 3900, tokens: 500, brands: 3, networks: 10, members: 3 })
    expect(data.topups.map((t) => t.tokens)).toEqual([100, 300, 1000])
    expect(
      pricingFromPlans(
        PLANS.filter((p) => p.code !== 'yearly'),
        COSTS,
      ),
    ).toBeNull()
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

  it('množina u srpskom', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25].map((n) => plural(n, 'brend', 'brenda', 'brendova'))).toEqual([
      'brend',
      'brenda',
      'brendova',
      'brendova',
      'brendova',
      'brend',
      'brenda',
      'brendova',
    ])
  })
})
