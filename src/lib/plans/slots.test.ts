import { describe, expect, it } from 'vitest'

import { buildSlots, MAX_SLOTS, monthEnd, planPeriod, postsOnDay, rotationFor, slotMonths } from './slots'

/** Termini mesečnog plana (D-119). */
describe('mesečni plan: period i termini', () => {
  it('ostatak meseca počinje sutra, sledeći mesec je ceo; poslednji dan meseca nema ostatka', () => {
    expect(planPeriod('current', '2026-10-30')).toEqual({
      month: '2026-10-01',
      start: '2026-10-31',
      end: '2026-10-31',
    })
    expect(planPeriod('current', '2026-10-31')).toBeNull()
    expect(planPeriod('next', '2026-10-30')).toEqual({
      month: '2026-11-01',
      start: '2026-11-01',
      end: '2026-11-30',
    })
    expect(planPeriod('next', '2026-12-15')).toEqual({
      month: '2027-01-01',
      start: '2027-01-01',
      end: '2027-01-31',
    })
    expect(planPeriod('next', '2027-01-20')!.end).toBe('2027-02-28')
  })

  it('plan za više meseci: kraj je poslednji dan poslednjeg meseca, i preko nove godine (D-120)', () => {
    expect(planPeriod('next', '2026-11-15', 3)).toEqual({
      month: '2026-12-01',
      start: '2026-12-01',
      end: '2027-02-28',
    })
    expect(planPeriod('current', '2026-11-15', 2)).toEqual({
      month: '2026-11-01',
      start: '2026-11-16',
      end: '2026-12-31',
    })
    expect(planPeriod('current', '2026-11-30', 2)).toBeNull()
    expect(monthEnd('2028-01-01', 2)).toBe('2028-02-29')
    expect(monthEnd('2026-11-01')).toBe('2026-11-30')
  })

  it('dani u nedelji po broju objava: 3 = pon, sre, pet; 10 = svaki dan i tri dana dvaput', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => postsOnDay(d, 3))).toEqual([0, 1, 0, 1, 0, 1, 0])
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => postsOnDay(d, 5))).toEqual([0, 1, 1, 1, 1, 1, 0])
    const ten = [0, 1, 2, 3, 4, 5, 6].map((d) => postsOnDay(d, 10))
    expect(ten.reduce((a, b) => a + b, 0)).toBe(10)
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => postsOnDay(d, 14))).toEqual([2, 2, 2, 2, 2, 2, 2])
  })

  it('smenjuju se samo vrste koje bar jedna mreža prima', () => {
    expect(rotationFor(['text', 'image', 'carousel', 'video', 'story', 'link'], ['instagram'])).toEqual([
      'carousel',
      'image',
      'video',
      'carousel',
      'story',
      'image',
    ])
    expect(rotationFor(['story'], ['linkedin'])).toEqual([])
    expect(rotationFor(['text'], ['facebook'])).toEqual(['text'])
  })

  it('novembar sa 5 objava nedeljno: radni dani, sve vrste, svaka objava na mreže koje je primaju', () => {
    const slots = buildSlots({
      start: '2026-11-01',
      end: '2026-11-30',
      perWeek: 5,
      formats: ['text', 'image', 'carousel', 'video', 'story', 'link'],
      platforms: ['instagram', 'facebook', 'linkedin'],
    })
    expect(slots).toHaveLength(21)
    expect(new Set(slots.map((s) => s.format))).toEqual(
      new Set(['carousel', 'image', 'video', 'story', 'text', 'link']),
    )
    const story = slots.find((s) => s.format === 'story')!
    expect(story.platforms).toEqual(['instagram', 'facebook'])
    const text = slots.find((s) => s.format === 'text')!
    expect(text.platforms).toEqual(['facebook', 'linkedin'])
    expect(slots.every((s) => /^\d{2}:00$/.test(s.time))).toBe(true)
    // dve objave istog dana su u različito doba dana
    const twice = buildSlots({
      start: '2026-11-02',
      end: '2026-11-02',
      perWeek: 14,
      formats: ['image'],
      platforms: ['facebook'],
    })
    expect(new Set(twice.map((s) => s.time)).size).toBe(2)
    // najviše 60 termina po kalendarskom mesecu, i u planu za više meseci
    const busy = buildSlots({
      start: '2026-11-01',
      end: '2027-01-31',
      perWeek: 14,
      formats: ['image'],
      platforms: ['facebook'],
    })
    expect(slotMonths(busy)).toEqual(['2026-11', '2026-12', '2027-01'])
    for (const m of slotMonths(busy)) expect(busy.filter((s) => s.date.startsWith(m))).toHaveLength(MAX_SLOTS)
  })
})
