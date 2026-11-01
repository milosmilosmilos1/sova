import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { configureFontLoader } from '../fonts'
import { getStyle, STYLE_IDS, wantsPhoto } from './index'
import { contrast } from './kit'
import { CUSTOM_LOOK_STYLE, SITE_LOOK_STYLES, siteLooks, type SiteVisual } from './looks'
import { preparePhoto, renderSlide } from './render'
import type { DesignColors, DesignFormat, Slide, ThemeVariant } from './types'
import { THEME_RHYTHM, variantAt, variantColors, variantFor } from './variants'

/** Sajt kao tangerineseo.rs: crvena i narandžasta su boje brenda. */
const site: SiteVisual = {
  url: 'https://primer.rs/',
  at: '2026-11-01T10:00:00.000Z',
  source: 'site',
  primary: '#990000',
  secondary: '#F26B1D',
  accent: '#5CB85C',
  light: '#F3F2F2',
  dark: '#201E1D',
  headings: 'Inter',
  body: 'Inter',
}

const slides: Slide[] = [
  { kind: 'cover', kicker: 'Vodič', title: 'Tri promene koje grade poverenje', body: 'Kratak vodič.' },
  {
    kind: 'point',
    title: 'Jedna jasna poruka po objavi',
    body: 'Kad objava kaže jednu stvar, ljudi je zapamte.',
  },
  { kind: 'cta', title: 'Želite plan za vaš brend?', body: 'Pišite nam u poruke.' },
]

const THEME_STYLES = [...new Set([...Object.values(SITE_LOOK_STYLES), CUSTOM_LOOK_STYLE])]

let photo: string
beforeAll(async () => {
  configureFontLoader({ remote: false })
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 60, g: 90, b: 70 } },
  })
    .jpeg()
    .toBuffer()
  photo = await preparePhoto(bytes, getStyle('poster'), siteLooks(site)[0]!.colors)
})

function render(
  styleId: string,
  colors: DesignColors,
  index: number,
  variant: ThemeVariant,
  format: DesignFormat = 'portrait',
) {
  const slide = slides[Math.min(index, 2)]!
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
    variant,
    outputWidth: 216,
  })
}

describe('ritam teme (D-132)', () => {
  it('od šest objava za redom tri su osnovne, dve obrnute i jedna udarna, a udarne nisu jedna do druge', () => {
    const six = Array.from({ length: 6 }, (_, i) => variantAt(i))
    expect(six.filter((v) => v === 0)).toHaveLength(3)
    expect(six.filter((v) => v === 1)).toHaveLength(2)
    expect(six.filter((v) => v === 2)).toHaveLength(1)
    const long = Array.from({ length: 60 }, (_, i) => variantAt(i))
    for (let i = 1; i < long.length; i++) expect(long[i] === 2 && long[i - 1] === 2).toBe(false)
    expect(variantAt(6)).toBe(variantAt(0))
    expect(variantAt(-1)).toBe(THEME_RHYTHM[THEME_RHYTHM.length - 1])
  })

  it('ista oznaka uvek daje istu varijantu, a mnogo oznaka pokriva sve tri', () => {
    expect(variantFor('7f3c1e20-0000-4000-8000-000000000001')).toBe(
      variantFor('7f3c1e20-0000-4000-8000-000000000001'),
    )
    const seen = new Set(Array.from({ length: 200 }, (_, i) => variantFor(`objava-${i}`)))
    expect([...seen].sort()).toEqual([0, 1, 2])
  })

  it('osnovna ostaje ista, obrnuta menja samo naglaske, udarna stavlja boju brenda u podlogu sa čitljivim tekstom', () => {
    for (const look of siteLooks(site)) {
      const c = look.colors
      expect(variantColors(c, 0)).toEqual(c)
      const flipped = variantColors(c, 1)
      expect([flipped.background, flipped.text]).toEqual([c.background, c.text])
      expect(new Set([flipped.primary, flipped.secondary])).toEqual(new Set([c.primary, c.secondary]))
      const bold = variantColors(c, 2)
      expect(bold.background, look.id).toBe(c.primary)
      expect(bold.primary, look.id).toBe(c.background)
      expect(contrast(bold.text, bold.background), look.id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('obrnuta ne zamenjuje naglaske kad se drugi ne vidi na podlozi', () => {
    const pale = {
      primary: '#C8102E',
      secondary: '#FFF4F0',
      background: '#FFFFFF',
      text: '#111827',
      muted: '#6B7280',
    }
    expect(variantColors(pale, 1)).toEqual(pale)
  })

  it('stilovi tema crtaju sve tri varijante u 4:5 i u priči, i varijante se zaista razlikuju', async () => {
    const colors = siteLooks(site)[0]!.colors
    for (const id of THEME_STYLES) {
      for (let i = 0; i < 3; i++) {
        const base = await render(id, colors, i === 2 ? 4 : i, 0)
        for (const variant of [1, 2] as const) {
          const r = await render(id, colors, i === 2 ? 4 : i, variant)
          const meta = await sharp(r.bytes).metadata()
          expect([meta.width, meta.height], `${id} ${i} v${variant}`).toEqual([216, 270])
          expect(Buffer.compare(r.bytes, base.bytes), `${id} ${i} v${variant}`).not.toBe(0)
        }
      }
      for (const variant of [1, 2] as const) {
        const story = await sharp((await render(id, colors, 0, variant, 'story')).bytes).metadata()
        expect([story.width, story.height], `${id} priča v${variant}`).toEqual([216, 384])
      }
    }
  }, 120_000)

  it('ostali stilovi prihvataju varijantu kroz boje i ne pucaju', async () => {
    const colors = siteLooks(site)[3]!.colors
    for (const id of STYLE_IDS.filter((s) => !THEME_STYLES.includes(s))) {
      const r = await render(id, colors, 0, 2)
      expect(r.bytes.length, id).toBeGreaterThan(1000)
    }
  }, 120_000)
})
