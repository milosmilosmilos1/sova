import { describe, expect, it } from 'vitest'

import {
  bestTimesFromHistory,
  engagementOf,
  mergeBestTimes,
  nextMonday,
  planCalendar,
  weekStartDate,
  type HistoryPoint,
} from '@/lib/strategy/plan'

const TZ = 'Europe/Belgrade'

function points(
  platform: 'instagram' | 'facebook',
  n: number,
  weekday: number,
  hourUtc: number,
  eng: number,
): HistoryPoint[] {
  // 2026-06-01 je ponedeljak; sve u letnjem računanju vremena (bez prelaza na zimsko)
  const out: HistoryPoint[] = []
  for (let i = 0; i < n; i++) {
    const base = new Date(Date.UTC(2026, 5, 1 + ((weekday - 1 + 7) % 7) + i * 7, hourUtc, 0, 0))
    out.push({ platform, publishedAt: base.toISOString(), engagement: eng })
  }
  return out
}

describe('bestTimesFromHistory', () => {
  it('mreža sa 10+ objava dobija termine iz podataka (lokalni sat), ostale ne', () => {
    const data = [
      ...points('instagram', 6, 2, 16, 50), // utorak 18:00 po Beogradu (CEST)
      ...points('instagram', 6, 4, 10, 10), // četvrtak 12:00
      ...points('facebook', 3, 1, 9, 5),
    ]
    const bt = bestTimesFromHistory(data, TZ)
    expect(bt.facebook).toBeUndefined()
    expect(bt.instagram?.[0]).toMatchObject({ weekday: 2, hour: 18, source: 'data' })
    expect(bt.instagram?.[1]).toMatchObject({ weekday: 4, hour: 12, source: 'data' })
  })
  it('engagementOf zbraja reakcije, komentare x2, deljenja i čuvanja x3', () => {
    expect(engagementOf({ likes: 10, comments: 2, shares: 1, saves: 1 })).toBe(10 + 4 + 6)
    expect(engagementOf({ engagement: 42 })).toBe(42)
    expect(engagementOf(null)).toBe(0)
  })
})

describe('mergeBestTimes', () => {
  it('podaci > model > pretpostavke iz tabele', () => {
    const merged = mergeBestTimes(
      ['instagram', 'facebook', 'linkedin'],
      { instagram: [{ weekday: 2, hour: 18, minute: 0, source: 'data' }] },
      [
        { platform: 'facebook', weekday: 3, hour: 13 },
        { platform: 'facebook', weekday: 9, hour: 13 },
      ],
    )
    expect(merged.instagram?.[0]?.source).toBe('data')
    expect(merged.facebook).toEqual([{ weekday: 3, hour: 13, minute: 0, source: 'assumption' }])
    expect(merged.linkedin?.length).toBe(3)
    expect(merged.linkedin?.[0]?.source).toBe('assumption')
  })
})

describe('planCalendar', () => {
  const base = {
    periodStart: '2026-11-02', // ponedeljak
    weeks: 2,
    networkMix: {
      instagram: { per_week: 3, formats: [], role: '' },
      facebook: { per_week: 2, formats: [], role: '' },
    },
    bestTimes: {
      instagram: [
        { weekday: 2, hour: 18, minute: 0, source: 'data' as const },
        { weekday: 4, hour: 18, minute: 0, source: 'data' as const },
        { weekday: 6, hour: 11, minute: 0, source: 'data' as const },
      ],
    },
    weeklyThemes: [
      { week: 1, theme: 'Priprema za zimu', angle: 'saveti', pillar: 'Edukacija', campaign: '' },
      { week: 2, theme: 'Ponuda meseca', angle: 'popust', pillar: 'Ponuda', campaign: 'Zimska akcija' },
    ],
    holidays: new Set<string>(),
  }
  it('broj objava = nedelje × zbir per_week, bez duplih termina, teme po nedelji', () => {
    const plan = planCalendar(base)
    expect(plan).toHaveLength(2 * (3 + 2))
    const keys = new Set(plan.map((p) => `${p.platform}|${p.date}|${p.timeLocal}`))
    expect(keys.size).toBe(plan.length)
    expect(
      plan
        .filter((p) => p.week === 2)
        .every((p) => p.theme === 'Ponuda meseca' && p.campaign === 'Zimska akcija'),
    ).toBe(true)
    expect(plan.every((p) => p.date >= '2026-11-02' && p.date <= '2026-11-15')).toBe(true)
    const ig = plan.find((p) => p.platform === 'instagram' && p.week === 1)!
    expect(ig).toMatchObject({ date: '2026-11-03', timeLocal: '18:00', source: 'data' })
  })
  it('praznik pomera objavu za dan; mreža bez vremena dobija pretpostavke', () => {
    const plan = planCalendar({ ...base, holidays: new Set(['2026-11-03']) })
    const ig = plan.filter((p) => p.platform === 'instagram' && p.week === 1)
    expect(ig.some((p) => p.date === '2026-11-03')).toBe(false)
    expect(ig.some((p) => p.date === '2026-11-04' && p.timeLocal === '18:00')).toBe(true)
    const fb = plan.find((p) => p.platform === 'facebook')!
    expect(fb.source).toBe('assumption')
  })
  it('weekStartDate i nextMonday', () => {
    expect(weekStartDate('2026-11-02', 3)).toBe('2026-11-16')
    expect(nextMonday(new Date('2026-10-24T10:00:00Z'))).toBe('2026-10-26')
    expect(nextMonday(new Date('2026-10-26T10:00:00Z'))).toBe('2026-11-02')
  })
})
