import { describe, expect, it } from 'vitest'

import {
  boxCenter,
  centeredPosition,
  focusCrop,
  objectPosition,
  orientationOf,
  parseBox,
  parseFocus,
  subjectFits,
} from './focus'

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

describe('oblik fotografije prema okviru slajda (D-169)', () => {
  it('oblik po razmeri okvira', () => {
    expect(orientationOf(2.31)).toBe('landscape')
    expect(orientationOf(1.21)).toBe('landscape')
    expect(orientationOf(1)).toBe('squarish')
    expect(orientationOf(0.89)).toBe('squarish')
    expect(orientationOf(0.8)).toBe('portrait')
    expect(orientationOf(0.56)).toBe('portrait')
  })

  it('okvir predmeta: ispravan, ograničen na sliku; obrnut ili nepotpun je null', () => {
    expect(parseBox({ left: 0.1, top: 0.2, right: 0.6, bottom: 0.9 })).toEqual({
      left: 0.1,
      top: 0.2,
      right: 0.6,
      bottom: 0.9,
    })
    expect(parseBox({ left: -1, top: 0, right: 2, bottom: 1 })).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    })
    expect(parseBox({ left: 0.6, top: 0, right: 0.2, bottom: 1 })).toBeNull()
    expect(parseBox({ left: 0.1, top: 0.2 })).toBeNull()
    const center = boxCenter({ left: 0.2, top: 0.4, right: 0.6, bottom: 0.8 })
    expect(center.x).toBeCloseTo(0.4, 9)
    expect(center.y).toBeCloseTo(0.6, 9)
  })

  it('predmet staje u traku 2,3:1 iz vodoravne fotografije samo kad nije previsok', () => {
    const photo = { width: 3000, height: 2000 }
    // pas koji leži, u sredini: staje
    expect(subjectFits(photo, { left: 0.2, top: 0.35, right: 0.8, bottom: 0.7 }, 2.31)).toBe(true)
    // pas koji stoji preko cele visine: traka bi mu odsekla glavu ili noge
    expect(subjectFits(photo, { left: 0.3, top: 0, right: 0.6, bottom: 1 }, 2.31)).toBe(false)
    // isti pas u uspravnom okviru 0,8 staje
    expect(subjectFits(photo, { left: 0.3, top: 0, right: 0.6, bottom: 1 }, 0.8)).toBe(true)
    // malo više od trake (vrh uha) je u redu, a dosta više nije
    expect(subjectFits(photo, { left: 0.2, top: 0.18, right: 0.8, bottom: 0.84 }, 2.31)).toBe(true)
    expect(subjectFits(photo, { left: 0.2, top: 0.1, right: 0.8, bottom: 0.84 }, 2.31)).toBe(false)
  })

  it('predmet se centrira u okviru, a isečak ne izlazi van slike', () => {
    // vodoravna 1,5 u traci 2,31: seče se visina; predmet na 60% visine dolazi u sredinu trake
    expect(centeredPosition({ x: 0.5, y: 0.6 }, 1.5, 2.31)).toBe('50% 78.5%')
    // predmet uz gornju ivicu: traka staje uz vrh
    expect(centeredPosition({ x: 0.5, y: 0.05 }, 1.5, 2.31)).toBe('50% 0%')
    // kvadrat u uspravnom okviru 0,8: seče se širina
    expect(centeredPosition({ x: 0.8, y: 0.5 }, 1, 0.8)).toBe('100% 50%')
    expect(centeredPosition({ x: 0.5, y: 0.5 }, 1, 0.8)).toBe('50% 50%')
    // ista razmera: nema isecanja
    expect(centeredPosition({ x: 0.9, y: 0.1 }, 1.5, 1.5)).toBe('50% 50%')
  })

  it('predmet malo viši od trake zadržava vrh (glavu i uši), a seče se dole', () => {
    const dog = { left: 0.24, top: 0.32, right: 0.8, bottom: 0.999 }
    // traka vidi 65% visine, pas je visok 68%: traka počinje malo iznad ušiju
    expect(centeredPosition({ x: 0.52, y: 0.66 }, 1.5, 2.31, dog)).toBe('50% 85.6%')
    // bez okvira bi se centrirala sredina psa i uši bi bile odsečene
    expect(centeredPosition({ x: 0.52, y: 0.66 }, 1.5, 2.31)).toBe('50% 95.6%')
    // predmet koji staje se i dalje centrira
    expect(
      centeredPosition({ x: 0.5, y: 0.6 }, 1.5, 2.31, { left: 0.3, top: 0.45, right: 0.7, bottom: 0.75 }),
    ).toBe('50% 78.5%')
  })
})
