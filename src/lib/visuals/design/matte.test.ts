import { describe, expect, it } from 'vitest'

import { matteFromKeys } from './matte'

/** Piksel sloja preko fotografije: sloj boje `color` sa providnošću `alpha` preko podloge `under`. */
const over = (color: number[], alpha: number, under: number) =>
  color.map((c) => Math.round(c * alpha + under * (1 - alpha))).concat(255)

describe('matteFromKeys', () => {
  it('neprovidan deo ostaje kakav jeste, a mesto fotografije postaje providno', () => {
    const onBlack = new Uint8Array([...over([200, 40, 90], 1, 0), ...over([0, 0, 0], 0, 0)])
    const onWhite = new Uint8Array([...over([200, 40, 90], 1, 255), ...over([0, 0, 0], 0, 255)])
    expect([...matteFromKeys(onBlack, onWhite)]).toEqual([200, 40, 90, 255, 0, 0, 0, 0])
  })

  it('preliv preko fotografije dobija svoju providnost i boju', () => {
    const onBlack = new Uint8Array(over([20, 20, 30], 0.6, 0))
    const onWhite = new Uint8Array(over([20, 20, 30], 0.6, 255))
    const [r, g, b, a] = matteFromKeys(onBlack, onWhite)
    expect(a).toBe(153)
    expect(Math.abs(r! - 20)).toBeLessThanOrEqual(1)
    expect(Math.abs(g! - 20)).toBeLessThanOrEqual(1)
    expect(Math.abs(b! - 30)).toBeLessThanOrEqual(1)
  })
})
