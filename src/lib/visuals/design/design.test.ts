import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { normalizeSlides } from '@/lib/ai/prompts/carousel'

import { configureFontLoader } from '../fonts'
import { catalogProblems, cleanSlideText, getStyle, STYLE_IDS, wantsPhoto } from './index'
import { contrast, fit, listItems, readable, statValue } from './kit'
import { preparePhoto, renderSlide } from './render'
import type { DesignFormat, Slide } from './types'

const colors = {
  primary: '#F26B1D',
  secondary: '#2B59C3',
  background: '#FFFFFF',
  text: '#101116',
  muted: '#5C5C68',
}
const slides: Slide[] = [
  {
    kind: 'cover',
    kicker: 'Vodič',
    title: 'Tri promene koje pretvaraju pažnju u poverenje',
    body: 'Kratak vodič za male biznise.',
  },
  {
    kind: 'point',
    title: 'Jedna jasna poruka po objavi',
    body: 'Kad objava kaže jednu stvar, ljudi je zapamte. Sve ostalo izbacite.',
    stat: '73 %',
  },
  { kind: 'cta', title: 'Želite plan za vaš brend?', body: 'Pišite nam u poruke.' },
]

let photo: string
beforeAll(async () => {
  configureFontLoader({ remote: false })
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 60, g: 90, b: 70 } },
  })
    .jpeg()
    .toBuffer()
  photo = await preparePhoto(bytes, getStyle('poster'), colors)
})

async function render(styleId: string, slide: Slide, format: DesignFormat, index: number) {
  return renderSlide({
    styleId,
    slide,
    format,
    colors,
    brandFonts: { headings: 'Inter', body: 'Inter' },
    brandName: 'TangerineSEO',
    handle: '@tangerineseo',
    logo: null,
    photo: wantsPhoto(getStyle(styleId), slide.kind, index) ? photo : null,
    index,
    total: 5,
    outputWidth: 216,
  })
}

describe('stilovi objava (D-108)', () => {
  it('katalog i stilovi se poklapaju', () => {
    expect(catalogProblems()).toEqual([])
    expect(STYLE_IDS).toHaveLength(22)
  })

  it('svaki stil crta naslovni slajd, slajd sadržaja i poziv na akciju (4:5)', async () => {
    for (const id of STYLE_IDS) {
      for (let i = 0; i < slides.length; i++) {
        const r = await render(id, slides[i]!, 'portrait', i === 2 ? 4 : i)
        const meta = await sharp(r.bytes).metadata()
        expect(meta.format, `${id} ${slides[i]!.kind}`).toBe('jpeg')
        expect([meta.width, meta.height], `${id} ${slides[i]!.kind}`).toEqual([216, 270])
      }
    }
  }, 120_000)

  it('priča je 9:16, kvadrat 1:1, i bez fotografije stil sa fotografijom ne puca', async () => {
    for (const id of ['poster', 'editorial', 'film', 'headline']) {
      const story = await sharp((await render(id, slides[0]!, 'story', 0)).bytes).metadata()
      expect([story.width, story.height]).toEqual([216, 384])
      const square = await sharp((await render(id, slides[1]!, 'square', 1)).bytes).metadata()
      expect([square.width, square.height]).toEqual([216, 216])
    }
    const bare = await renderSlide({
      styleId: 'cover',
      slide: slides[0]!,
      format: 'portrait',
      colors,
      brandFonts: { headings: 'Inter', body: 'Inter' },
      brandName: 'Brend',
      handle: null,
      logo: null,
      photo: null,
      index: 0,
      total: 1,
      outputWidth: 216,
    })
    expect(bare.bytes.length).toBeGreaterThan(1000)
  }, 60_000)

  it('tekst je čitljiv na svakoj podlozi', () => {
    for (const bg of ['#F26B1D', '#FFE600', '#0B1E3F', '#7C3AED', '#FFFFFF', '#22C55E', '#808080'])
      expect(contrast(bg, readable(bg)), bg).toBeGreaterThanOrEqual(4.5)
    expect(readable('#FFFFFF', '#101116')).toBe('#101116')
  })

  it('duži naslov dobija manja slova, nikad ispod minimuma', () => {
    const opts = { max: 120, min: 40, width: 900, height: 500 }
    const short = fit('Kratko', opts)
    const long = fit('Ovo je mnogo duži naslov koji mora da stane u tri ili četiri reda na slajdu', opts)
    expect(short).toBeGreaterThan(long)
    expect(fit('x '.repeat(400), opts)).toBe(40)
  })

  it('emoji se brišu iz slajda, stavke i istaknut broj se izvlače iz teksta', () => {
    expect(
      cleanSlideText({ kind: 'cover', title: 'Leto je stiglo ☀️🔥', body: 'Hladno 🧊 piće' }),
    ).toMatchObject({
      title: 'Leto je stiglo',
      body: 'Hladno piće',
    })
    expect(listItems({ kind: 'point', title: 'x', body: 'Prvo ovo. Zatim ono! Na kraju treće?' })).toEqual([
      'Prvo ovo.',
      'Zatim ono!',
      'Na kraju treće?',
    ])
    expect(statValue({ kind: 'point', title: 'Za 48 h odgovaramo' })).toBe('48 h')
    expect(statValue({ kind: 'point', title: 'Bez broja' })).toBeNull()
  })

  it('slajdovi iz odgovora modela: prvi naslovni, poslednji poziv, „AI bira” sa jednim slajdom je objava', () => {
    const raw = ['a', 'b', 'c', 'd'].map((t) => ({
      kind: 'point' as const,
      kicker: null,
      title: t,
      body: null,
      stat: null,
      items: null,
    }))
    const carousel = normalizeSlides(raw, 4, 'carousel')
    expect(carousel.map((s) => s.kind)).toEqual(['cover', 'point', 'point', 'cta'])
    expect(normalizeSlides(raw, 3, 'carousel')).toHaveLength(3)
    expect(normalizeSlides(raw.slice(0, 1), 5, 'auto').map((s) => s.kind)).toEqual(['cover'])
    expect(normalizeSlides(raw, 1, 'single')).toHaveLength(1)
  })
})
