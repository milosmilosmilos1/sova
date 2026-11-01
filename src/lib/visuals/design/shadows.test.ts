import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { configureFontLoader, loadFonts } from '../fonts'
import { getStyle } from './index'
import { siteLooks } from './looks'
import { tightenShadowFilters } from './shadows'
import type { DesignContext } from './types'

const filter = (id: string, deviation: number) =>
  `<filter id="${id}" x="-71.1%" y="-67.2%" width="242.3%" height="234.4%"><feGaussianBlur stdDeviation="${deviation}" result="b"/><feFlood flood-color="rgba(0,0,0,0.28)" in="SourceGraphic" result="f"/><feComposite in="f" in2="b" operator="in"/></filter>`

describe('senke bez viška površine', () => {
  it('oblast filtera je senka i tri standardne devijacije oko nje, i nagnut oblik uzima širi okvir', () => {
    const svg =
      `<svg width="1080" height="1920"><defs>${filter('a', 20)}${filter('b', 10)}</defs>` +
      '<g mask="url(#m)" filter="url(#a)"><rect x="100" y="200" width="400" height="300" fill="#fff"/></g>' +
      '<g filter="url(#b)"><path x="0" y="0" width="100" height="100" d="M0,0 h100 v100 h-100 z" transform="matrix(0,1,-1,0,100,0)"/></g></svg>'
    const out = tightenShadowFilters(svg, 1080, 1920)
    // 3 × 20 + 2 = 62 piksela oko pravougaonika
    expect(out).toContain(
      '<filter id="a" filterUnits="userSpaceOnUse" x="38" y="138" width="524" height="424">',
    )
    // okret za 90°: (0..100, 0..100) ostaje u istom kvadratu, a ivica slajda seče oblast
    expect(out).toContain('<filter id="b" filterUnits="userSpaceOnUse" x="0" y="0" width="132" height="132">')
  })

  it('filter koji nije senka oblika sa poznatim granicama ostaje kakav jeste', () => {
    const text = `<svg><defs>${filter('t', 4)}</defs><g filter="url(#t)"><text x="10" y="20">Zdravo</text></g></svg>`
    expect(tightenShadowFilters(text, 1080, 1350)).toBe(text)
    const skewed = `<svg><defs>${filter('s', 4)}</defs><g filter="url(#s)"><rect x="1" y="1" width="9" height="9" transform="rotate(5)"/></g></svg>`
    expect(tightenShadowFilters(skewed, 1080, 1350)).toBe(skewed)
    const orphan = `<svg><defs>${filter('o', 4)}</defs></svg>`
    expect(tightenShadowFilters(orphan, 1080, 1350)).toBe(orphan)
  })

  describe('pravi slajd', () => {
    let svg = ''
    beforeAll(async () => {
      configureFontLoader({ remote: false })
      const loaded = await loadFonts(['Inter'])
      const look = siteLooks({
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
      })[1]!
      const key = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000000' } })
        .png()
        .toBuffer()
      const ctx: DesignContext = {
        format: 'story',
        size: { width: 1080, height: 1920 },
        colors: look.colors,
        fonts: { headings: loaded.fonts[0]!.name, body: loaded.fonts[0]!.name },
        brandName: 'Tangerine',
        handle: '@tangerineseo',
        logo: null,
        photo: `data:image/png;base64,${key.toString('base64')}`,
        index: 0,
        total: 1,
        variant: 0,
      }
      const tree = getStyle('sticker').render(
        {
          kind: 'cover',
          kicker: 'Iza kulisa',
          title: 'SEO provera u 200 tačaka',
          body: 'Šta analitičar gleda.',
        },
        ctx,
      )
      svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
        width: 1080,
        height: 1920,
        fonts: loaded.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
      })
    })

    it('Nalepnica: obe senke dobijaju usku oblast unutar slajda, a slika ostaje ista', async () => {
      const out = tightenShadowFilters(svg, 1080, 1920)
      const regions = [
        ...out.matchAll(/filterUnits="userSpaceOnUse" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g),
      ]
      expect(regions).toHaveLength((svg.match(/<filter /g) ?? []).length)
      expect(regions.length).toBeGreaterThanOrEqual(2)
      for (const [, x, y, w, h] of regions) {
        expect(Number(x) + Number(w)).toBeLessThanOrEqual(1080)
        expect(Number(y) + Number(h)).toBeLessThanOrEqual(1920)
      }
      const pixels = (s: string) =>
        sharp(Buffer.from(new Resvg(s, { fitTo: { mode: 'width', value: 540 } }).render().asPng()))
          .raw()
          .toBuffer()
      const [before, after] = await Promise.all([pixels(svg), pixels(out)])
      let worst = 0
      for (let i = 0; i < before.length; i++) worst = Math.max(worst, Math.abs(before[i]! - after[i]!))
      // razlika do par nivoa od 255 (zaokruživanje zamućenja), okom nevidljiva
      expect(worst).toBeLessThanOrEqual(8)
    }, 60_000)
  })
})
