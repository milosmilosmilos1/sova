import { describe, expect, it } from 'vitest'

import { autoTimeFor, draftsPerWeek, nextRunAt } from './schedule'

describe('raspored toka (D-108)', () => {
  const tz = 'Europe/Belgrade'

  it('sledeći dan iz izbora, u zadato vreme po zoni brenda', () => {
    // četvrtak 29.10.2026 u 12:00 po Beogradu (11:00 UTC posle prelaza na zimsko vreme 25.10.)
    const after = new Date('2026-10-29T11:00:00Z')
    // ponedeljak, sreda, petak u 20:00 → petak 30.10. u 20:00 = 19:00 UTC
    expect(nextRunAt({ days: [1, 3, 5], timeLocal: '20:00', timeZone: tz, after })).toBe(
      '2026-10-30T19:00:00.000Z',
    )
    // isti dan, ako vreme još nije prošlo
    expect(nextRunAt({ days: [4], timeLocal: '18:30', timeZone: tz, after })).toBe('2026-10-29T17:30:00.000Z')
    // isti dan kad je vreme prošlo: sledeće nedelje
    expect(nextRunAt({ days: [4], timeLocal: '08:00', timeZone: tz, after })).toBe('2026-11-05T07:00:00.000Z')
  })

  it('poštuje letnje vreme pre prelaza i drugu zonu', () => {
    const after = new Date('2026-10-20T06:00:00Z') // utorak
    expect(nextRunAt({ days: [3], timeLocal: '10:00', timeZone: tz, after })).toBe('2026-10-21T08:00:00.000Z')
    expect(nextRunAt({ days: [3], timeLocal: '10:00', timeZone: 'America/New_York', after })).toBe(
      '2026-10-21T14:00:00.000Z',
    )
  })

  it('bez dana nema termina; broj nacrta nedeljno je broj različitih dana', () => {
    expect(nextRunAt({ days: [], timeLocal: '10:00', timeZone: tz, after: new Date() })).toBeNull()
    expect(draftsPerWeek([1, 3, 5, 5])).toBe(3)
  })

  it('„Sova bira vreme”: stabilan termin između 07:00 i 21:45, na četvrt sata', () => {
    const ids = ['9b1f2c4e-1111-4b8a-9d5e-000000000001', '0d7e5a33-2222-4c1b-8f2a-000000000002', 'flow-x']
    for (const id of ids) {
      const t = autoTimeFor(id)
      expect(t).toBe(autoTimeFor(id))
      const [h, m] = t.split(':').map(Number)
      expect(h! * 60 + m!).toBeGreaterThanOrEqual(7 * 60)
      expect(h! * 60 + m!).toBeLessThanOrEqual(21 * 60 + 45)
      expect(m! % 15).toBe(0)
    }
  })
})
