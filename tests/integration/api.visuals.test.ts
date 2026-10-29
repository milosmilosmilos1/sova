import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueVisualTemplateJob: vi.fn(async () => {}),
    enqueueImageJob: vi.fn(async () => {}),
    enqueueCanvaVideoExport: vi.fn(async () => {}),
  }
})

import { GET as jobGet } from '@/app/api/ai/jobs/[id]/route'
import { POST as templatePost } from '@/app/api/ai/visual/template/route'
import { DELETE as canvaDisconnect } from '@/app/api/canva/connection/route'
import { GET as canvaDesignsGet, POST as canvaDesignsPost } from '@/app/api/canva/designs/route'
import { POST as canvaExportPost } from '@/app/api/canva/export/route'
import { GET as canvaStatusGet } from '@/app/api/canva/status/route'
import { GET as canvaCallbackGet } from '@/app/api/integrations/canva/callback/route'
import { GET as canvaConnectGet } from '@/app/api/integrations/canva/connect/route'
import { POST as uploadPost } from '@/app/api/media/upload/route'
import { GET as pexelsSearchGet } from '@/app/api/pexels/search/route'
import { POST as pexelsSelectPost } from '@/app/api/pexels/select/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { GET as unsplashSearchGet } from '@/app/api/unsplash/search/route'
import { POST as unsplashSelectPost } from '@/app/api/unsplash/select/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { setFeatureFlagForTests } from '@/lib/flags'
import { enqueueCanvaVideoExport } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { resetPexelsCacheForTests } from '@/integrations/pexels/client'
import { attributionFor, resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { collectCanvaVideoExport, failCanvaVideoExport, startCanvaVideoExport } from '@/services/canva/video'
import { runVisualTemplate } from '@/services/visuals/template'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import {
  canvaHandlers,
  pexelsHandlers,
  rankReply,
  resetVisualsState,
  unsplashHandlers,
  visualsState,
} from './visuals-mock'

let user: TestUser
let wsId = ''
let brandId = ''
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

interface JobView {
  id: string
  status: string
  tokensCharged: number
  assetUrl: string | null
  assetId: string | null
  errorMessage: string | null
  output: {
    template?: string
    attribution?: string | null
    image?: { kind: string; photoId?: string }
    notes?: string[]
  } | null
  model: string | null
}

async function balance(): Promise<number> {
  const r = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
    token: user.token,
    query: { workspaceId: wsId },
  })
  return r.json.data!.balance.available
}

async function job(id: string): Promise<JobView> {
  const r = await call<JobView>(jobGet, `/api/ai/jobs/${id}`, { token: user.token, params: { id } })
  return r.json.data!
}

async function uploadPng(): Promise<string> {
  const png = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 60, b: 60 } },
  })
    .png()
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(png)], 'foto.png', { type: 'image/png' }))
  form.set('workspaceId', wsId)
  form.set('brandId', brandId)
  const { NextRequest } = await import('next/server')
  const req = new NextRequest(new URL('/api/media/upload', APP), {
    method: 'POST',
    body: form,
    headers: { origin: APP, authorization: `Bearer ${user.token}` },
  })
  const res = await uploadPost(req, { params: Promise.resolve({}) })
  const json = (await res.json()) as { ok: boolean; data?: { id: string } }
  if (!json.ok) throw new Error('upload failed')
  return json.data!.id
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...canvaHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  setFeatureFlagForTests('canva', true)
  user = await createTestUser('vis')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Vizuali test', type: 'business', websiteUrl: 'fixture-site.test' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  resetVisualsState()
  resetUnsplashCacheForTests()
  resetPexelsCacheForTests()
})

afterAll(async () => {
  setFeatureFlagForTests('canva', null)
  geminiServer.close()
  await deleteTestUser(user)
})

