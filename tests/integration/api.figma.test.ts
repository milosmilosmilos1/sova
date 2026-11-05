import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as brandPost } from '@/app/api/figma/brand/route'
import { DELETE as connectionDelete } from '@/app/api/figma/connection/route'
import { GET as framesGet } from '@/app/api/figma/frames/route'
import { POST as importPost } from '@/app/api/figma/import/route'
import { GET as statusGet } from '@/app/api/figma/status/route'
import { GET as callbackGet } from '@/app/api/integrations/figma/callback/route'
import { GET as connectGet } from '@/app/api/integrations/figma/connect/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { clearFlagCache, setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'

import { figmaHandlers, figmaState, resetFigmaState } from './figma-mock'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Uvoz iz Figme (D-161): prekidač po radnom prostoru, prijava sa PKCE i šifrovanim tokenima, okviri
 * sa sličicama (strana i sekcija, bez slobodnog teksta), uvoz izabranih okvira kao JPG u biblioteku
 * redom izbora, predlog boja, fontova i logoa, obnova pristupa i prekid veze.
 */
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const LINK = 'https://www.figma.com/design/KlimaFajl1234567/Klima24-objave?node-id=1-2'
let user: TestUser
let wsId = ''
let brandId = ''

const raw = (handler: typeof connectGet, path: string) =>
  handler(new NextRequest(new URL(path, APP), { headers: { authorization: `Bearer ${user.token}` } }), {
    params: Promise.resolve({}),
  })

