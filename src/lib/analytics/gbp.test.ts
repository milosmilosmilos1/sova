import { describe, expect, it } from 'vitest'

import { GBP_METRICS, gbpLocationTotals } from './gbp'

describe('metrike Google poslovnog profila (D-188)', () => {
  it('svaka metrika posebno, po lokaciji; za period samo zbir iste metrike po danima', () => {
    const out = gbpLocationTotals(
      [
        { accountId: 'a', raw: { BUSINESS_IMPRESSIONS_MOBILE_MAPS: 10, CALL_CLICKS: 1, engagement: 99 } },
        { accountId: 'a', raw: { BUSINESS_IMPRESSIONS_MOBILE_MAPS: 5, WEBSITE_CLICKS: 3 } },
        { accountId: 'b', raw: { BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 7, CALL_CLICKS: 'x' } },
        { accountId: 'c', raw: null },
      ],
      new Map([
        ['a', 'Novi Sad'],
        ['b', 'Beograd'],
      ]),
    )
    expect(out).toHaveLength(2)
    const a = out.find((l) => l.accountId === 'a')!
    expect(a).toMatchObject({ name: 'Novi Sad', days: 2 })
    expect(a.metrics).toMatchObject({
      BUSINESS_IMPRESSIONS_MOBILE_MAPS: 15,
      CALL_CLICKS: 1,
      WEBSITE_CLICKS: 3,
    })
    // nema zbira različitih metrika ni stranih ključeva
    expect(Object.keys(a.metrics).sort()).toEqual([...GBP_METRICS].sort())
    const b = out.find((l) => l.accountId === 'b')!
    expect(b.metrics.CALL_CLICKS).toBe(0)
    expect(b.metrics.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH).toBe(7)
  })
})
