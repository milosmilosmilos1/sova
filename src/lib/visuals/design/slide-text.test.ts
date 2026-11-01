import { describe, expect, it } from 'vitest'

import { changedChunks, changedRanges, changedSlides, withSlideText } from './slide-text'
import type { Slide } from './types'

describe('tekst na slikama', () => {
  const slides: Slide[] = [
    { kind: 'cover', kicker: 'Vodič', title: 'Noć u Beogradu ', body: 'Vodič za vikend.' },
    { kind: 'point', title: 'Rezervišite ranije', body: 'Petkom je gužva.', items: ['Sto', 'Piće'] },
    { kind: 'cta', title: 'Pišite nam', body: null },
  ]

  it('vrsta slajda ostaje, prazno polje briše deo, a naslov ne nestaje', () => {
    expect(
      withSlideText(slides[1]!, {
        title: '  Novi   naslov ',
        body: '',
        kicker: ' ',
        items: ['Sto', ' ', 'Muzika'],
      }),
    ).toEqual({
      kind: 'point',
      kicker: null,
      title: 'Novi naslov',
      body: null,
      stat: null,
      items: ['Sto', 'Muzika'],
    })
    expect(withSlideText(slides[0]!, { title: '   ' }).title).toBe('Noć u Beogradu ')
  })

  it('tekst slajda čuva prelome redova, bez praznih redova i razmaka viška', () => {
    expect(withSlideText(slides[0]!, { title: 'X', body: 'Prvi  red\r\n\n  drugi red ' }).body).toBe(
      'Prvi red\ndrugi red',
    )
  })

  it('izmenjeni su samo slajdovi sa drugim tekstom; razmak viška iz generisanja se ne računa', () => {
    const same = slides.map((s) => withSlideText(s, s))
    expect(changedSlides(slides, same)).toEqual([])
    const edited = [...same]
    edited[2] = withSlideText(slides[2]!, { title: 'Rezervišite sto' })
    expect(changedSlides(slides, edited)).toEqual([2])
  })

  it('uzastopni izmenjeni slajdovi idu u isti deo', () => {
    expect(changedRanges([5, 0, 1, 2, 7, 1])).toEqual([
      [0, 3],
      [5, 6],
      [7, 8],
    ])
    expect(changedRanges([])).toEqual([])
  })

  it('dugačak niz izmenjenih slajdova se deli na delove od po tri', () => {
    expect(changedChunks([0, 1, 2, 3, 4, 7])).toEqual([
      [0, 3],
      [3, 5],
      [7, 8],
    ])
  })

  it('sloj videa se crta po jedan: svaki izmenjen kadar je svoj deo', () => {
    expect(changedChunks([0, 1, 2, 4], 1)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 5],
    ])
  })
})