beforeAll(async () => {
  configureFontLoader({ remote: false })
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...figmaHandlers)
  user = await createTestUser('figma')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Figma prostor', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterAll(async () => {
  setFeatureFlagForTests('figma', null)
  clearFlagCache()
  resetMemoryRateLimit()
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('uvoz iz Figme (D-161)', () => {
  let state = ''

  it('isključen prekidač: status kaže da nije uključeno, a povezivanje se odbija', async () => {
    setFeatureFlagForTests('figma', false)
    const s = await call<{ configured: boolean; enabled: boolean }>(statusGet, '/api/figma/status', {
      token: user.token,
      query: { workspaceId: wsId },
    })
    expect(s.json.data).toMatchObject({ configured: true, enabled: false })
    const res = await raw(connectGet, `/api/integrations/figma/connect?workspaceId=${wsId}`)
    expect(res.status).toBe(403)
  })

  it('uključen prekidač: prijava sa PKCE, kod se menja za tokene koji se čuvaju šifrovani', async () => {
    setFeatureFlagForTests('figma', true)
    const res = await raw(
      connectGet,
      `/api/integrations/figma/connect?workspaceId=${wsId}&redirectTo=/app/studio/tools`,
    )
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://www.figma.com/oauth')
    expect(location.searchParams.get('client_id')).toBe('test-figma-client')
    expect(location.searchParams.get('scope')).toBe('file_content:read file_metadata:read')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/figma/callback`)
    state = location.searchParams.get('state')!

    const back = await raw(callbackGet, `/api/integrations/figma/callback?state=${state}&code=good-code`)
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toBe(`${APP}/app/studio/tools`)
    expect(figmaState.tokenCalls[0]).toMatchObject({ grant_type: 'authorization_code', code: 'good-code' })
    expect(figmaState.tokenCalls[0]!.code_verifier!.length).toBeGreaterThan(40)
    const { data: conn } = await admin.from('figma_connections').select('*').eq('workspace_id', wsId).single()
    expect(conn).toMatchObject({
      figma_user_id: '1234567890',
      status: 'active',
      scopes: ['file_content:read', 'file_metadata:read'],
    })
    expect(String(conn!.access_token_enc)).not.toContain('figma-access-1')
    const s = await call<{ connected: boolean }>(statusGet, '/api/figma/status', {
      token: user.token,
      query: { workspaceId: wsId },
    })
    expect(s.json.data!.connected).toBe(true)
    // ponovljen povratak sa istim state-om ne prolazi
    expect(
      (await raw(callbackGet, `/api/integrations/figma/callback?state=${state}&code=good-code`)).status,
    ).toBe(400)
  })

  it('okviri fajla: strane i sekcije, bez slobodnog teksta, sličice u jednom pozivu, okvir iz linka izabran', async () => {
    resetFigmaState()
    const r = await call<{
      fileKey: string
      fileName: string
      frames: Array<{ id: string; page: string; thumb: string | null }>
      selected: string | null
    }>(framesGet, '/api/figma/frames', { token: user.token, query: { workspaceId: wsId, url: LINK } })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      fileKey: 'KlimaFajl1234567',
      fileName: 'Klima24 objave',
      selected: '1:2',
    })
    expect(r.json.data!.frames.map((f) => [f.id, f.page])).toEqual([
      ['1:1', 'Karusel'],
      ['1:2', 'Karusel'],
      ['2:2', 'Priče'],
    ])
    expect(r.json.data!.frames.every((f) => f.thumb?.startsWith('https://figma-alpha-api.s3'))).toBe(true)
    expect(figmaState.fileCalls).toBe(1)
    expect(figmaState.imageCalls).toHaveLength(1)
    expect(figmaState.authHeaders.every((h) => h === 'Bearer figma-access-1')).toBe(true)

    const bad = await call(framesGet, '/api/figma/frames', {
      token: user.token,
      query: { workspaceId: wsId, url: 'https://www.figma.com/board/KlimaFajl1234567/FigJam' },
    })
    expect(bad.status).toBe(400)
    const closed = await call(framesGet, '/api/figma/frames', {
      token: user.token,
      query: { workspaceId: wsId, url: 'https://www.figma.com/design/NemaPristupa0000/x' },
    })
    expect(closed.status).toBe(404)
    const limited = await call(framesGet, '/api/figma/frames', {
      token: user.token,
      query: { workspaceId: wsId, url: 'https://www.figma.com/design/Ograniceno00000/x' },
    })
    expect(limited.status).toBe(429)
  })

  it('uvoz izabranih okvira: JPG u biblioteci redom izbora, razmera za 1080 px, okvir bez slike se prijavljuje', async () => {
    resetFigmaState()
    const r = await call<{ assets: Array<{ nodeId: string; url: string; width: number }>; failed: string[] }>(
      importPost,
      '/api/figma/import',
      {
        token: user.token,
        body: {
          brandId,
          fileKey: 'KlimaFajl1234567',
          frames: [
            { id: '1:2', name: 'Slajd 2', width: 1080 },
            { id: '1:1', name: 'Slajd 1', width: 1080 },
            { id: '9:9', name: 'Prazan', width: 1080 },
          ],
        },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data!.assets.map((a) => a.nodeId)).toEqual(['1:2', '1:1'])
    expect(r.json.data!.failed).toEqual(['Prazan'])
    expect(figmaState.imageCalls).toEqual([{ ids: '1:2,1:1,9:9', scale: '1' }])
    const { data: assets } = await admin
      .from('media_assets')
      .select('mime_type, tags, source, source_data, width')
      .eq('brand_id', brandId)
      .contains('tags', ['figma'])
    expect(assets).toHaveLength(2)
    expect(
      assets!.every((a) => a.mime_type === 'image/jpeg' && a.source === 'upload' && a.width === 1080),
    ).toBe(true)
    expect(assets![0]!.source_data).toMatchObject({ provider: 'figma', fileKey: 'KlimaFajl1234567' })
  })

  it('brend iz okvira: boje, fontovi i logo (sloj „Logo”) kao predlog; logo je u biblioteci', async () => {
    resetFigmaState()
    const r = await call<{
      primary: string
      secondary: string
      background: string
      fonts: { headings: string; body: string; headingsGoogle: boolean; bodyGoogle: boolean }
      logo: { assetId: string; url: string } | null
    }>(brandPost, '/api/figma/brand', {
      token: user.token,
      body: { brandId, fileKey: 'KlimaFajl1234567', nodeIds: ['1:1'] },
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      primary: '#F26B1D',
      secondary: '#12325A',
      background: '#FFF8F0',
      fonts: { headings: 'Montserrat', body: 'Inter' },
    })
    expect(r.json.data!.logo?.assetId).toBeTruthy()
    expect(figmaState.nodeCalls).toBe(1)
    expect(figmaState.imageCalls).toEqual([{ ids: '1:8', scale: '2' }])
  })

  it('pristup pred istek se obnavlja istim refresh tokenom; odbijena obnova traži ponovno povezivanje', async () => {
    resetFigmaState()
    await admin
      .from('figma_connections')
      .update({ token_expires_at: new Date(Date.now() + 3600_000).toISOString() })
      .eq('workspace_id', wsId)
    const r = await call(framesGet, '/api/figma/frames', {
      token: user.token,
      query: { workspaceId: wsId, url: LINK },
    })
    expect(r.status).toBe(200)
    expect(figmaState.refreshCalls).toBe(1)
    expect(figmaState.authHeaders.at(-1)).toBe('Bearer figma-access-2')

    figmaState.refreshFails = true
    await admin
      .from('figma_connections')
      .update({ token_expires_at: new Date(Date.now() + 3600_000).toISOString() })
      .eq('workspace_id', wsId)
    const failed = await call(framesGet, '/api/figma/frames', {
      token: user.token,
      query: { workspaceId: wsId, url: LINK },
    })
    expect(failed.status).toBe(403)
    const { data: conn } = await admin
      .from('figma_connections')
      .select('status')
      .eq('workspace_id', wsId)
      .single()
    expect(conn!.status).toBe('needs_reauth')
  })

  it('prekid veze briše tokene', async () => {
    const r = await call(connectionDelete, '/api/figma/connection', {
      token: user.token,
      method: 'DELETE',
      query: { workspaceId: wsId },
    })
    expect(r.status).toBe(200)
    const { data } = await admin.from('figma_connections').select('id').eq('workspace_id', wsId)
    expect(data).toHaveLength(0)
  })
})
