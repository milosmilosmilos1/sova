import { describe, expect, it } from 'vitest'

import { csvCell, toCsv } from '@/lib/admin/csv'
import {
  churnRate,
  conversionRate,
  margin,
  monthlyCents,
  mrrCents,
  tokenValueUsd,
  type PlanLite,
} from '@/lib/admin/metrics'

const PLANS: PlanLite[] = [
  {
    code: 'free',
    kind: 'subscription',
    interval: null,
    priceCents: 0,
    tokensPerPeriod: 50,
    tokenPeriod: 'once',
  },
  {
    code: 'monthly',
    kind: 'subscription',
    interval: 'month',
    priceCents: 3900,
    tokensPerPeriod: 500,
    tokenPeriod: 'month',
  },
  {
    code: 'yearly',
    kind: 'subscription',
    interval: 'year',
    priceCents: 19900,
    tokensPerPeriod: 500,
    tokenPeriod: 'month',
  },
  {
    code: 'topup_1000',
    kind: 'topup',
    interval: null,
    priceCents: 8500,
    tokensPerPeriod: 1000,
    tokenPeriod: 'once',
  },
]

describe('naplata', () => {
  it('MRR sabira mesečni ekvivalent, godišnji plan deli sa 12', () => {
    expect(monthlyCents(19900, 'year')).toBe(1658)
    expect(monthlyCents(3900, 'month')).toBe(3900)
    expect(monthlyCents(0, 'month')).toBe(0)
    expect(
      mrrCents([
        { plan: 'monthly', interval: 'month', priceCents: 3900, active: 3 },
        { plan: 'yearly', interval: 'year', priceCents: 19900, active: 2 },
      ]),
    ).toBe(3 * 3900 + 2 * 1658)
  })
  it('churn i konverzija u procentima; bez osnove null', () => {
    expect(churnRate(1, 9)).toBe(10)
    expect(churnRate(0, 0)).toBeNull()
    expect(conversionRate(5, 40)).toBe(12.5)
    expect(conversionRate(0, 0)).toBeNull()
  })
})

describe('tokeni i marža', () => {
  it('vrednost tokena je najniža cena po tokenu (godišnji plan sa 12 meseci tokena)', () => {
    expect(tokenValueUsd(PLANS)).toBe(0.03317)
    expect(tokenValueUsd([PLANS[0]!])).toBeNull()
  })
  it('besplatan radni prostor nema prihod, plaćen ima tokeni × vrednost', () => {
    expect(margin({ tokens: 100, costUsd: 0.2, paid: false, tokenValue: 0.03317 })).toEqual({
      revenueUsd: 0,
      marginUsd: -0.2,
      negative: true,
    })
    expect(margin({ tokens: 100, costUsd: 0.2, paid: true, tokenValue: 0.03317 })).toMatchObject({
      revenueUsd: 3.317,
      negative: false,
    })
  })
})

describe('CSV', () => {
  it('navodnici, zarezi, novi redovi i zaštita od formula', () => {
    expect(csvCell('običan tekst')).toBe('običan tekst')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('rekao je "da"')).toBe('"rekao je ""da"""')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
    expect(csvCell(null)).toBe('')
    expect(toCsv(['x', 'y'], [[1, 'a\nb']])).toBe('x,y\r\n1,"a\nb"\r\n')
  })
})
