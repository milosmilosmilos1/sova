import { http, HttpResponse } from 'msw'
import sharp from 'sharp'

import { buildMp4 } from '../fixtures/mp4'

/**
 * MSW mock za Unsplash API, Unsplash CDN i Canva Connect API (faza 7, uvoz dizajna i video iz D-104).
 * Stanje je promenljivo da testovi mogu da provere brojače (download tracking, token exchange).
 */
export const visualsState = {
  unsplashSearches: 0,
  unsplashDownloads: [] as string[],
  canvaTokenCalls: [] as Record<string, string>[],
  canvaUploads: 0,
  canvaDesigns: [] as Record<string, unknown>[],
  canvaExports: [] as Record<string, unknown>[],
  canvaAutofill: false,
  canvaRefreshFails: false,
  /** query string svakog `GET /designs` */
  canvaDesignLists: [] as string[],
  /** prva provera MP4 posla vraća in_progress, sledeće success */
  canvaVideoPolls: 0,
  /** 1080p video prijavljuje veličinu preko limita skladišta */
  canvaVideoTooLarge: false,
  /** upiti Pexels pretrage (D-107) */
  pexelsSearches: [] as string[],
  /** Pexels pretraga vraća prazan spisak */
  pexelsEmpty: false,
}

export function resetVisualsState(): void {
  visualsState.unsplashSearches = 0
  visualsState.unsplashDownloads = []
  visualsState.canvaTokenCalls = []
  visualsState.canvaUploads = 0
  visualsState.canvaDesigns = []
  visualsState.canvaExports = []
  visualsState.canvaAutofill = false
  visualsState.canvaRefreshFails = false
  visualsState.canvaDesignLists = []
  visualsState.canvaVideoPolls = 0
  visualsState.canvaVideoTooLarge = false
  visualsState.pexelsSearches = []
  visualsState.pexelsEmpty = false
}

/** Dizajn kao u `GET /designs`; sličica nosi odnos stranica prve strane. */
function canvaDesign(id: string, title: string, width: number, height: number) {
  return {
    id,
    title,
    owner: { user_id: 'canva-user-1', team_id: 'team-1' },
    urls: {
      edit_url: `https://www.canva.com/design/${id}/edit`,
      view_url: `https://www.canva.com/design/${id}/view`,
    },
    thumbnail: { width, height, url: `https://document-export.canva.com/${id}/thumbnail/0001.png` },
    page_count: 1,
    created_at: 1761700000,
    updated_at: 1761740000,
  }
}

const photoCache = new Map<string, Buffer>()
async function photoBytes(id: string, w: number, h = Math.round(w * 0.66)): Promise<Buffer> {
  const key = `${id}:${w}:${h}`
  let buf = photoCache.get(key)
  if (!buf) {
    const seed = id.charCodeAt(id.length - 1)
    buf = await sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: { r: (seed * 37) % 255, g: (seed * 91) % 255, b: (seed * 53) % 255 },
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer()
    photoCache.set(key, buf)
  }
  return buf
}

export function unsplashPhoto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    width: 4000,
    height: 2667,
    color: '#3c6ea0',
    blur_hash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
    alt_description: `fotografija ${id}`,
    description: null,
    urls: {
      raw: `https://images.unsplash.com/photo-${id}?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY&ixlib=rb-4.0.3`,
      full: `https://images.unsplash.com/photo-${id}?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY&q=85`,
      regular: `https://images.unsplash.com/photo-${id}?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY&w=1080`,
      small: `https://images.unsplash.com/photo-${id}?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY&w=400`,
      thumb: `https://images.unsplash.com/photo-${id}?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY&w=200`,
    },
    user: {
      name: `Fotograf ${id}`,
      username: `foto${id}`,
      links: { html: `https://unsplash.com/@foto${id}` },
    },
    links: {
      download_location: `https://api.unsplash.com/photos/${id}/download?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY`,
      html: `https://unsplash.com/photos/${id}`,
    },
    ...overrides,
  }
}

