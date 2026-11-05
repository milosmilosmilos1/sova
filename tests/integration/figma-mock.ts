import { http, HttpResponse } from 'msw'
import sharp from 'sharp'

/**
 * MSW mock Figma API-ja (D-161): token i obnova, fajl sa dve strane (okviri i sekcija), sadržaj
 * okvira za brend i izvoz slika na S3 adresama. Stanje broji pozive, da test vidi koliko je
 * najstrože ograničenih zahteva (čitanje fajla, izvoz slike) potrošeno.
 */
export const figmaState = {
  tokenCalls: [] as Record<string, string>[],
  refreshCalls: 0,
  fileCalls: 0,
  imageCalls: [] as Array<{ ids: string; scale: string }>,
  nodeCalls: 0,
  authHeaders: [] as string[],
  /** obnova pristupa odbija stari refresh token */
  refreshFails: false,
}

export function resetFigmaState(): void {
  figmaState.tokenCalls = []
  figmaState.refreshCalls = 0
  figmaState.fileCalls = 0
  figmaState.imageCalls = []
  figmaState.nodeCalls = 0
  figmaState.authHeaders = []
  figmaState.refreshFails = false
}

const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a: 1,
})
const box = (width: number, height: number) => ({ x: 0, y: 0, width, height })

const FILE = {
  name: 'Klima24 objave',
  lastModified: '2026-11-05T10:00:00Z',
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Karusel',
        type: 'CANVAS',
        children: [
          { id: '1:1', name: 'Slajd 1', type: 'FRAME', absoluteBoundingBox: box(1080, 1350) },
          { id: '1:2', name: 'Slajd 2', type: 'FRAME', absoluteBoundingBox: box(1080, 1350) },
          { id: '1:3', name: 'Beleška', type: 'TEXT', absoluteBoundingBox: box(300, 40) },
        ],
      },
      {
        id: '0:2',
        name: 'Priče',
        type: 'CANVAS',
        children: [
          {
            id: '2:1',
            name: 'Sekcija',
            type: 'SECTION',
            children: [{ id: '2:2', name: 'Priča', type: 'FRAME', absoluteBoundingBox: box(1080, 1920) }],
          },
        ],
      },
    ],
  },
}

const SLIDE = {
  id: '1:1',
  name: 'Slajd 1',
  type: 'FRAME',
  fills: [{ type: 'SOLID', color: rgb('#FFF8F0') }],
  absoluteBoundingBox: box(1080, 1350),
  children: [
    {
      id: '1:4',
      name: 'Traka',
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: rgb('#F26B1D') }],
      absoluteBoundingBox: box(1080, 300),
    },
    {
      id: '1:5',
      name: 'Krug',
      type: 'ELLIPSE',
      fills: [{ type: 'SOLID', color: rgb('#12325A') }],
      absoluteBoundingBox: box(200, 200),
    },
    {
      id: '1:6',
      name: 'Naslov',
      type: 'TEXT',
      characters: 'Leto bez znoja',
      style: { fontFamily: 'Montserrat', fontSize: 96 },
      fills: [{ type: 'SOLID', color: rgb('#201E1D') }],
    },
    {
      id: '1:7',
      name: 'Tekst',
      type: 'TEXT',
      characters: 'Servis klime za sat vremena.',
      style: { fontFamily: 'Inter', fontSize: 32 },
      fills: [{ type: 'SOLID', color: rgb('#201E1D') }],
    },
    { id: '1:8', name: 'Logo', type: 'INSTANCE', absoluteBoundingBox: box(160, 160), children: [] },
  ],
}

/** Šablon (D-162): okvir 540×675 sa #pozadina, #naslov, #tekst, #foto i #logo. */
const TEMPLATE = {
  id: '5:1',
  name: 'Šablon naslovni',
  type: 'FRAME',
  fills: [{ type: 'SOLID', color: rgb('#0A2540') }],
  absoluteBoundingBox: box(540, 675),
  children: [
    { id: '5:2', name: '#pozadina', type: 'GROUP', absoluteBoundingBox: box(540, 675), children: [] },
    {
      id: '5:3',
      name: '#naslov',
      type: 'TEXT',
      absoluteBoundingBox: { x: 40, y: 420, width: 460, height: 110 },
      style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 40, lineHeightPx: 44 },
      fills: [{ type: 'SOLID', color: rgb('#FFFFFF') }],
    },
    {
      id: '5:4',
      name: '#tekst',
      type: 'TEXT',
      absoluteBoundingBox: { x: 40, y: 540, width: 460, height: 60 },
      style: { fontFamily: 'Inter', fontSize: 18 },
      fills: [{ type: 'SOLID', color: rgb('#C9D1DC') }],
    },
    {
      id: '5:5',
      name: '#foto',
      type: 'RECTANGLE',
      cornerRadius: 16,
      absoluteBoundingBox: { x: 40, y: 40, width: 460, height: 340 },
    },
    {
      id: '5:6',
      name: '#logo',
      type: 'INSTANCE',
      absoluteBoundingBox: { x: 40, y: 620, width: 80, height: 40 },
      children: [],
    },
  ],
}

