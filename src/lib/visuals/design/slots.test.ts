import { describe, expect, it } from 'vitest'

import { el, img } from './kit'
import { findPhotoSlot, photoSlot } from './slots'

/** Okvir fotografije na slajdu (D-169): po njemu Sova bira oblik fotografije. */
const colors = {
  primary: '#F26B1D',
  secondary: '#2B59C3',
  background: '#FFFFFF',
  text: '#101116',
  muted: '#5C5C68',
}
const cover = { kind: 'cover' as const, title: 'Koliko poznaješ ishranu pasa?', body: 'Kviz', kicker: 'Kviz' }
const point = { kind: 'point' as const, title: 'Pitanje', body: 'Koliko dana traje prelazak?' }

describe('okvir fotografije na slajdu (D-169)', () => {
  it('„aurora”: široka traka na naslovnom slajdu, bez fotografije na ostalim', () => {
    const slot = photoSlot({
      styleId: 'aurora',
      slide: cover,
      format: 'portrait',
      colors,
      index: 0,
      total: 5,
    })
    expect(slot).toEqual({ width: 936, height: 405 })
    expect(slot!.width / slot!.height).toBeGreaterThan(2.3)
    expect(
      photoSlot({ styleId: 'aurora', slide: point, format: 'portrait', colors, index: 1, total: 5 }),
    ).toBeNull()
  })

  it('fotografija preko celog kadra ima oblik kadra; tipografski stil nema fotografiju', () => {
    expect(
      photoSlot({ styleId: 'magazine', slide: point, format: 'story', colors, index: 1, total: 5 }),
    ).toEqual({
      width: 1080,
      height: 1920,
    })
    expect(
      photoSlot({ styleId: 'headline', slide: cover, format: 'portrait', colors, index: 0, total: 5 }),
    ).toBeNull()
  })

  it('najveći okvir slike sa izvorom fotografije, i u ugnježdenom elementu', () => {
    const photo = 'data:image/png;base64,TEST'
    const tree = el('div', {}, [
      img('data:image/png;base64,LOGO', { width: '2000px', height: '2000px' }),
      img(photo, { width: '300px', height: '200px' }),
      el('div', {}, [img(photo, { width: '936px', height: '405px' })]),
      img(photo, { width: '100%', height: '100%' }),
    ])
    expect(findPhotoSlot(tree, photo)).toEqual({ width: 936, height: 405 })
    expect(findPhotoSlot(el('div', {}, []), photo)).toBeNull()
  })
})