export const unsplashHandlers = [
  http.get('https://api.unsplash.com/search/photos', ({ request }) => {
    visualsState.unsplashSearches++
    const auth = request.headers.get('authorization') ?? ''
    if (!auth.startsWith('Client-ID ')) return HttpResponse.json({ errors: ['OAuth error'] }, { status: 401 })
    const url = new URL(request.url)
    const q = url.searchParams.get('query') ?? ''
    if (q === 'ratelimit')
      return new HttpResponse('Rate Limit Exceeded', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      })
    if (q === 'nista')
      return HttpResponse.json(
        { total: 0, total_pages: 0, results: [] },
        { headers: { 'x-ratelimit-remaining': '48' } },
      )
    // tri strane po četiri fotografije, kao pravi API sa više strana (D-121: automatski izbor ne ponavlja)
    const pages = [
      ['a1', 'b2', 'c3', 'd4'],
      ['e5', 'f6', 'g7', 'h8'],
      ['i9', 'j10', 'k11', 'l12'],
    ]
    const page = Math.min(3, Math.max(1, Number(url.searchParams.get('page') ?? 1)))
    const results = pages[page - 1]!.map((id) => unsplashPhoto(id))
    return HttpResponse.json(
      { total: 12, total_pages: 3, results },
      { headers: { 'x-ratelimit-remaining': '47', 'x-ratelimit-limit': '50' } },
    )
  }),
  http.get('https://api.unsplash.com/photos/:id/download', ({ params }) => {
    visualsState.unsplashDownloads.push(String(params.id))
    return HttpResponse.json({ url: `https://images.unsplash.com/photo-${String(params.id)}` })
  }),
  http.get('https://api.unsplash.com/photos/:id', ({ params }) => {
    if (params.id === 'missing') return HttpResponse.json({ errors: ['Not found'] }, { status: 404 })
    return HttpResponse.json(unsplashPhoto(String(params.id)))
  }),
  http.get('https://images.unsplash.com/*', async ({ request }) => {
    const url = new URL(request.url)
    const id = url.pathname.replace('/photo-', '')
    const w = Math.min(Number(url.searchParams.get('w') ?? 1080), 2000)
    // kao imgix: fit=crop sa visinom seče tačno na w × h (uspravno za priče, kvadrat za objave)
    const h = url.searchParams.get('fit') === 'crop' ? Number(url.searchParams.get('h') ?? 0) : 0
    const buf = await photoBytes(id, w, h ? Math.min(h, 2000) : undefined)
    return new HttpResponse(new Uint8Array(buf), { headers: { 'content-type': 'image/jpeg' } })
  }),
]

