import { describe, expect, it } from 'vitest'

import { parsePostDesign } from './post-design'

/** Kontekst dizajnirane objave iz baze (D-111, D-116). */
const base = {
  topic: 'Letnji servis klima',
  cta: null,
  format: 'carousel',
  styleId: 'headline',
  slides: 2,
  photoSource: 'stock',
  size: 'portrait',
  locale: 'sr-Latn',
  platforms: ['instagram'],
}

describe('parsePostDesign', () => {
  it('čita kontekst sa tekstom slajdova i fotografijama', () => {
    const photo = '6f1f2a1e-1c55-4d8e-9a3b-2a8c9f0e7b11'
    const out = parsePostDesign({
      ...base,
      copy: {
        slides: [
          { kind: 'cover', kicker: null, title: 'Leto bez znoja', body: null },
          { kind: 'cta', title: 'Zakažite servis', body: 'Pišite nam.' },
        ],
        photoAssetIds: [photo],
      },
    })
    expect(out!.copy!.slides[1]!.title).toBe('Zakažite servis')
    expect(out!.copy!.photoAssetIds).toEqual([photo])
  })

  it('neispravan tekst slajdova ne obara ostatak konteksta, a stari kontekst bez njega važi', () => {
    const broken = parsePostDesign({ ...base, copy: { slides: [{ kind: 'naslov' }] } })
    expect(broken).toMatchObject({ topic: 'Letnji servis klima', styleId: 'headline' })
    expect(broken!.copy).toBeUndefined()
    expect(parsePostDesign(base)!.copy).toBeUndefined()
    expect(parsePostDesign({ ...base, styleId: 'nepostojeci' })).toBeNull()
    expect(parsePostDesign(null)).toBeNull()
  })
})
