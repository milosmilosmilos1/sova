import { describe, expect, it } from 'vitest'

import { contrast } from '@/lib/visuals/design/kit'

import { brandLogoUrl, brandSwatch } from './swatch'

const IDS = [
  '0b6f3c2e-6f0a-4c56-9d0e-6a1f2b3c4d5e',
  '1c7a4d3f-7a1b-4d67-8e1f-7b2a3c4d5e6f',
  '2d8b5e4a-8b2c-4e78-9f2a-8c3b4d5e6f7a',
  '3e9c6f5b-9c3d-4f89-8a3b-9d4c5e6f7a8b',
  '4fad7a6c-ad4e-4a9a-9b4c-ae5d6f7a8b9c',
  '5abe8b7d-be5f-4bab-8c5d-bf6e7a8b9cad',
]

describe('boja brenda u aplikaciji (D-137)', () => {
  it('koristi boju brenda, a slovo je čitljivo na njoj', () => {
    expect(brandSwatch(IDS[0]!, '#990000')).toEqual({ color: '#990000', ink: '#ffffff', logo: null })
    expect(brandSwatch(IDS[0]!, '#ffd43b')).toEqual({ color: '#FFD43B', ink: '#111111', logo: null })
  })

  it('brend bez boje dobija rezervnu: uvek istu za isti brend, a brendovi se međusobno razlikuju', () => {
    expect(brandSwatch(IDS[0]!)).toEqual(brandSwatch(IDS[0]!, null))
    expect(brandSwatch(IDS[0]!, 'nije boja')).toEqual(brandSwatch(IDS[0]!))
    expect(new Set(IDS.map((id) => brandSwatch(id).color)).size).toBeGreaterThan(2)
    for (const id of IDS) {
      const s = brandSwatch(id)
      expect(s.color).toMatch(/^#[0-9A-F]{6}$/)
      expect(contrast(s.color, s.ink)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('ikonica logoa ide uz boju, a adresa nosi oznaku logoa (D-155)', () => {
    const url = brandLogoUrl(IDS[0]!, IDS[1]!)
    expect(url).toBe(`/api/brands/${IDS[0]}/logo?v=${IDS[1]!.slice(0, 8)}`)
    expect(brandSwatch(IDS[0]!, '#990000', url)).toEqual({ color: '#990000', ink: '#ffffff', logo: url })
  })
})