export const canvaHandlers = [
  http.post('https://api.canva.com/rest/v1/oauth/token', async ({ request }) => {
    const auth = request.headers.get('authorization') ?? ''
    if (!auth.startsWith('Basic '))
      return HttpResponse.json({ code: 'invalid_client', message: 'no auth' }, { status: 401 })
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    visualsState.canvaTokenCalls.push(body)
    if (body.grant_type === 'refresh_token' && visualsState.canvaRefreshFails) {
      return HttpResponse.json({ code: 'invalid_grant', message: 'revoked' }, { status: 400 })
    }
    if (body.grant_type === 'authorization_code' && body.code !== 'good-code') {
      return HttpResponse.json({ code: 'invalid_grant', message: 'bad code' }, { status: 400 })
    }
    const n = visualsState.canvaTokenCalls.length
    return HttpResponse.json({
      access_token: `access-${n}`,
      refresh_token: `refresh-${n}`,
      token_type: 'Bearer',
      expires_in: 14400,
      scope: 'design:content:read design:content:write asset:write profile:read',
    })
  }),
  http.get('https://api.canva.com/rest/v1/users/me', ({ request }) => {
    if (!request.headers.get('authorization')?.startsWith('Bearer access-'))
      return HttpResponse.json({ code: 'unauthorized' }, { status: 401 })
    return HttpResponse.json({ team_user: { user_id: 'canva-user-1', team_id: 'team-1' } })
  }),
  http.get('https://api.canva.com/rest/v1/brand-templates', () =>
    visualsState.canvaAutofill
      ? HttpResponse.json({ items: [] })
      : HttpResponse.json({ code: 'permission_denied', message: 'no' }, { status: 403 }),
  ),
  http.post('https://api.canva.com/rest/v1/asset-uploads', async ({ request }) => {
    visualsState.canvaUploads++
    const meta = request.headers.get('asset-upload-metadata')
    if (!meta || request.headers.get('content-type') !== 'application/octet-stream')
      return HttpResponse.json({ code: 'bad_request' }, { status: 400 })
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength < 100)
      return HttpResponse.json({ code: 'bad_request', message: 'empty' }, { status: 400 })
    return HttpResponse.json({ job: { id: 'upload-job-1', status: 'in_progress' } })
  }),
  http.get('https://api.canva.com/rest/v1/asset-uploads/:id', () =>
    HttpResponse.json({
      job: { id: 'upload-job-1', status: 'success', asset: { id: 'asset-xyz', type: 'image', name: 'Sova' } },
    }),
  ),
  http.post('https://api.canva.com/rest/v1/designs', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    visualsState.canvaDesigns.push(body)
    return HttpResponse.json({
      design: {
        id: `DAF-${visualsState.canvaDesigns.length}`,
        title: body.title,
        urls: {
          edit_url: 'https://www.canva.com/design/DAF-1/edit?token=x',
          view_url: 'https://www.canva.com/design/DAF-1/view',
        },
        thumbnail: { width: 595, height: 335, url: 'https://document-export.canva.com/thumb.png' },
      },
    })
  }),
  http.get('https://api.canva.com/rest/v1/designs', ({ request }) => {
    const url = new URL(request.url)
    visualsState.canvaDesignLists.push(url.search)
    if (url.searchParams.get('query') === 'nista') return HttpResponse.json({ items: [] })
    if (url.searchParams.get('continuation') === 'strana-2')
      return HttpResponse.json({ items: [canvaDesign('DVID-3', 'Kvadrat', 400, 400)] })
    return HttpResponse.json({
      items: [
        canvaDesign('DVID-1', 'Reel jesen', 270, 480),
        canvaDesign('DVID-2', 'Objava popust', 400, 400),
      ],
      continuation: 'strana-2',
    })
  }),
  http.get('https://api.canva.com/rest/v1/designs/:id', ({ params }) => {
    const id = String(params.id)
    if (id === 'missing')
      return HttpResponse.json({ code: 'design_not_found', message: 'no' }, { status: 404 })
    const wide = id === 'DVID-WIDE'
    return HttpResponse.json({ design: canvaDesign(id, 'Dizajn', wide ? 480 : 270, wide ? 270 : 480) })
  }),
  http.post('https://api.canva.com/rest/v1/exports', async ({ request }) => {
    const body = (await request.json()) as { design_id: string; format: { type: string; quality?: string } }
    visualsState.canvaExports.push(body)
    if (body.design_id === 'DVID-PRO')
      return HttpResponse.json({ code: 'license_required', message: 'premium' }, { status: 403 })
    const id = body.format.type === 'mp4' ? `export-mp4-${body.format.quality}` : 'export-job-1'
    return HttpResponse.json({ job: { id, status: 'in_progress' } })
  }),
  http.get('https://api.canva.com/rest/v1/exports/:id', ({ params }) => {
    const id = String(params.id)
    if (id.startsWith('export-mp4-')) {
      if (visualsState.canvaVideoPolls++ < 1) return HttpResponse.json({ job: { id, status: 'in_progress' } })
      return HttpResponse.json({
        job: { id, status: 'success', urls: [`https://export-download.canva.com/video/${id}.mp4?token=abc`] },
      })
    }
    return HttpResponse.json({
      job: {
        id: 'export-job-1',
        status: 'success',
        urls: ['https://export-download.canva.com/DAF-1/page1.png?token=abc'],
      },
    })
  }),
  http.get('https://export-download.canva.com/*', async ({ request }) => {
    const { pathname } = new URL(request.url)
    if (pathname.endsWith('.mp4')) {
      // safeFetch odbija po zaglavlju, pre čitanja tela
      if (visualsState.canvaVideoTooLarge && pathname.includes('1080p'))
        return new HttpResponse(new Uint8Array(16), {
          headers: { 'content-type': 'video/mp4', 'content-length': String(500 * 1024 * 1024) },
        })
      const mp4 = buildMp4({ durationMs: 12_000, width: 1080, height: 1920 })
      return new HttpResponse(new Uint8Array(mp4), { headers: { 'content-type': 'video/mp4' } })
    }
    const png = await sharp({
      create: { width: 640, height: 640, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer()
    return new HttpResponse(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
  }),
]

/** Pexels snimak kao u API-ju; prvi je uspravan i kratak (Reels, priča), drugi vodoravan i dug. */
export function pexelsVideo(id: number, overrides: Record<string, unknown> = {}) {
  const portrait = id % 2 === 1
  return {
    id,
    width: portrait ? 1080 : 1920,
    height: portrait ? 1920 : 1080,
    duration: portrait ? 12 : 95,
    url: `https://www.pexels.com/video/${id}/`,
    image: `https://images.pexels.com/videos/${id}/thumb.jpeg`,
    user: { id: 7, name: `Autor ${id}`, url: `https://www.pexels.com/@autor${id}` },
    video_files: [
      {
        id: id * 10 + 1,
        quality: 'uhd',
        file_type: 'video/mp4',
        width: 2160,
        height: 3840,
        fps: 30,
        link: `https://videos.pexels.com/video-files/${id}/uhd.mp4`,
      },
      {
        id: id * 10 + 2,
        quality: 'hd',
        file_type: 'video/mp4',
        width: portrait ? 1080 : 1920,
        height: portrait ? 1920 : 1080,
        fps: 30,
        link: `https://videos.pexels.com/video-files/${id}/hd.mp4`,
      },
      {
        id: id * 10 + 3,
        quality: 'sd',
        file_type: 'video/mp4',
        width: 540,
        height: 960,
        fps: 30,
        link: `https://videos.pexels.com/video-files/${id}/sd.mp4`,
      },
    ],
    ...overrides,
  }
}

export function pexelsPhoto(id: number) {
  return {
    id,
    width: 4000,
    height: 3000,
    alt: `fotografija ${id}`,
    url: `https://www.pexels.com/photo/${id}/`,
    photographer: `Fotograf ${id}`,
    photographer_url: `https://www.pexels.com/@fotograf${id}`,
    src: {
      original: `https://images.pexels.com/photos/${id}/original.jpeg`,
      large2x: `https://images.pexels.com/photos/${id}/large2x.jpeg`,
      large: `https://images.pexels.com/photos/${id}/large.jpeg`,
      medium: `https://images.pexels.com/photos/${id}/medium.jpeg`,
      portrait: `https://images.pexels.com/photos/${id}/portrait.jpeg`,
      tiny: `https://images.pexels.com/photos/${id}/tiny.jpeg`,
    },
  }
}

export const pexelsHandlers = [
  http.get('https://api.pexels.com/videos/search', ({ request }) => {
    if (request.headers.get('authorization') !== 'test-pexels-key-0123456789')
      return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
    const url = new URL(request.url)
    visualsState.pexelsSearches.push(
      `video:${url.searchParams.get('query')}:${url.searchParams.get('orientation') ?? ''}`,
    )
    if (visualsState.pexelsEmpty) return HttpResponse.json({ videos: [] })
    // neparni su uspravni i kratki (Reels, priča), parni vodoravni i dugi
    return HttpResponse.json({
      videos: [pexelsVideo(101), pexelsVideo(202), pexelsVideo(303), pexelsVideo(505), pexelsVideo(707)],
    })
  }),
  http.get('https://api.pexels.com/videos/videos/:id', ({ params }) =>
    HttpResponse.json(pexelsVideo(Number(params.id))),
  ),
  http.get('https://api.pexels.com/v1/search', ({ request }) => {
    const url = new URL(request.url)
    visualsState.pexelsSearches.push(
      `photo:${url.searchParams.get('query')}:${url.searchParams.get('orientation') ?? ''}`,
    )
    if (visualsState.pexelsEmpty) return HttpResponse.json({ photos: [] })
    return HttpResponse.json({ photos: [pexelsPhoto(301), pexelsPhoto(302), pexelsPhoto(303)] })
  }),
  http.get('https://api.pexels.com/v1/photos/:id', ({ params }) =>
    HttpResponse.json(pexelsPhoto(Number(params.id))),
  ),
  http.get('https://videos.pexels.com/*', ({ request }) => {
    // svaki snimak ima svoje bajtove, kao pravi fajlovi (isti hash bi se spojio sa drugim medijem)
    const id = Number(new URL(request.url).pathname.split('/')[2] ?? 0)
    const mp4 = buildMp4({ durationMs: 12_000, width: 1080, height: 1920, mdatBytes: 20_000 + id })
    return new HttpResponse(new Uint8Array(mp4), { headers: { 'content-type': 'video/mp4' } })
  }),
  http.get('https://images.pexels.com/*', async ({ request }) => {
    const url = new URL(request.url)
    const w = Number(url.searchParams.get('w') ?? 1200)
    const h = Number(url.searchParams.get('h') ?? Math.round(w * 0.75))
    const jpg = await sharp({
      create: {
        width: Math.min(w, 2000),
        height: Math.min(h, 2000),
        channels: 3,
        background: { r: 40, g: 90, b: 160 },
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer()
    return new HttpResponse(new Uint8Array(jpg), { headers: { 'content-type': 'image/jpeg' } })
  }),
]

export const rankReply = {
  ranking: [
    { index: 2, score: 9.2, reason: 'Mirna površina, uklapa se u stil.' },
    { index: 0, score: 7.5, reason: 'Relevantno, malo zauzeto.' },
    { index: 1, score: 5, reason: 'Previše teksta.' },
    { index: 3, score: 3, reason: 'Neprirodne boje.' },
  ],
}
