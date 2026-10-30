import { describe, expect, it } from 'vitest'

import { fitRect, videoPlan, VIDEO_FPS } from './slides-video'

/** Video iz karusela (D-118): raspored slike u kadru i broj kadrova. */
describe('video iz slajdova', () => {
  it('slajd 4:5 u uspravnom kadru staje po širini, a pozadina pokriva ceo kadar', () => {
    expect(fitRect(1080, 1350, 1080, 1920, 'contain')).toEqual({ x: 0, y: 285, w: 1080, h: 1350 })
    const cover = fitRect(1080, 1350, 1080, 1920, 'cover')
    expect(cover.h).toBe(1920)
    expect(cover.w).toBeCloseTo(1536)
    const zoomed = fitRect(1080, 1350, 1080, 1350, 'contain', 1.03)
    expect(zoomed.x).toBeCloseTo(-16.2)
  })

  it('kadrovi po slajdu, pretapanje samo između slajdova i trajanje', () => {
    expect(videoPlan(5, 3, true)).toEqual({ perSlide: 90, fadeFrames: 12, totalFrames: 450, seconds: 15 })
    expect(videoPlan(1, 3, true).fadeFrames).toBe(0)
    expect(videoPlan(4, 2, false)).toMatchObject({ fadeFrames: 0, totalFrames: 4 * 2 * VIDEO_FPS })
  })
})
