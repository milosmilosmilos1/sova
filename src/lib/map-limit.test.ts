import { describe, expect, it } from 'vitest'

import { mapLimit, settleWithin } from './map-limit'

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

describe('settleWithin', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  it('greška jedne stavke ne zaustavlja ostale, a spiskovi su redom kao ulaz', async () => {
    const out = await settleWithin(['a', 'b', 'c', 'd'], 2, 10_000, async (id) => {
      await wait(id === 'a' ? 30 : 5)
      if (id === 'b') throw new Error('ne može')
    })
    expect(out.done).toEqual(['a', 'c', 'd'])
    expect(out.failed).toEqual([{ item: 'b', error: new Error('ne može') }])
    expect(out.rest).toEqual([])
  })

  it('stavka koja nije počela pre roka ostaje u rest', async () => {
    const started: string[] = []
    const out = await settleWithin(['a', 'b', 'c', 'd'], 1, 150, async (id) => {
      started.push(id)
      await wait(100)
    })
    // a počinje odmah, b posle 100 ms (pre roka), c tek posle 200 ms
    expect(started).toEqual(['a', 'b'])
    expect(out.done).toEqual(['a', 'b'])
    expect(out.rest).toEqual(['c', 'd'])
  })
})
