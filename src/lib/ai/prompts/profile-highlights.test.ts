import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { highlightCoverSvg, renderHighlightCover } from '@/lib/visuals/highlight-cover'

import {
  buildHighlightsPrompt,
  HIGHLIGHT_ICONS,
  HIGHLIGHT_LIMITS,
  normalizeHighlights,
} from './profile-highlights'

describe('Instagram highlights (D-144)', () => {
  it('naslov do 15 znakova, 2 do 5 kadrova, bez praznih i ponovljenih highlights-a', () => {
    const frame = { title: 'Adaptacija od projekta do ključa', body: 'Jedan koordinator vodi ceo posao.' }
    const out = normalizeHighlights({
      highlights: [
        {
          title: 'Usluge i cene za stanove',
          icon: 'services',
          visual_query: ' apartment renovation ',
          frames: Array(7).fill(frame),
        },
        // isti naslov kao prvi posle skraćivanja, drugačija veličina slova
        { title: 'usluge i cene', icon: 'prices', visual_query: 'x', frames: [frame] },
        { title: 'Prazno', icon: 'faq', visual_query: 'x', frames: [{ title: ' ', body: 'bez naslova' }] },
        { title: 'Kontakt', icon: 'contact', visual_query: 'phone call', frames: [frame, frame] },
      ],
    })
    expect(out.map((h) => h.title)).toEqual(['Usluge i cene', 'Kontakt'])
    expect(Array.from(out[0]!.title).length).toBeLessThanOrEqual(HIGHLIGHT_LIMITS.title)
    expect(out[0]!.frames).toHaveLength(HIGHLIGHT_LIMITS.frames)
    expect(out[0]!.visual_query).toBe('apartment renovation')
    const many = normalizeHighlights({
      highlights: Array.from({ length: 9 }, (_, i) => ({
        title: `H${i}`,
        icon: 'tips' as const,
        visual_query: '',
        frames: [frame],
      })),
    })
    expect(many).toHaveLength(HIGHLIGHT_LIMITS.count)
  })

  it('prompt nudi samo poznate ikonice i ne traži utiske kojih nema u podacima', () => {
    const p = buildHighlightsPrompt({
      brandName: 'Adaptiko',
      locale: 'sr-Latn',
      website: null,
      emoji: false,
      address: 'vi',
      profile: ['Opis: adaptacija stanova'],
    })
    expect(p).toContain('services, prices, reviews')
    expect(p).toContain('Utisci kupaca samo ako postoje u podacima')
    expect(p).toContain('Emoji: bez emoji-ja.')
    expect(p).not.toContain(', sajt)')
  })

  it('naslovna je kadar 1080×1920 u boji brenda, sa ikonicom čitljive boje u sredini', async () => {
    const svg = highlightCoverSvg({ icon: 'contact', primary: '#0F766E' })
    expect(svg).toContain('stop-color="#0F766E"')
    // tamna boja brenda dobija belu ikonicu, svetla tamnu
    expect(svg).toContain('stroke="#ffffff"')
    expect(highlightCoverSvg({ icon: 'contact', primary: '#FFD43B' })).toContain('stroke="#111111"')
    expect(svg).toMatch(/<path /)
    // tačkice koje lucide puni bojom ikonice (`currentColor`) dobijaju istu boju kao potez
    expect(highlightCoverSvg({ icon: 'prices', primary: '#0F766E' })).toContain('color="#ffffff"')
    for (const icon of HIGHLIGHT_ICONS)
      expect(highlightCoverSvg({ icon, primary: '#0F766E' }), icon).toMatch(/<(path|circle|rect) /)
    const png = await renderHighlightCover({ icon: 'reviews', primary: '#990000' })
    const meta = await sharp(png).metadata()
    expect(meta).toMatchObject({ width: 1080, height: 1920, format: 'png' })
  })
})
