import { describe, expect, it } from 'vitest'

import { clipTime, enterAt } from './theme-video'

describe('video u temi u pregledaču', () => {
  it('tekst ulazi za 0,4 s: od nevidljivog i nižeg do punog na mestu', () => {
    expect(enterAt(0, 30)).toEqual({ share: 0, offset: 48 })
    expect(enterAt(12, 30)).toEqual({ share: 1, offset: 0 })
    const mid = enterAt(6, 30)
    expect(mid.share).toBeGreaterThan(0.5)
    expect(mid.offset).toBeLessThan(24)
  })

  it('snimak kraći od kadrova ide ukrug, a kadar nastavlja od svog početka', () => {
    expect(clipTime(3, 0, 30, 10)).toBe(3)
    expect(clipTime(3, 30, 30, 10)).toBe(4)
    expect(clipTime(9, 60, 30, 10)).toBeCloseTo(1)
    expect(clipTime(2, 15, 30, 0)).toBe(0)
  })
})