describe('Unsplash', () => {
  it('pretraga vraća hotlink preglede sa atribucijom, keširano drugi put, 429 za potrošen limit', async () => {
    const r = await call<{
      configured: boolean
      results: Array<{ id: string; preview: string; attribution: { html: string } }>
      cached: boolean
    }>(unsplashSearchGet, '/api/unsplash/search', {
      token: user.token,
      query: { query: 'kancelarija', orientation: 'squarish' },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.configured).toBe(true)
    expect(r.json.data!.results).toHaveLength(4)
    expect(r.json.data!.results[0]!.preview).toMatch(/images\.unsplash\.com.*ixid=.*w=600/)
    expect(r.json.data!.results[0]!.attribution.html).toContain('utm_source=sova')
    const again = await call<{ cached: boolean }>(unsplashSearchGet, '/api/unsplash/search', {
      token: user.token,
      query: { query: 'kancelarija', orientation: 'squarish' },
    })
    expect(again.json.data!.cached).toBe(true)
    expect(visualsState.unsplashSearches).toBe(1)
    const limited = await call(unsplashSearchGet, '/api/unsplash/search', {
      token: user.token,
      query: { query: 'ratelimit' },
    })
    expect(limited.status).toBe(429)
    const short = await call(unsplashSearchGet, '/api/unsplash/search', {
      token: user.token,
      query: { query: 'k' },
    })
    expect(short.status).toBe(400)
  })

  it('izbor fotografije beleži preuzimanje i čuva kopiju; ponovni izbor koristi postojeću', async () => {
    const r = await call<{ id: string; url: string; attribution: { text: string }; reused: boolean }>(
      unsplashSelectPost,
      '/api/unsplash/select',
      {
        token: user.token,
        body: { brandId, photoId: 'a1' },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data!.reused).toBe(false)
    expect(r.json.data!.attribution.text).toBe('Photo by Fotograf a1 on Unsplash')
    expect(visualsState.unsplashDownloads).toEqual(['a1'])
    const { data: asset } = await admin
      .from('media_assets')
      .select('source, bucket, source_data, attribution')
      .eq('id', r.json.data!.id)
      .single()
    expect(asset).toMatchObject({ source: 'unsplash', bucket: 'uploads' })
    expect((asset!.source_data as { photoId: string }).photoId).toBe('a1')
    const again = await call<{ id: string; reused: boolean }>(unsplashSelectPost, '/api/unsplash/select', {
      token: user.token,
      body: { brandId, photoId: 'a1' },
    })
    expect(again.json.data!.reused).toBe(true)
    expect(again.json.data!.id).toBe(r.json.data!.id)
    const missing = await call(unsplashSelectPost, '/api/unsplash/select', {
      token: user.token,
      body: { brandId, photoId: 'missing' },
    })
    expect(missing.status).toBe(404)
  })
})

describe('Vizual iz šablona', () => {
  it('Unsplash pretraga + vision rangiranje + render → 2 tokena, atribucija i izabrana fotografija', async () => {
    const start = await balance()
    const r = await call<{ generationId: string; tokensReserved: number }>(
      templatePost,
      '/api/ai/visual/template',
      {
        token: user.token,
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: {
          brandId,
          headline: 'Čist vazduh u svakoj prostoriji',
          subtext: 'Servis klime od 2.990 din.',
          cta: 'Zakažite',
          aspectRatio: '4:5',
          image: { kind: 'unsplash', query: 'klima uređaj' },
        },
      },
    )
    expect(r.status).toBe(202)
    expect(r.json.data!.tokensReserved).toBe(2)
    expect(await balance()).toBe(start - 2)
    enqueueReply({ kind: 'text', json: rankReply })
    expect((await runVisualTemplate(r.json.data!.generationId)).status).toBe('succeeded')
    const j = await job(r.json.data!.generationId)
    expect(j.status).toBe('succeeded')
    expect(j.tokensCharged).toBe(2)
    expect(j.assetUrl).toMatch(/^http/)
    expect(j.output?.image?.photoId).toBe('c3') // index 2 iz rangiranja
    expect(j.output?.attribution).toBe('Photo by Fotograf c3 on Unsplash')
    expect(j.output?.template).toBe('photo-overlay')
    expect(j.model).toBe(process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.6-flash')
    expect(calls).toHaveLength(1)
    expect(visualsState.unsplashDownloads).toEqual(['c3'])
    const { data: asset } = await admin
      .from('media_assets')
      .select('source, bucket, width, height, mime_type')
      .eq('ai_generation_id', r.json.data!.generationId)
      .single()
    expect(asset).toMatchObject({
      source: 'template',
      bucket: 'generated',
      width: 1080,
      height: 1350,
      mime_type: 'image/jpeg',
    })
    expect(await balance()).toBe(start - 2)
  })

  it('šablon bez slike i sa otpremljenom fotografijom; rangiranje preskočeno kad model padne', async () => {
    const start = await balance()
    const solid = await call<{ generationId: string }>(templatePost, '/api/ai/visual/template', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        brandId,
        headline: 'Otvoreni smo i nedeljom',
        aspectRatio: '1:1',
        image: { kind: 'none' },
        template: 'solid',
        format: 'png',
      },
    })
    expect((await runVisualTemplate(solid.json.data!.generationId)).status).toBe('succeeded')
    const js = await job(solid.json.data!.generationId)
    expect(js.output?.template).toBe('solid')
    expect(js.model).toBeNull()
    expect(calls).toHaveLength(0)

    const assetId = await uploadPng()
    const withAsset = await call<{ generationId: string }>(templatePost, '/api/ai/visual/template', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        brandId,
        headline: 'Naša nova lokacija',
        subtext: 'Bulevar 1, Beograd',
        aspectRatio: '16:9',
        image: { kind: 'asset', mediaAssetId: assetId },
      },
    })
    expect(withAsset.status).toBe(202)
    expect((await runVisualTemplate(withAsset.json.data!.generationId)).status).toBe('succeeded')
    const ja = await job(withAsset.json.data!.generationId)
    expect(ja.output?.image?.kind).toBe('asset')
    expect(['photo-overlay', 'split']).toContain(ja.output?.template)

    // rangiranje pada (500 pa 500 pa 500 → fallback model takođe) → prvi rezultat pretrage, posao uspeva
    enqueueReply(
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
    )
    const degraded = await call<{ generationId: string }>(templatePost, '/api/ai/visual/template', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        brandId,
        headline: 'Popust 20 % ove nedelje',
        image: { kind: 'unsplash', query: 'prodavnica' },
      },
    })
    expect((await runVisualTemplate(degraded.json.data!.generationId)).status).toBe('succeeded')
    const jd = await job(degraded.json.data!.generationId)
    expect(jd.output?.image?.photoId).toBe('a1')
    expect(jd.output?.notes?.join(' ')).toMatch(/Rangiranje preskočeno/)
    expect(await balance()).toBe(start - 6)
  }, 60_000)

  it('bez Idempotency-Key 400; nepostojeća fotografija → posao failed i tokeni vraćeni', async () => {
    const noKey = await call(templatePost, '/api/ai/visual/template', {
      token: user.token,
      body: { brandId, headline: 'Naslov bez ključa' },
    })
    expect(noKey.status).toBe(400)
    const start = await balance()
    const r = await call<{ generationId: string }>(templatePost, '/api/ai/visual/template', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { brandId, headline: 'Nepostojeća fotografija', image: { kind: 'unsplash', photoId: 'missing' } },
    })
    expect(r.status).toBe(202)
    expect((await runVisualTemplate(r.json.data!.generationId)).status).toBe('failed')
    const j = await job(r.json.data!.generationId)
    expect(j.status).toBe('failed')
    expect(j.errorMessage).toMatch(/Unsplash/)
    expect(await balance()).toBe(start)
  })
})

