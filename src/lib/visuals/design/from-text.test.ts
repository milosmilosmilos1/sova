import { describe, expect, it } from 'vitest'

import { slidesFromText } from './from-text'

const parts = {
  hook: 'Klima koja radi celo leto',
  body: 'Servis pre sezone sprečava kvar. Filter se čisti svake godine. Proverite i freon. Majstor dolazi za 48 sati. #klima #servis',
  cta: 'Zakažite servis porukom.',
}

describe('slajdovi od teksta objave (D-125)', () => {
  it('objava i priča: jedan naslovni slajd sa uvodom i prvom rečenicom teksta', () => {
    expect(slidesFromText(parts, 'single')).toEqual([
      { kind: 'cover', title: 'Klima koja radi celo leto', body: 'Servis pre sezone sprečava kvar.' },
    ])
    expect(slidesFromText(parts, 'story')).toHaveLength(1)
  })

  it('karusel: naslovni slajd, tačke iz teksta bez heštegova i poziv na akciju', () => {
    const slides = slidesFromText(parts, 'carousel')
    expect(slides.map((s) => s.kind)).toEqual(['cover', 'point', 'point', 'cta'])
    expect(slides[1]).toEqual({
      kind: 'point',
      title: 'Servis pre sezone sprečava kvar.',
      body: 'Filter se čisti svake godine.',
    })
    expect(slides[3]!.title).toBe('Zakažite servis porukom.')
    expect(JSON.stringify(slides)).not.toContain('#klima')
  })

  it('dug uvod se skraćuje na kraju reči; bez uvoda naslov je prva rečenica', () => {
    const long = slidesFromText({ ...parts, hook: 'reč '.repeat(40) }, 'single')[0]!
    expect(long.title.length).toBeLessThanOrEqual(90)
    expect(long.title.endsWith('…')).toBe(true)
    const noHook = slidesFromText({ ...parts, hook: '' }, 'single')[0]!
    expect(noHook.title).toBe('Servis pre sezone sprečava kvar.')
    expect(noHook.body).toBe('Filter se čisti svake godine.')
  })
})
