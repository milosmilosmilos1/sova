import { describe, expect, it } from 'vitest'

import { drawnFields, formFields } from './fields'
import type { Slide } from './types'

describe('polja koja stil crta', () => {
  const point: Slide = {
    kind: 'point',
    title: 'Sredite Google profil',
    body: 'Tačna adresa i radno vreme.',
    items: ['Adresa', 'Telefon'],
  }
  const at = (styleId: string, slide: Slide, photo = true) =>
    drawnFields({ styleId, slide, format: 'portrait', index: 1, total: 5, photo })

  it('Poster ne crta nabrajanje, a Lista ga crta', () => {
    expect(at('poster', point)).not.toContain('items')
    expect(at('list', point, false)).toContain('items')
    expect(at('poster', point)).toContain('body')
  })

  it('prazno polje se proverava primerom: Statistika crta istaknut broj i kad ga slajd nema', () => {
    expect(at('stat', { kind: 'point', title: 'Više poziva' }, false)).toContain('stat')
  })

  it('obrazac: natpis na prvom slajdu ili kad postoji, broj i nabrajanje samo kad postoje', () => {
    const drawn = ['kicker', 'body', 'stat', 'items'] as const
    expect(formFields({ kind: 'cover', title: 'Naslov' }, 0, [...drawn])).toEqual(['kicker', 'body'])
    expect(formFields({ kind: 'point', title: 'Naslov' }, 2, [...drawn])).toEqual(['body'])
    expect(formFields(point, 1, ['body', 'items'])).toEqual(['body', 'items'])
    expect(formFields({ ...point, kicker: 'Korak 2' }, 1, ['kicker', 'body'])).toEqual(['kicker', 'body'])
  })
})