describe('Canva Connect', () => {
  let state = ''
  it('status pre povezivanja; connect pravi PKCE state i preusmerava na Canvu', async () => {
    const s = await call<{ configured: boolean; enabled: boolean; connected: boolean }>(
      canvaStatusGet,
      '/api/canva/status',
      { token: user.token, query: { workspaceId: wsId } },
    )
    expect(s.json.data).toMatchObject({ configured: true, enabled: true, connected: false })
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(
      new URL(`/api/integrations/canva/connect?workspaceId=${wsId}&redirectTo=/app/studio`, APP),
      { headers: { authorization: `Bearer ${user.token}` } },
    )
    const res = await canvaConnectGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://www.canva.com/api/oauth/authorize')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('client_id')).toBe('test-canva-client')
    expect(location.searchParams.get('scope')).toContain('design:content:write')
    expect(location.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/canva/callback`)
    state = location.searchParams.get('state')!
    expect(state.length).toBeGreaterThan(20)
    const { data: rows } = await admin
      .from('oauth_states')
      .select('provider, used_at, code_verifier_enc')
      .eq('workspace_id', wsId)
    expect(rows).toHaveLength(1)
    expect(rows![0]!.used_at).toBeNull()
    expect(rows![0]!.code_verifier_enc).toBeTruthy()
  })

  it('callback menja kod za tokene, šifruje ih i upisuje vezu; ponovljen state ne prolazi', async () => {
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(
      new URL(`/api/integrations/canva/callback?state=${state}&code=good-code`, APP),
      { headers: { authorization: `Bearer ${user.token}` } },
    )
    const res = await canvaCallbackGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${APP}/app/studio`)
    expect(visualsState.canvaTokenCalls[0]).toMatchObject({
      grant_type: 'authorization_code',
      code: 'good-code',
    })
    expect(visualsState.canvaTokenCalls[0]!.code_verifier!.length).toBeGreaterThan(40)
    const { data: conn } = await admin
      .from('canva_connections')
      .select('*')
      .eq('workspace_id', wsId)
      .eq('user_id', user.id)
      .single()
    expect(conn).toMatchObject({
      canva_user_id: 'canva-user-1',
      team_id: 'team-1',
      autofill_available: false,
      status: 'active',
      key_version: 1,
    })
    expect(String(conn!.access_token_enc)).not.toContain('access-1')
    const s = await call<{ connected: boolean; autofillAvailable: boolean }>(
      canvaStatusGet,
      '/api/canva/status',
      { token: user.token, query: { workspaceId: wsId } },
    )
    expect(s.json.data).toMatchObject({ connected: true, autofillAvailable: false })
    const replay = await canvaCallbackGet(
      new NextRequest(new URL(`/api/integrations/canva/callback?state=${state}&code=good-code`, APP), {
        headers: { authorization: `Bearer ${user.token}` },
      }),
      { params: Promise.resolve({}) },
    )
    expect(replay.status).toBe(400)
  })

  it('dizajn od slike iz biblioteke (upload u Canvu + edit_url, 2 tokena) i export u biblioteku (2 tokena)', async () => {
    const start = await balance()
    const assetId = await uploadPng()
    const d = await call<{ design: { id: string; editUrl: string }; tokensCharged: number }>(
      canvaDesignsPost,
      '/api/canva/designs',
      {
        token: user.token,
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: { brandId, mediaAssetId: assetId, title: 'Test dizajn' },
      },
    )
    expect(d.status).toBe(200)
    expect(d.json.data!.design.editUrl).toContain('canva.com/design')
    expect(d.json.data!.tokensCharged).toBe(2)
    expect(visualsState.canvaUploads).toBe(1)
    expect(visualsState.canvaDesigns[0]).toMatchObject({ asset_id: 'asset-xyz', title: 'Test dizajn' })
    expect(await balance()).toBe(start - 2)

    const e = await call<{ asset: { id: string; url: string; mimeType: string }; tokensCharged: number }>(
      canvaExportPost,
      '/api/canva/export',
      {
        token: user.token,
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: { brandId, designId: d.json.data!.design.id, format: 'png' },
      },
    )
    expect(e.status).toBe(200)
    expect(e.json.data!.asset.mimeType).toBe('image/png')
    // bez širine: besplatna Canva ne uvećava dizajn više od 1,125 puta (D-104)
    expect(visualsState.canvaExports[0]).toEqual({
      design_id: d.json.data!.design.id,
      format: { type: 'png' },
    })
    const { data: asset } = await admin
      .from('media_assets')
      .select('source, bucket')
      .eq('id', e.json.data!.asset.id)
      .single()
    expect(asset).toMatchObject({ source: 'canva', bucket: 'uploads' })
    expect(await balance()).toBe(start - 4)
  })

  it('lista dizajna iz Canve: poslednji menjani prvi, sledeća strana i pretraga, bez tokena', async () => {
    type Page = {
      items: Array<{ id: string; title: string; thumbnail: { width: number; height: number; url: string } }>
      continuation: string | null
    }
    const start = await balance()
    const first = await call<Page>(canvaDesignsGet, '/api/canva/designs', {
      token: user.token,
      query: { workspaceId: wsId },
    })
    expect(first.status).toBe(200)
    expect(first.json.data!.items.map((d) => d.id)).toEqual(['DVID-1', 'DVID-2'])
    expect(first.json.data!.items[0]).toMatchObject({
      title: 'Reel jesen',
      thumbnail: { width: 270, height: 480 },
    })
    expect(first.json.data!.continuation).toBe('strana-2')
    expect(visualsState.canvaDesignLists[0]).toContain('sort_by=modified_descending')

    const next = await call<Page>(canvaDesignsGet, '/api/canva/designs', {
      token: user.token,
      query: { workspaceId: wsId, continuation: 'strana-2' },
    })
    expect(next.json.data!.items.map((d) => d.id)).toEqual(['DVID-3'])
    expect(next.json.data!.continuation).toBeNull()

    const none = await call<Page>(canvaDesignsGet, '/api/canva/designs', {
      token: user.token,
      query: { workspaceId: wsId, query: 'nista' },
    })
    expect(none.json.data!.items).toEqual([])
    expect(visualsState.canvaDesignLists[2]).toContain('query=nista')
    expect(visualsState.canvaDesignLists[2]).not.toContain('sort_by')
    expect(await balance()).toBe(start)
  })

  it('video iz Canve: 202 pa pozadinski posao; vertikalni 1080p MP4 u biblioteci za 2 tokena', async () => {
    const start = await balance()
    const r = await call<{ generationId: string; status: string; tokensReserved: number }>(
      canvaExportPost,
      '/api/canva/export',
      {
        token: user.token,
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: { brandId, designId: 'DVID-1', format: 'mp4' },
      },
    )
    expect(r.status).toBe(202)
    expect(r.json.data).toMatchObject({ status: 'queued', tokensReserved: 2 })
    const id = r.json.data!.generationId
    expect(enqueueCanvaVideoExport).toHaveBeenCalledWith(id, wsId)
    expect(await balance()).toBe(start - 2)

    expect(await startCanvaVideoExport(id, '1080p')).toEqual({
      status: 'started',
      jobId: 'export-mp4-vertical_1080p',
    })
    expect(visualsState.canvaExports.at(-1)).toEqual({
      design_id: 'DVID-1',
      format: { type: 'mp4', quality: 'vertical_1080p' },
    })
    expect(await collectCanvaVideoExport(id, 'export-mp4-vertical_1080p', '1080p')).toEqual({
      status: 'in_progress',
    })
    expect((await job(id)).status).toBe('running')
    expect(await collectCanvaVideoExport(id, 'export-mp4-vertical_1080p', '1080p')).toEqual({
      status: 'succeeded',
    })

    const done = await job(id)
    expect(done).toMatchObject({ status: 'succeeded', tokensCharged: 2 })
    expect(done.assetUrl).toContain('/storage/v1/object/sign/uploads/')
    const { data: asset } = await admin
      .from('media_assets')
      .select('kind, source, mime_type, width, height, duration_ms, ai_generation_id, tags, storage_path')
      .eq('id', done.assetId!)
      .single()
    expect(asset).toMatchObject({
      kind: 'video',
      source: 'canva',
      mime_type: 'video/mp4',
      width: 1080,
      height: 1920,
      duration_ms: 12_000,
      ai_generation_id: id,
      tags: ['canva'],
    })
    expect(asset!.storage_path).toContain('/canva/')
    expect(await balance()).toBe(start - 2)
    // Inngest može da ponovi korak posle uspeha: ništa se ne radi dvaput
    expect(await collectCanvaVideoExport(id, 'export-mp4-vertical_1080p', '1080p')).toEqual({
      status: 'skipped',
    })
  })

  it('video: prevelik 1080p prelazi na 720p; Pro elementi i isteklo čekanje vraćaju tokene', async () => {
    const exportVideo = (designId: string) =>
      call<{ generationId: string }>(canvaExportPost, '/api/canva/export', {
        token: user.token,
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: { brandId, designId, format: 'mp4' },
      })
    visualsState.canvaVideoTooLarge = true
    const start = await balance()
    const id = (await exportVideo('DVID-WIDE')).json.data!.generationId
    expect(await startCanvaVideoExport(id, '1080p')).toMatchObject({ jobId: 'export-mp4-horizontal_1080p' })
    await collectCanvaVideoExport(id, 'export-mp4-horizontal_1080p', '1080p')
    expect(await collectCanvaVideoExport(id, 'export-mp4-horizontal_1080p', '1080p')).toEqual({
      status: 'too_large',
    })
    expect((await job(id)).status).toBe('running')
    expect(await startCanvaVideoExport(id, '720p')).toMatchObject({ jobId: 'export-mp4-horizontal_720p' })
    expect(await collectCanvaVideoExport(id, 'export-mp4-horizontal_720p', '720p')).toEqual({
      status: 'succeeded',
    })
    expect(await balance()).toBe(start - 2)

    const proId = (await exportVideo('DVID-PRO')).json.data!.generationId
    expect(await startCanvaVideoExport(proId, '1080p')).toEqual({ status: 'failed' })
    const pro = await job(proId)
    expect(pro.status).toBe('failed')
    expect(pro.errorMessage).toContain('Pro')

    const slowId = (await exportVideo('DVID-1')).json.data!.generationId
    await startCanvaVideoExport(slowId, '1080p')
    expect(await failCanvaVideoExport(slowId, 'timeout')).toEqual({ status: 'failed' })
    expect((await job(slowId)).errorMessage).toContain('predugo')
    expect(await balance()).toBe(start - 2)
  })

  it('istekao token se osvežava (rotacija), a opozvan refresh označava needs_reauth', async () => {
    await admin
      .from('canva_connections')
      .update({ token_expires_at: new Date(Date.now() + 30_000).toISOString() })
      .eq('workspace_id', wsId)
    const d = await call<{ design: { id: string } }>(canvaDesignsPost, '/api/canva/designs', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { brandId, title: 'Bez slike' },
    })
    expect(d.status).toBe(200)
    expect(visualsState.canvaTokenCalls[0]).toMatchObject({ grant_type: 'refresh_token' })
    const { data: conn } = await admin
      .from('canva_connections')
      .select('token_expires_at')
      .eq('workspace_id', wsId)
      .single()
    expect(new Date(conn!.token_expires_at).getTime()).toBeGreaterThan(Date.now() + 3_600_000)

    await admin
      .from('canva_connections')
      .update({ token_expires_at: new Date(Date.now() + 30_000).toISOString() })
      .eq('workspace_id', wsId)
    visualsState.canvaRefreshFails = true
    const start = await balance()
    const fail = await call(canvaDesignsPost, '/api/canva/designs', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { brandId, title: 'Pada' },
    })
    expect(fail.status).toBe(403)
    expect(await balance()).toBe(start)
    const s = await call<{ connected: boolean; status: string }>(canvaStatusGet, '/api/canva/status', {
      token: user.token,
      query: { workspaceId: wsId },
    })
    expect(s.json.data).toMatchObject({ connected: false, status: 'needs_reauth' })

    const del = await call<{ disconnected: boolean }>(canvaDisconnect, '/api/canva/connection', {
      method: 'DELETE',
      token: user.token,
      query: { workspaceId: wsId },
    })
    expect(del.json.data!.disconnected).toBe(true)
    const after = await call<{ connected: boolean; status: string | null }>(
      canvaStatusGet,
      '/api/canva/status',
      { token: user.token, query: { workspaceId: wsId } },
    )
    expect(after.json.data!.status).toBeNull()
  })
})

