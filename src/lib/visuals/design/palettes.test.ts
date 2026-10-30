import { describe, expect, it } from 'vitest'

import { getStyle, wantsPhoto } from './index'
import { contrast } from './kit'
import { brandPalettes, VIVID_PALETTES } from './palettes'
import { planLook, seedFrom, VIVID_CYCLE } from './variety'

/** Šaren plan (D-121): palete su čitljive, a susedne objave se razlikuju po stilu i bojama. */
const brand = {
  primary: '#F26B1D',
  secondary: '#2B59C3',
  background: '#FFFFFF',
  text: '#101116',
  muted: '#5C5C68',
}

describe('šarene palete', () => {
  it('tekst je čitljiv na svakoj šarenoj podlozi i na paletama iz boje brenda', () => {
    for (const p of VIVID_PALETTES)
      expect(contrast(p.colors.text, p.colors.background), p.id).toBeGreaterThanOrEqual(4.5)
    for (const primary of ['#F26B1D', '#2563EB', '#808080', '#FFFFFF', '#111111', '#FFE600']) {
      const own = brandPalettes({ ...brand, primary })
      expect(own.map((p) => p.id)).toEqual(['brand', 'brand-deep', 'brand-tint'])
      for (const p of own)
        expect(contrast(p.colors.text, p.colors.background), `${primary} ${p.id}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('svaka objava u planu dobija drugi stil i drugu paletu od prethodne, a svi stilovi nose fotografiju', () => {
    const seed = seedFrom('7f1c2b9e-0000-4000-8000-000000000001')
    expect(seedFrom('7f1c2b9e-0000-4000-8000-000000000001')).toBe(seed)
    const looks = Array.from({ length: 24 }, (_, i) => planLook(i, seed, brand))
    for (let i = 1; i < looks.length; i++) {
      expect(looks[i]!.styleId, `mesto ${i}`).not.toBe(looks[i - 1]!.styleId)
      expect(looks[i]!.paletteId, `mesto ${i}`).not.toBe(looks[i - 1]!.paletteId)
    }
    expect(new Set(looks.map((l) => l.paletteId)).size).toBeGreaterThanOrEqual(10)
    const withPhoto = VIVID_CYCLE.filter((id) => wantsPhoto(getStyle(id), 'cover', 0))
    expect(withPhoto).toEqual(VIVID_CYCLE)
    // svaka treća objava je u bojama brenda
    expect(looks[0]!.paletteId.startsWith('brand')).toBe(true)
    expect(looks[1]!.paletteId.startsWith('brand')).toBe(false)
  })
})
