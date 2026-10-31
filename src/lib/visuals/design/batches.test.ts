import { describe, expect, it } from 'vitest'

import { photoOrder, slideRanges, SLIDES_PER_STEP } from './batches'

describe('slajdovi u delovima (D-122)', () => {
  it('deli slajdove na delove od najviše tri, redom i bez preklapanja', () => {
    expect(SLIDES_PER_STEP).toBe(3)
    expect(slideRanges(1)).toEqual([[0, 1]])
    expect(slideRanges(5)).toEqual([
      [0, 3],
      [3, 5],
    ])
    expect(slideRanges(10)).toEqual([
      [0, 3],
      [3, 6],
      [6, 9],
      [9, 10],
    ])
    expect(slideRanges(0)).toEqual([])
    expect(slideRanges(4, 2)).toEqual([
      [0, 2],
      [2, 4],
    ])
  })

  it('svaki slajd sa fotografijom dobija sledeću; kad ih ponestane, slajd ostaje u bojama', () => {
    expect(photoOrder([true, true, true, true, true], 5, false)).toEqual([0, 1, 2, 3, 4])
    expect(photoOrder([true, true, true, true, true], 3, false)).toEqual([0, 1, 2, null, null])
    // naslovni stil: fotografija samo na prvom slajdu
    expect(photoOrder([true, false, false, false], 1, false)).toEqual([0, null, null, null])
    expect(photoOrder([true, true, true], 0, false)).toEqual([null, null, null])
  })

  it('fotografije koje je dao korisnik idu ukrug', () => {
    expect(photoOrder([true, true, true, true, true], 2, true)).toEqual([0, 1, 0, 1, 0])
    expect(photoOrder([false, true, true], 1, true)).toEqual([null, 0, 0])
  })
})
