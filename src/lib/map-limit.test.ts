import { describe, expect, it } from 'vitest'

import { mapLimit } from './map-limit'

describe('mapLimit', () => {
  it('vraća rezultate redom kao ulaz i ne pušta više od limita u isto vreme', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([30, 5, 20, 1, 10, 2], 3, async (ms, i) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, ms))
      running--
      return i * 10
    })
    expect(out).toEqual([0, 10, 20, 30, 40, 50])
    expect(peak).toBe(3)
  })

  it('prazan ulaz daje prazan izlaz', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([])
  })
})