describe('Unsplash atribucija', () => {
  it('ime fotografa u HTML-u je escape-ovano, linkovi nose UTM', () => {
    const a = attributionFor({
      user: { name: 'Ana <img src=x onerror=alert(1)>', profileUrl: 'https://unsplash.com/@ana' },
      htmlLink: 'https://unsplash.com/photos/abc',
    } as Parameters<typeof attributionFor>[0])
    expect(a.html).not.toContain('<img')
    expect(a.html).toContain('Ana &lt;img src=x onerror=alert(1)&gt;')
    expect(a.photographerUrl).toBe('https://unsplash.com/@ana?utm_source=sova&utm_medium=referral')
    expect(a.unsplashUrl).toContain('utm_medium=referral')
  })
})

describe('Pexels (D-107)', () => {
  type SearchView = {
    configured: boolean
    results: Array<{
      id: number
      kind: string
      durationSec: number | null
      attribution: { text: string; pageUrl: string }
    }>
  }
  type SelectView = {
    id: string
    kind: string
    width: number | null
    height: number | null
    durationMs: number | null
    attribution: { text: string }
    reused: boolean
  }

  it('pretraga snimaka i fotografija: pregledi sa autorom, drugi put iz keša, kratak upit 400', async () => {
    const q = { query: 'kafić noću', kind: 'video', orientation: 'portrait' }
    const r = await call<SearchView>(pexelsSearchGet, '/api/pexels/search', { token: user.token, query: q })
    expect(r.status).toBe(200)
    expect(r.json.data!.configured).toBe(true)
    expect(r.json.data!.results.map((x) => x.id)).toEqual([101, 202])
    expect(r.json.data!.results[0]).toMatchObject({
      kind: 'video',
      durationSec: 12,
      attribution: { text: 'Video by Autor 101 on Pexels', pageUrl: 'https://www.pexels.com/video/101/' },
    })
    await call(pexelsSearchGet, '/api/pexels/search', { token: user.token, query: q })
    expect(visualsState.pexelsSearches).toEqual(['video:kafić noću:portrait'])
    const photos = await call<SearchView>(pexelsSearchGet, '/api/pexels/search', {
      token: user.token,
      query: { query: 'kafić noću', kind: 'photo' },
    })
    expect(photos.json.data!.results.map((x) => x.kind)).toEqual(['photo', 'photo', 'photo'])
    expect(photos.json.data!.results[0]!.attribution.text).toBe('Photo by Fotograf 301 on Pexels')
    const short = await call(pexelsSearchGet, '/api/pexels/search', {
      token: user.token,
      query: { query: 'k' },
    })
    expect(short.status).toBe(400)
  })

  it('izbor snimka čuva MP4 sa autorom, ponovni izbor koristi isti; fotografija se čuva cela', async () => {
    const r = await call<SelectView>(pexelsSelectPost, '/api/pexels/select', {
      token: user.token,
      body: { brandId, id: 101, kind: 'video' },
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      kind: 'video',
      reused: false,
      durationMs: 12_000,
      attribution: { text: 'Video by Autor 101 on Pexels' },
    })
    const { data: asset } = await admin
      .from('media_assets')
      .select('source, kind, mime_type, source_data')
      .eq('id', r.json.data!.id)
      .single()
    expect(asset).toMatchObject({ source: 'pexels', kind: 'video', mime_type: 'video/mp4' })
    // najbolji fajl do 1080 px po kraćoj strani: hd, ne uhd
    expect(asset!.source_data).toMatchObject({ pexelsId: 101, kind: 'video', quality: 'hd' })
    const again = await call<SelectView>(pexelsSelectPost, '/api/pexels/select', {
      token: user.token,
      body: { brandId, id: 101, kind: 'video' },
    })
    expect(again.json.data).toMatchObject({ id: r.json.data!.id, reused: true })
    const photo = await call<SelectView>(pexelsSelectPost, '/api/pexels/select', {
      token: user.token,
      body: { brandId, id: 301, kind: 'photo' },
    })
    expect(photo.status).toBe(200)
    expect(photo.json.data).toMatchObject({
      kind: 'image',
      reused: false,
      attribution: { text: 'Photo by Fotograf 301 on Pexels' },
    })
    expect(photo.json.data!.width!).toBeGreaterThan(photo.json.data!.height!)
  })
})
