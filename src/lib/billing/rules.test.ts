import { describe, expect, it } from 'vitest'

import {
  addMonthsUtc,
  billingBlocked,
  dunningStepDue,
  graceUntil,
  refundTokens,
  sliceReference,
  tokenSlice,
} from './rules'

const d = (s: string) => new Date(s)

describe('pravila naplate', () => {
  it('meseci u UTC: 31. januar plus mesec je poslednji dan februara', () => {
    expect(addMonthsUtc(d('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z')
    expect(addMonthsUtc(d('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z')
    expect(addMonthsUtc(d('2026-10-24T08:30:00Z'), 12).toISOString()).toBe('2027-10-24T08:30:00.000Z')
  })

  it('godišnji plan: mesečni deo koji sadrži današnji dan, poslednji deo završava sa periodom', () => {
    const start = d('2026-10-24T08:00:00Z')
    const end = d('2027-10-24T08:00:00Z')
    expect(tokenSlice(start, end, d('2026-10-24T08:00:00Z'))).toMatchObject({ index: 0 })
    const s = tokenSlice(start, end, d('2027-01-30T12:00:00Z'))!
    expect(s.index).toBe(3)
    expect(s.start.toISOString()).toBe('2027-01-24T08:00:00.000Z')
    expect(s.end.toISOString()).toBe('2027-02-24T08:00:00.000Z')
    expect(tokenSlice(start, end, d('2027-10-01T00:00:00Z'))!.end.toISOString()).toBe(end.toISOString())
    expect(tokenSlice(start, end, d('2027-10-24T08:00:00Z'))).toBeNull()
    expect(tokenSlice(start, end, d('2026-10-01T00:00:00Z'))).toBeNull()
    expect(sliceReference('sub_1', s.start)).toBe('sub_1:2027-01-24')
  })

  it('povraćaj: tokeni srazmerno vraćenom iznosu, nikad više od dodeljenih', () => {
    expect(refundTokens(300, 3000, 3000)).toBe(300)
    expect(refundTokens(300, 1000, 3000)).toBe(100)
    expect(refundTokens(500, 1950, 3900)).toBe(250)
    expect(refundTokens(300, 9000, 3000)).toBe(300)
    expect(refundTokens(300, 0, 3000)).toBe(0)
  })

  it('rok za plaćanje 7 dana, podsetnici dan 1, 3 i 6, blokada posle roka ili kad je unpaid', () => {
    const failed = d('2026-10-24T10:00:00Z')
    const grace = graceUntil(null, failed)
    expect(grace).toBe('2026-10-31T10:00:00.000Z')
    expect(graceUntil('2026-10-30T00:00:00.000Z', failed)).toBe('2026-10-30T00:00:00.000Z')
    expect(dunningStepDue(grace, d('2026-10-24T20:00:00Z'))).toBe(0)
    expect(dunningStepDue(grace, d('2026-10-25T10:00:00Z'))).toBe(1)
    expect(dunningStepDue(grace, d('2026-10-27T11:00:00Z'))).toBe(2)
    expect(dunningStepDue(grace, d('2026-10-30T10:00:00Z'))).toBe(3)
    expect(billingBlocked({ status: 'past_due', grace_until: grace }, d('2026-10-30T00:00:00Z'))).toBe(false)
    expect(billingBlocked({ status: 'past_due', grace_until: grace }, d('2026-11-01T00:00:00Z'))).toBe(true)
    expect(billingBlocked({ status: 'unpaid', grace_until: null }, failed)).toBe(true)
    expect(billingBlocked({ status: 'active', grace_until: null }, failed)).toBe(false)
    expect(billingBlocked(null, failed)).toBe(false)
  })
})
