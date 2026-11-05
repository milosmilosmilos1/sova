import { describe, expect, it } from 'vitest'

import { figmaBrand, frameNodes, type FigmaNode } from './brand'
import { parseFigmaLink } from './link'

const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a: 1,
})
const box = (width: number, height: number) => ({ x: 0, y: 0, width, height })

describe('Figma link (D-161)', () => {
  it('ključ fajla, grana i okvir iz adrese', () => {
    expect(
      parseFigmaLink('https://www.figma.com/design/AbCdEfGh1234567890/Sova-objave?node-id=12-34&t=x'),
    ).toEqual({
      fileKey: 'AbCdEfGh1234567890',
      nodeId: '12:34',
    })
    expect(parseFigmaLink('https://figma.com/file/AbCdEfGh1234567890/Ime')).toEqual({
      fileKey: 'AbCdEfGh1234567890',
      nodeId: null,
    })
    expect(
      parseFigmaLink(' https://www.figma.com/design/AbCdEfGh1234567890/branch/ZzYyXxWw0987654321/Ime '),
    ).toEqual({
      fileKey: 'ZzYyXxWw0987654321',
      nodeId: null,
    })
    expect(parseFigmaLink('https://www.figma.com/board/AbCdEfGh1234567890/FigJam')).toBeNull()
    expect(parseFigmaLink('https://evil.com/design/AbCdEfGh1234567890/x')).toBeNull()
    expect(parseFigmaLink('nije link')).toBeNull()
  })
})

describe('brend iz Figme (D-161)', () => {
  const slide: FigmaNode = {
    id: '1:1',
    name: 'Slajd 1',
    type: 'FRAME',
    fills: [{ type: 'SOLID', color: rgb('#FFF8F0') }],
    absoluteBoundingBox: box(1080, 1350),
    children: [
      {
        id: '1:2',
        name: 'Traka',
        type: 'RECTANGLE',
        fills: [{ type: 'SOLID', color: rgb('#F26B1D') }],
        absoluteBoundingBox: box(1080, 300),
      },
      {
        id: '1:3',
        name: 'Krug',
        type: 'ELLIPSE',
        fills: [{ type: 'SOLID', color: rgb('#12325A') }],
        absoluteBoundingBox: box(200, 200),
      },
      {
        id: '1:4',
        name: 'Senka',
        type: 'RECTANGLE',
        fills: [{ type: 'SOLID', color: rgb('#EEEEEE') }],
        absoluteBoundingBox: box(1080, 900),
      },
      {
        id: '1:5',
        name: 'Naslov',
        type: 'TEXT',
        characters: 'Leto bez znoja',
        style: { fontFamily: 'Montserrat', fontSize: 96 },
        fills: [{ type: 'SOLID', color: rgb('#201E1D') }],
      },
      {
        id: '1:6',
        name: 'Tekst',
        type: 'TEXT',
        characters: 'Servis klime za sat vremena, sa garancijom na rad i delove.',
        style: { fontFamily: 'Inter', fontSize: 32 },
        fills: [{ type: 'SOLID', color: rgb('#201E1D') }],
      },
      { id: '1:7', name: 'Sakriven logo', type: 'GROUP', visible: false, children: [] },
      { id: '1:8', name: 'Logo Klima24', type: 'INSTANCE', children: [] },
    ],
  }

  it('boje brenda po površini (siva se preskače), podloga okvira, fontovi i logo', () => {
    expect(figmaBrand([slide])).toEqual({
      primary: '#F26B1D',
      secondary: '#12325A',
      background: '#FFF8F0',
      text: '#201E1D',
      fonts: { headings: 'Montserrat', body: 'Inter' },
      logoNodeId: '1:8',
    })
  })

  it('okviri strane i okviri u sekciji, bez sakrivenih i bez slobodnog teksta', () => {
    const page: FigmaNode = {
      id: '0:1',
      name: 'Objave',
      type: 'CANVAS',
      children: [
        slide,
        {
          id: '2:1',
          name: 'Sekcija',
          type: 'SECTION',
          children: [{ id: '2:2', name: 'Priča', type: 'FRAME' }],
        },
        { id: '3:1', name: 'Skica', type: 'FRAME', visible: false },
        { id: '4:1', name: 'Beleška', type: 'TEXT' },
      ],
    }
    expect(frameNodes(page).map((n) => n.id)).toEqual(['1:1', '2:2'])
  })
})
