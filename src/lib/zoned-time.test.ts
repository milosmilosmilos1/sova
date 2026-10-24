import { describe, expect, it } from 'vitest'

import { shiftToZone, wallClock, zonedToUtc } from './zoned-time'

describe('zonedToUtc', () => {
  it('običan dan: zimsko i letnje vreme u Beogradu', () => {
    expect(zonedToUtc('2026-11-02', '10:00', 'Europe/Belgrade')).toBe('2026-11-02T09:00:00.000Z')
    expect(zonedToUtc('2026-07-15', '10:00', 'Europe/Belgrade')).toBe('2026-07-15T08:00:00.000Z')
  })

  it('K2: 29.3.2026 02:30 ne postoji u Beogradu → 03:30 po letnjem vremenu', () => {
    const iso = zonedToUtc('2026-03-29', '02:30', 'Europe/Belgrade')
    expect(iso).toBe('2026-03-29T01:30:00.000Z')
    expect(wallClock(iso, 'Europe/Belgrade')).toEqual({ date: '2026-03-29', time: '03:30' })
  })

  it('K2: 25.10.2026 02:30 postoji dvaput u Beogradu → raniji trenutak (letnje vreme)', () => {
    expect(zonedToUtc('2026-10-25', '02:30', 'Europe/Belgrade')).toBe('2026-10-25T00:30:00.000Z')
  })

  it('sat posle prelaza ostaje tačan i kad je prelaz između lokalnog sata i UTC trenutka', () => {
    // Beograd, sat pre prelaza na zimsko (01:30 je još letnje vreme)
    expect(zonedToUtc('2026-10-25', '01:30', 'Europe/Belgrade')).toBe('2026-10-24T23:30:00.000Z')
    // Njujork: prelaz u 02:00 lokalno, a 05:30 je već standardno vreme (UTC−5)
    expect(zonedToUtc('2026-11-01', '05:30', 'America/New_York')).toBe('2026-11-01T10:30:00.000Z')
    // Njujork, prelaz na letnje: 05:30 je već UTC−4
    expect(zonedToUtc('2027-03-14', '05:30', 'America/New_York')).toBe('2027-03-14T09:30:00.000Z')
    expect(wallClock(zonedToUtc('2027-03-14', '02:30', 'America/New_York'), 'America/New_York').time).toBe(
      '03:30',
    )
  })

  it('zone sa pomakom od pola sata i preko datumske granice', () => {
    expect(zonedToUtc('2026-12-01', '09:00', 'Asia/Kolkata')).toBe('2026-12-01T03:30:00.000Z')
    expect(zonedToUtc('2026-12-01', '00:30', 'Asia/Tokyo')).toBe('2026-11-30T15:30:00.000Z')
  })
})

describe('shiftToZone (K7)', () => {
  it('10:00 u Beogradu postaje 10:00 u Njujorku, i u nedeljama kad se prelazi ne poklapaju', () => {
    expect(shiftToZone('2026-11-02T09:00:00.000Z', 'Europe/Belgrade', 'America/New_York')).toBe(
      '2026-11-02T15:00:00.000Z',
    )
    // 20.3.2027: Njujork je već na letnjem (UTC−4), Beograd još na zimskom (UTC+1)
    expect(shiftToZone('2027-03-20T09:00:00.000Z', 'Europe/Belgrade', 'America/New_York')).toBe(
      '2027-03-20T14:00:00.000Z',
    )
  })

  it('zadržava lokalni datum i posle ponoći, i vraća se na isto', () => {
    expect(wallClock('2026-11-02T23:30:00.000Z', 'Europe/Belgrade')).toEqual({
      date: '2026-11-03',
      time: '00:30',
    })
    expect(shiftToZone('2026-11-02T23:30:00.000Z', 'Europe/Belgrade', 'Asia/Tokyo')).toBe(
      '2026-11-02T15:30:00.000Z',
    )
    const there = shiftToZone('2026-12-10T08:15:00.000Z', 'Europe/Belgrade', 'America/Los_Angeles')
    expect(shiftToZone(there, 'America/Los_Angeles', 'Europe/Belgrade')).toBe('2026-12-10T08:15:00.000Z')
  })
})