const S3 = 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images'

function authorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? ''
  figmaState.authHeaders.push(auth)
  return auth.startsWith('Bearer figma-access-')
}

export const figmaHandlers = [
  http.post('https://api.figma.com/v1/oauth/token', async ({ request }) => {
    if (!(request.headers.get('authorization') ?? '').startsWith('Basic '))
      return HttpResponse.json({ error: 'invalid_client' }, { status: 401 })
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    figmaState.tokenCalls.push(body)
    if (body.code !== 'good-code') return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
    return HttpResponse.json({
      user_id_string: '1234567890',
      access_token: 'figma-access-1',
      token_type: 'bearer',
      expires_in: 7_776_000,
      refresh_token: 'figma-refresh-1',
    })
  }),
  http.post('https://api.figma.com/v1/oauth/refresh', async ({ request }) => {
    figmaState.refreshCalls++
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    if (figmaState.refreshFails || body.refresh_token !== 'figma-refresh-1')
      return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
    return HttpResponse.json({ access_token: 'figma-access-2', token_type: 'bearer', expires_in: 7_776_000 })
  }),
  http.get('https://api.figma.com/v1/files/:key/nodes', ({ request }) => {
    if (!authorized(request)) return HttpResponse.json({ status: 403, err: 'Invalid token' }, { status: 403 })
    figmaState.nodeCalls++
    const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',')
    return HttpResponse.json({
      name: FILE.name,
      nodes: Object.fromEntries(
        ids.map((id) => [
          id,
          id === '1:1' ? { document: SLIDE } : id === '5:1' ? { document: TEMPLATE } : null,
        ]),
      ),
    })
  }),
  http.get('https://api.figma.com/v1/files/:key', ({ request, params }) => {
    if (!authorized(request)) return HttpResponse.json({ status: 403, err: 'Invalid token' }, { status: 403 })
    if (params.key === 'NemaPristupa0000')
      return HttpResponse.json({ status: 404, err: 'Not found' }, { status: 404 })
    if (params.key === 'Ograniceno00000')
      return new HttpResponse(null, { status: 429, headers: { 'retry-after': '120' } })
    figmaState.fileCalls++
    return HttpResponse.json(FILE)
  }),
  http.get('https://api.figma.com/v1/images/:key', ({ request }) => {
    if (!authorized(request)) return HttpResponse.json({ status: 403, err: 'Invalid token' }, { status: 403 })
    const url = new URL(request.url)
    const ids = (url.searchParams.get('ids') ?? '').split(',')
    figmaState.imageCalls.push({ ids: ids.join(','), scale: url.searchParams.get('scale') ?? '' })
    return HttpResponse.json({
      err: null,
      images: Object.fromEntries(
        ids.map((id) => [id, id === '9:9' ? null : `${S3}/${id.replace(':', '-')}.png`]),
      ),
    })
  }),
  http.get(`${S3}/*`, async ({ request }) => {
    const name = new URL(request.url).pathname.split('/').pop() ?? ''
    // logo je providan znak, slajdovi neprovidni
    const png = name.startsWith('1-8')
      ? await sharp({
          create: { width: 320, height: 320, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .composite([
            {
              input: await sharp({ create: { width: 200, height: 200, channels: 4, background: '#F26B1D' } })
                .png()
                .toBuffer(),
              left: 60,
              top: 60,
            },
          ])
          .png()
          .toBuffer()
      : await sharp({
          create: { width: 1080, height: 1350, channels: 4, background: { r: 242, g: 107, b: 29, alpha: 1 } },
        })
          .png()
          .toBuffer()
    return new HttpResponse(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
  }),
]
