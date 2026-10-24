import { http, HttpResponse } from 'msw'
import sharp from 'sharp'

/**
 * MSW mock za Unsplash API, Unsplash CDN i Canva Connect API (faza 7).
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
}

const photoCache = new Map<string, Buffer>()
async function photoBytes(id: string, w: number): Promise<Buffer> {
  const key = `${id}:${w}`
  let buf = photoCache.get(key)
  if (!buf) {
    const seed = id.charCodeAt(id.length - 1)
    buf = await sharp({
      create: {
        width: w,
        height: Math.round(w * 0.66),
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
    const results = ['a1', 'b2', 'c3', 'd4'].map((id) => unsplashPhoto(id))
    return HttpResponse.json(
      { total: 4, total_pages: 1, results },
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
    const w = Number(url.searchParams.get('w') ?? 1080)
    const buf = await photoBytes(id, Math.min(w, 2000))
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
  http.post('https://api.canva.com/rest/v1/exports', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    visualsState.canvaExports.push(body)
    return HttpResponse.json({ job: { id: 'export-job-1', status: 'in_progress' } })
  }),
  http.get('https://api.canva.com/rest/v1/exports/:id', () =>
    HttpResponse.json({
      job: {
        id: 'export-job-1',
        status: 'success',
        urls: ['https://export-download.canva.com/DAF-1/page1.png?token=abc'],
      },
    }),
  ),
  http.get('https://export-download.canva.com/*', async () => {
    const png = await sharp({
      create: { width: 640, height: 640, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer()
    return new HttpResponse(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
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
