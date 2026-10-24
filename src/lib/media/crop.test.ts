import { describe, expect, it } from 'vitest'

import { aspectFits, aspectLabel, commonAspectRange, cropRect, cropTarget } from './crop'

describe('odnos stranica (N9)', () => {
  it('toleriše zaokruživanje od 0,01 kao provera objave', () => {
    expect(aspectFits(0.795, { min: 0.8, max: 1.91 })).toBe(true)
    expect(aspectFits(0.78, { min: 0.8, max: 1.91 })).toBe(false)
    expect(aspectFits(1.92, { min: 0.8, max: 1.91 })).toBe(true)
  })

  it('presek opsega izabranih mreža', () => {
    expect(
      commonAspectRange([
        { min: 0.8, max: 1.91 },
        { min: 0.5, max: 2 },
      ]),
    ).toEqual({ min: 0.8, max: 1.91 })
    // YouTube Shorts 9:16 i Instagram 4:5 nemaju zajednički odnos
    expect(
      commonAspectRange([
        { min: 0.8, max: 1.91 },
        { min: 0.5625, max: 0.5625 },
      ]),
    ).toBeNull()
    expect(commonAspectRange([])).toBeNull()
  })

  it('cilj je najbliži dozvoljen odnos', () => {
    expect(cropTarget(0.5625, { min: 0.8, max: 1.91 })).toBe(0.8)
    expect(cropTarget(2.5, { min: 0.8, max: 1.91 })).toBe(1.91)
    expect(cropTarget(1.2, { min: 0.8, max: 1.91 })).toBe(1.2)
  })

  it('isečak 9:16 → 4:5 seče visinu, položaj ga pomera', () => {
    expect(cropRect(1080, 1920, 0.8)).toEqual({ left: 0, top: 285, width: 1080, height: 1350 })
    expect(cropRect(1080, 1920, 0.8, 0)).toEqual({ left: 0, top: 0, width: 1080, height: 1350 })
    expect(cropRect(1080, 1920, 0.8, 1)).toEqual({ left: 0, top: 570, width: 1080, height: 1350 })
  })

  it('široka slika seče širinu i ostaje u granicama', () => {
    const r = cropRect(3000, 1000, 1.91, 0.5)
    expect(r).toEqual({ left: 545, top: 0, width: 1910, height: 1000 })
    expect(r.width / r.height).toBeCloseTo(1.91, 2)
    expect(cropRect(3000, 1000, 1.91, 7).left).toBe(1090)
  })

  it('natpis odnosa', () => {
    expect(aspectLabel(0.8)).toBe('4:5')
    expect(aspectLabel(1.91)).toBe('1,91:1')
    expect(aspectLabel(0.5625)).toBe('9:16')
    expect(aspectLabel(0.33)).toBe('1:3')
    expect(aspectLabel(1.25)).toBe('1,25:1')
  })
})
