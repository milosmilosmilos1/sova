import { describe, expect, it } from 'vitest'

import {
  isMonthlyReportDue,
  isReportMonth,
  monthBounds,
  monthLabel,
  monthName,
  previousMonth,
  recentMonths,
  shiftMonth,
} from './period'

describe('mesec izveštaja (D-094)', () => {
  it('granice oktobra u Beogradu prate prelazak na zimsko vreme', () => {
    expect(monthBounds('2026-10', 'Europe/Belgrade')).toEqual({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      from: '2026-09-30T22:00:00.000Z',
      to: '2026-10-31T22:59:59.999Z',
    })
  })

  it('februar i prelaz godine', () => {
    expect(monthBounds('2026-02', 'UTC').periodEnd).toBe('2026-02-28')
    expect(monthBounds('2028-02', 'UTC').periodEnd).toBe('2028-02-29')
    expect(monthBounds('2026-12', 'UTC').to).toBe('2026-12-31T23:59:59.999Z')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('prethodni mesec po lokalnom vremenu brenda', () => {
    // 1. novembar u 06:00 UTC: u Beogradu je već novembar, u Los Anđelesu još 31. oktobar
    const now = new Date('2026-11-01T06:00:00Z')
    expect(previousMonth(now, 'Europe/Belgrade')).toBe('2026-10')
    expect(previousMonth(now, 'America/Los_Angeles')).toBe('2026-09')
    expect(previousMonth(new Date('2026-11-01T12:00:00Z'), 'America/Los_Angeles')).toBe('2026-10')
  })

  it('izbor meseci i natpisi', () => {
    expect(recentMonths(new Date('2026-01-15T10:00:00Z'), 'UTC', 3)).toEqual([
      '2026-01',
      '2025-12',
      '2025-11',
    ])
    expect(monthLabel('2026-10')).toBe('oktobar 2026.')
    expect(monthName('2026-09')).toBe('septembar')
    expect(isReportMonth('2026-10')).toBe(true)
    expect(isReportMonth('2026-13')).toBe(false)
    expect(isReportMonth('2026-1')).toBe(false)
  })

  it('mesečni posao čeka 06:00 po zoni brenda 1. u mesecu', () => {
    expect(isMonthlyReportDue(new Date('2026-11-01T04:30:00Z'), 'Europe/Belgrade')).toBe(false)
    expect(isMonthlyReportDue(new Date('2026-11-01T05:00:00Z'), 'Europe/Belgrade')).toBe(true)
    // u Los Anđelesu je tada još 31. oktobar
    expect(isMonthlyReportDue(new Date('2026-11-01T06:00:00Z'), 'America/Los_Angeles')).toBe(false)
    expect(isMonthlyReportDue(new Date('2026-11-01T14:00:00Z'), 'America/Los_Angeles')).toBe(true)
    expect(isMonthlyReportDue(new Date('2026-11-02T10:00:00Z'), 'Europe/Belgrade')).toBe(true)
    expect(isMonthlyReportDue(new Date('2026-11-03T10:00:00Z'), 'Europe/Belgrade')).toBe(false)
  })
})
