import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { configureFontLoader, loadFonts } from './fonts'
import { prepareImageForTemplate, renderTemplate } from './render'
import {
  ASPECT_SIZES,
  buildTemplate,
  headlineSize,
  pickTemplate,
  pickText,
  TEMPLATE_IDS,
  type TemplateInput,
} from './templates'

const colors = {
  primary: '#ff6600',
  secondary: '#003366',
  accent: '#00a86b',
  neutralLight: '#f8fafc',
  neutralDark: '#111827',
  textOnPrimary: '#ffffff',
}

function input(over: Partial<TemplateInput> = {}): TemplateInput {
  return {
    headline: 'Rast koji se meri',
    subtext: 'SEO, oglasi i mreže za male biznise.',
    cta: 'Zakažite poziv',
    brandName: 'Fixture Studio',
    colors,
    fonts: { headings: 'Inter', body: 'Inter' },
    size: { width: 540, height: 540 },
    ...over,
  }
}

beforeAll(() => configureFontLoader({ remote: false }))

describe('templates', () => {
  it('bira šablon po slici, dužini i formatu', () => {
    expect(pickTemplate({ hasImage: false, headline: 'x', subtext: null, aspect: '1:1' })).toBe('solid')
    expect(pickTemplate({ hasImage: false, headline: 'x', subtext: 'y', aspect: '1:1' })).toBe('announcement')
    expect(pickTemplate({ hasImage: true, headline: 'kratko', aspect: '1:1' })).toBe('photo-overlay')
    expect(pickTemplate({ hasImage: true, headline: 'a'.repeat(80), aspect: '16:9' })).toBe('split')
  })
  it('veličina naslova pada sa dužinom; tekst preko boje bira kontrast', () => {
    expect(headlineSize('Kratko', 1080)).toBeGreaterThan(headlineSize('x'.repeat(100), 1080))
    expect(pickText('#ffffff')).toBe('#111111')
    expect(pickText('#003366')).toBe('#ffffff')
    expect(ASPECT_SIZES['9:16']).toEqual({ width: 1080, height: 1920 })
  })
  it('svaki šablon daje stablo sa naslovom i nazivom brenda', () => {
    for (const id of TEMPLATE_IDS) {
      const json = JSON.stringify(
        buildTemplate(id, input({ imageDataUri: 'data:image/jpeg;base64,AAAA', logoDataUri: null })),
      )
      expect(json).toContain('Rast koji se meri')
      expect(json).toContain('Fixture Studio')
    }
  })
})

describe('render', () => {
  it('ugrađeni Inter ima 400 i 700; nepoznat font pada na Inter bez mreže', async () => {
    const { fonts, available } = await loadFonts(['Nepostojeći Font'])
    expect(fonts.map((f) => `${f.name}:${f.weight}`)).toEqual(['Inter:400', 'Inter:700'])
    expect(available.has('Nepostojeći Font')).toBe(false)
  })
  it('renderuje sva četiri šablona u JPEG tačnih dimenzija, sa ćirilicom i dijakriticima', async () => {
    const photo = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 40, g: 90, b: 150 } },
    })
      .jpeg()
      .toBuffer()
    const imageDataUri = await prepareImageForTemplate(photo, 400)
    for (const id of TEMPLATE_IDS) {
      const r = await renderTemplate({
        template: id,
        input: input({
          headline: 'Čćžšđ i Ћирилица',
          imageDataUri,
          fonts: { headings: 'Poppins', body: 'Poppins' },
          attribution: 'Photo by X on Unsplash',
        }),
      })
      expect(r.mimeType).toBe('image/jpeg')
      expect(r.fontsUsed).toEqual({ headings: 'Inter', body: 'Inter' })
      const meta = await sharp(r.bytes).metadata()
      expect([meta.width, meta.height]).toEqual([540, 540])
      // slika nije prazna: ima više od jedne boje
      const stats = await sharp(r.bytes).stats()
      expect(stats.channels[0]!.stdev).toBeGreaterThan(5)
    }
  }, 60_000)
  it('PNG format i render bez slike i logoa', async () => {
    const r = await renderTemplate({
      template: 'solid',
      format: 'png',
      input: input({ size: { width: 320, height: 400 } }),
    })
    expect(r.mimeType).toBe('image/png')
    expect((await sharp(r.bytes).metadata()).height).toBe(400)
  }, 30_000)
})
