import { describe, expect, it } from 'vitest'

import { focusCrop, objectPosition, parseFocus } from './focus'

describe('glavni predmet fotografije (D-167)', () => {
  it('fokus iz baze ili modela: brojevi od 0 do 1, ostalo je null', () => {
    expect(parseFocus({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 })
    expect(parseFocus({ x: -1, y: 3 })).toEqual({ x: 0, y: 1 })
    expect(parseFocus({ x: '0.5', y: 0.5 })).toBeNull()
    expect(parseFocus({ x: Number.NaN, y: 0.5 })).toBeNull()
    expect(parseFocus(null)).toBeNull()
    expect(parseFocus('0.5,0.5')).toBeNull()
  })

  it('kvadrat iz vodoravne fotografije ide oko predmeta, a ne izlazi van slike', () => {
    // predmet u sredini: isečak po sredini, predmet u sredini isečka
    const center = focusCrop(4000, 2667, 1, { x: 0.5, y: 0.5 })
    expect(center).toMatchObject({ top: 0, width: 2667, height: 2667 })
    expect(center.left).toBeCloseTo(667, 0)
    expect(center.focus.x).toBeCloseTo(0.5, 2)

    // pas desno od sredine: isečak ide desno, pas ostaje u sredini isečka
    const right = focusCrop(4000, 2667, 1, { x: 0.6, y: 0.5 })
    expect(right.left).toBe(Math.round(2400 - 2667 / 2))
    expect(right.focus.x).toBeCloseTo(0.5, 2)

    // pas skroz desno: isečak staje uz desnu ivicu, pas je u isečku desno od sredine
    const far = focusCrop(4000, 2667, 1, { x: 0.7, y: 0.5 })
    expect(far.left).toBe(4000 - 2667)
    expect(far.focus.x).toBeCloseTo((2800 - 1333) / 2667, 3)

    // predmet uz levu ivicu: isečak počinje od ivice, predmet je u isečku levo
    const edge = focusCrop(4000, 2667, 1, { x: 0.05, y: 0.5 })
    expect(edge.left).toBe(0)
    expect(edge.focus.x).toBeCloseTo(200 / 2667, 3)
  })

  it('isečak 9:16 za priču iz vodoravne fotografije', () => {
    const story = focusCrop(4000, 2667, 9 / 16, { x: 0.75, y: 0.4 })
    expect(story.height).toBe(2667)
    expect(story.width).toBe(Math.round(2667 * (9 / 16)))
    expect(story.left + story.width).toBeLessThanOrEqual(4000)
    expect(story.focus.x).toBeCloseTo(0.5, 2)
    expect(story.focus.y).toBeCloseTo(0.4, 2)
  })

  it('kvadrat iz uspravne fotografije seče po visini', () => {
    const tall = focusCrop(1000, 3000, 1, { x: 0.5, y: 0.1 })
    expect(tall).toMatchObject({ left: 0, top: 0, width: 1000, height: 1000 })
    expect(tall.focus.y).toBeCloseTo(0.3, 2)
  })

  it('object-position u procentima', () => {
    expect(objectPosition({ x: 0.25, y: 1 / 3 })).toBe('25% 33.3%')
    expect(objectPosition({ x: 0, y: 1 })).toBe('0% 100%')
  })
})
