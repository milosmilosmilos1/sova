import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { configureFontLoader } from '@/lib/visuals/fonts'
import { renderTemplateSlide } from '@/lib/visuals/design/template-render'

import type { FigmaNode } from './brand'
import { layerRole, parseTemplateFrame, templateFits, templateFormat, type FigmaTemplate } from './template'

const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
})
const at = (x: number, y: number, width: number, height: number) => ({ x: 100 + x, y: 50 + y, width, height })

/** Okvir 540×675 (pola veličine): Sova ga preračunava na 1080×1350. */
const FRAME: FigmaNode = {
  id: '3:1',
  name: 'Klima naslovni',
  type: 'FRAME',
  fills: [{ type: 'SOLID', color: rgb('#0A2540') }],
  absoluteBoundingBox: at(0, 0, 540, 675),
  children: [
    {
      id: '3:2',
      name: '#pozadina',
      type: 'GROUP',
      absoluteBoundingBox: at(0, 0, 540, 675),
      children: [
        { id: '3:3', name: 'Krug', type: 'ELLIPSE', absoluteBoundingBox: at(300, 40, 200, 200) },
        { id: '3:4', name: '#tekst', type: 'TEXT', absoluteBoundingBox: at(0, 0, 10, 10) },
      ],
    },
    {
      id: '3:5',
      name: '#naslov',
      type: 'TEXT',
      absoluteBoundingBox: at(40, 380, 460, 120),
      style: {
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fontSize: 40,
        lineHeightPx: 44,
        letterSpacing: 1,
        textAlignHorizontal: 'CENTER',
        textAlignVertical: 'BOTTOM',
        textCase: 'UPPER',
      },
      fills: [{ type: 'SOLID', color: rgb('#FFFFFF') }],
    },
    {
      id: '3:6',
      name: '#Tekst',
      type: 'TEXT',
      absoluteBoundingBox: at(40, 510, 460, 70),
      style: { fontFamily: 'Inter', fontSize: 18 },
      fills: [{ type: 'SOLID', color: rgb('#C9D1DC') }],
    },
    {
      id: '3:7',
      name: '# foto 1',
      type: 'RECTANGLE',
      cornerRadius: 12,
      absoluteBoundingBox: at(40, 60, 240, 300),
    },
    { id: '3:8', name: '#logo', type: 'INSTANCE', absoluteBoundingBox: at(40, 610, 80, 40), children: [] },
    {
      id: '3:9',
      name: '#Brojač',
      type: 'TEXT',
      absoluteBoundingBox: at(440, 20, 80, 24),
      style: { fontFamily: 'Inter', fontSize: 12 },
    },
  ],
}

describe('Figma šablon (D-162)', () => {
  it('uloga sloja po imenu, bez obzira na velika slova, razmak i kvačice', () => {
    expect(layerRole('#naslov')).toBe('title')
    expect(layerRole('# foto 1')).toBe('photo')
    expect(layerRole('#Brojač')).toBe('counter')
    expect(layerRole('#pozadina')).toBe('background')
    expect(layerRole('naslov')).toBeNull()
    expect(layerRole('#nesto')).toBeNull()
    expect(templateFormat(1080, 1350)).toBe('portrait')
    expect(templateFormat(540, 960)).toBe('story')
    expect(templateFormat(1200, 628)).toBeNull()
  })

  it('raspored preračunat na širinu 1080: mesto, font, poravnanje, boja; sloj u #pozadina je greška', () => {
    const parsed = parseTemplateFrame(FRAME)
    expect(parsed.format).toBe('portrait')
    expect(parsed.fill).toBe('#0A2540')
    expect(parsed.background).toEqual({ nodeId: '3:2', x: 0, y: 0, w: 1080, h: 1350 })
    const title = parsed.layers.find((l) => l.role === 'title')!
    expect(title).toMatchObject({
      x: 80,
      y: 760,
      w: 920,
      h: 240,
      font: 'Montserrat',
      weight: 800,
      size: 80,
      lineHeight: 88,
      letterSpacing: 2,
      align: 'center',
      valign: 'bottom',
      upper: true,
      color: '#FFFFFF',
    })
    expect(parsed.layers.find((l) => l.role === 'photo')).toMatchObject({
      x: 80,
      y: 120,
      w: 480,
      h: 600,
      radius: 24,
    })
    expect(parsed.layers.map((l) => l.role).sort()).toEqual(['body', 'counter', 'logo', 'photo', 'title'])
    // #tekst unutar #pozadina bi ostao na slici
    expect(parsed.problems).toHaveLength(1)
    expect(parsed.problems[0]).toMatch(/#pozadina/)
  })

  it('bez #pozadina, bez #naslov i u pogrešnom odnosu stranica: jasne poruke', () => {
    const bare = parseTemplateFrame({
      id: '9:1',
      name: 'Baner',
      type: 'FRAME',
      absoluteBoundingBox: at(0, 0, 1200, 628),
      children: [],
    })
    expect(bare.problems.join(' ')).toMatch(/nije 4:5, 1:1 ni 9:16/)
    expect(bare.problems.join(' ')).toMatch(/nema grupu #pozadina/)
    expect(bare.problems.join(' ')).toMatch(/nema tekst #naslov/)
  })

  it('slajd po šablonu: pun format, fotografija i logo u svojim okvirima; šablon važi samo za svoj format', async () => {
    configureFontLoader({ remote: false })
    const parsed = parseTemplateFrame(FRAME)
    const frame = {
      nodeId: parsed.nodeId,
      name: parsed.name,
      fill: parsed.fill,
      background: {
        assetId: '00000000-0000-4000-8000-000000000001',
        ...parsed.background!,
        nodeId: undefined,
      },
      layers: parsed.layers,
    }
    const bg = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#12325A' } })
      .png()
      .toBuffer()
    const photo = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#F26B1D' } })
      .jpeg()
      .toBuffer()
    const out = await renderTemplateSlide({
      frame,
      format: 'portrait',
      background: `data:image/png;base64,${bg.toString('base64')}`,
      slide: {
        kind: 'cover',
        title: 'Klima koja hladi kao prvog dana',
        body: 'Dubinsko čišćenje pre sezone.',
      },
      index: 0,
      total: 5,
      brandName: 'Klima24',
      handle: '@klima24.rs',
      logo: null,
      photo: `data:image/jpeg;base64,${photo.toString('base64')}`,
      format_out: 'png',
    })
    const meta = await sharp(out.bytes).metadata()
    expect([meta.width, meta.height]).toEqual([1080, 1350])
    const raw = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => [
      ...raw.data.subarray((y * 1080 + x) * raw.info.channels, (y * 1080 + x) * raw.info.channels + 3),
    ]
    // sredina okvira #foto je fotografija (narandžasta), a ugao slajda pozadina iz Figme (JPEG: ±4)
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 4)
    expect(near(px(320, 420), [242, 107, 29])).toBe(true)
    expect(near(px(1070, 1340), [18, 50, 90])).toBe(true)

    const template = { format: 'portrait' } as FigmaTemplate
    expect(templateFits(template, 'portrait')).toBe(true)
    expect(templateFits(template, 'story')).toBe(false)
    expect(templateFits(null, 'portrait')).toBe(false)
  })
})
