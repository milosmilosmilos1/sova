import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { logoBox, logoFor } from './kit'
import { prepareBrandLogo } from './logo'
import type { BrandLogo } from './types'

/** Natpis kao TangerineSEO: tamna i narandžasta slova sa znakom, na beloj pozadini (JPG). */
const WORDMARK = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"><rect width="900" height="200" fill="#ffffff"/>
<rect x="60" y="60" width="520" height="80" fill="#201E1D"/><rect x="600" y="60" width="160" height="80" fill="#F26B1D"/>
<rect x="250" y="85" width="40" height="30" fill="#ffffff"/></svg>`

const pixels = async (uri: string) => {
  const raw = await sharp(Buffer.from(uri.split(',')[1]!, 'base64'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number) =>
    raw.data.subarray((y * raw.info.width + x) * 4, (y * raw.info.width + x) * 4 + 4)
  return { ...raw.info, at }
}

describe('logo za slajd (D-134)', () => {
  it('bela pozadina iza natpisa postaje providna (i u rupi slova), prazne ivice se seku', async () => {
    const jpg = await sharp(Buffer.from(WORDMARK)).jpeg({ quality: 92 }).toBuffer()
    const logo = (await prepareBrandLogo(jpg, 'image/jpeg'))!
    // vidljiv deo je 700 × 80 (natpis i znak), bez belog okvira od 60 px
    expect(logo.aspect).toBeGreaterThan(8.2)
    expect(logo.aspect).toBeLessThan(9.3)
    const img = await pixels(logo.src)
    expect(img.at(3, 3)[3]).toBeGreaterThan(200) // ugao je sada deo natpisa
    // rupa u „slovu” (bela unutra) je providna, kao i ostatak pozadine
    const hole = img.at(Math.round(img.width * (210 / 700)), Math.round(img.height / 2))
    expect(hole[3]).toBeLessThan(40)
    const colors = logo.inks.map((i) => i.color)
    expect(colors[0]).toMatch(/^#[12]/) // tamna slova su najveći deo
    expect(logo.inks.some((i) => /^#F[0-9A-F]6/.test(i.color))).toBe(true)
    // jednobojne verzije: isti oblik, bela i tamna
    const white = await pixels(logo.light)
    expect([...white.at(5, 5)].slice(0, 3)).toEqual([255, 255, 255])
  })

  it('providan PNG zadržava boje i providnost, a fotografija ostaje cela', async () => {
    const png = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({ create: { width: 200, height: 100, channels: 4, background: '#2563EB' } })
            .png()
            .toBuffer(),
          left: 100,
          top: 150,
        },
      ])
      .png()
      .toBuffer()
    const logo = (await prepareBrandLogo(png, 'image/png'))!
    expect(logo.aspect).toBeCloseTo(2, 1)
    expect(logo.inks[0]!.color).toBe('#2563EB')

    // šarena slika bez ravnog okvira: ništa se ne briše
    const photo = await sharp({
      create: { width: 300, height: 100, channels: 3, background: { r: 30, g: 120, b: 60 } },
    })
      .composite([
        {
          input: await sharp({ create: { width: 150, height: 100, channels: 3, background: '#F5F5F5' } })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .toBuffer()
    const kept = (await prepareBrandLogo(photo, 'image/jpeg'))!
    expect(kept.aspect).toBeCloseTo(3, 1)
    const img = await pixels(kept.src)
    expect(img.at(10, 10)[3]).toBe(255)

    const empty = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    expect(await prepareBrandLogo(empty, 'image/png')).toBeNull()
  })

  it('verzija po podlozi: u bojama kad se vidi, inače bela ili tamna', () => {
    const logo: BrandLogo = {
      src: 'boje',
      light: 'belo',
      dark: 'tamno',
      aspect: 7,
      inks: [
        { color: '#1F1E1C', share: 0.55 },
        { color: '#EF6B1F', share: 0.4 },
      ],
    }
    expect(logoFor(logo, '#111827', '#FFFFFF')).toBe('boje')
    expect(logoFor(logo, '#111827', '#F3F2F2')).toBe('boje')
    // tamna slova na tamnocrvenoj i znak na narandžastoj se ne vide
    expect(logoFor(logo, '#FFFFFF', '#990000')).toBe('belo')
    expect(logoFor(logo, '#111827', '#F26B1D')).toBe('tamno')
    expect(logoFor(logo, '#FFFFFF', '#1E1E1E')).toBe('belo')
    const whiteLogo = { ...logo, inks: [{ color: '#FFFFFF', share: 1 }] }
    expect(logoFor(whiteLogo, '#111827', '#FFFFFF')).toBe('tamno')
    expect(logoFor(whiteLogo, '#FFFFFF', '#14161F')).toBe('boje')
  })

  it('veličina po obliku: natpis 3:1 je visok kao zadato, znak malo viši, dugačak natpis ne prelazi 4,2 visine', () => {
    expect(logoBox(3, 50)).toEqual({ width: 150, height: 50 })
    const square = logoBox(1, 50)
    expect(square.width).toBeCloseTo(60, 5)
    expect(square.height).toBeCloseTo(60, 5)
    const long = logoBox(7.3, 50)
    expect(long.width).toBeCloseTo(210, 5)
    expect(long.height).toBeCloseTo(210 / 7.3, 5)
  })
})
