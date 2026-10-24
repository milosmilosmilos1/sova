import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueHistoryImport: vi.fn(async () => {}),
    enqueueTargetScheduled: vi.fn(async () => {}),
    enqueueTargetUnscheduled: vi.fn(async () => {}),
  }
})

import { createHash } from 'node:crypto'

import { NextRequest } from 'next/server'
import sharp from 'sharp'

import { GET as callbackGet } from '@/app/api/integrations/[provider]/callback/route'
import { GET as connectGet } from '@/app/api/integrations/[provider]/connect/route'
import { POST as completePost } from '@/app/api/media/complete/route'
import { POST as uploadUrlPost } from '@/app/api/media/upload-url/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { DELETE as accountDelete } from '@/app/api/social-accounts/[id]/route'
import { POST as activatePost } from '@/app/api/social-accounts/activate/route'
import { GET as accountsGet } from '@/app/api/social-accounts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { getTokenBalance, releaseReservation, reserveTokens } from '@/lib/tokens/reservation'
import { setXProviderForTests } from '@/integrations/social/registry'
import { capturePostMetrics } from '@/services/analytics/metrics'
import { runPublishTarget, type PublishContext } from '@/services/posts/publisher'
import { loadAccountRow, tokensFor } from '@/services/social/account-rows'
import { importAccountHistory } from '@/services/social/history'
import { accessTokenFor } from '@/services/social/tokens'

import { buildMp4 } from '../fixtures/mp4'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { resetXState, xHandlers, xState } from './x-mock'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let wsId = ''
let brandId = ''
let xId = ''

const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async () => {},
  sendEvent: async () => {},
  runId: 'test-run-8d-x',
}

interface PostView {
  id: string
  version: number
  targets: Array<{ id: string; scheduledAt: string | null }>
}

function authed(path: string): NextRequest {
  return new NextRequest(new URL(path, APP), {
    headers: { authorization: `Bearer ${owner.token}`, origin: APP },
  })
}

async function upload(bytes: Buffer, mimeType: string, name: string): Promise<string> {
  const t = await call<{ uploadId: string; signedUrl: string }>(uploadUrlPost, '/api/media/upload-url', {
    token: owner.token,
    body: { brandId, mimeType, sizeBytes: bytes.length },
  })
  const put = await fetch(t.json.data!.signedUrl, {
    method: 'PUT',
    headers: { 'content-type': mimeType, 'x-upsert': 'false' },
    body: new Uint8Array(bytes),
  })
  expect(put.status).toBe(200)
  const done = await call<{ id: string }>(completePost, '/api/media/complete', {
    token: owner.token,
    body: { brandId, uploadId: t.json.data!.uploadId, originalName: name },
  })
  if (done.status !== 200) throw new Error(JSON.stringify(done.json.error))
  return done.json.data!.id
}

let slot = 3
async function scheduled(body: Record<string, unknown>) {
  const created = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: { brandId, targets: [{ socialAccountId: xId }], ...body },
  })
  if (created.status !== 201) throw new Error(JSON.stringify(created.json.error))
  const p = created.json.data!
  const when = new Date(Date.now() + slot++ * 60_000)
  when.setSeconds(0, 0)
  const s = await call<PostView>(actionPost, `/api/posts/${p.id}/schedule`, {
    token: owner.token,
    params: { id: p.id, action: 'schedule' },
    body: { version: p.version, scheduledFor: when.toISOString() },
  })
  if (s.status !== 200) throw new Error(`schedule: ${JSON.stringify(s.json.error)}`)
  const t = s.json.data!.targets[0]!
  return { targetId: t.id, scheduledAt: t.scheduledAt!, version: s.json.data!.version }
}

async function target(id: string) {
  return (await admin.from('post_targets').select('*').eq('id', id).single()).data!
}

const available = async () => (await getTokenBalance(wsId)).available

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...xHandlers)
  setXProviderForTests({})
  setFeatureFlagForTests('platform.x', true)
  resetXState()
  owner = await createTestUser('x')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'X test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  setXProviderForTests(null)
  setFeatureFlagForTests('platform.x', null)
  geminiServer.resetHandlers()
  geminiServer.close()
  await deleteTestUser(owner)
})

describe('Povezivanje sa PKCE', () => {
  it('izazov S256 u adresi, verifier u razmeni koda, poverljiv klijent kroz Basic', async () => {
    const res = await connectGet(authed(`/api/integrations/x/connect?brandId=${brandId}`), {
      params: Promise.resolve({ provider: 'x' }),
    })
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://x.com/i/oauth2/authorize')
    expect(loc.searchParams.get('scope')).toBe('tweet.read tweet.write users.read offline.access media.write')
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256')
    const challenge = loc.searchParams.get('code_challenge')!
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const back = await callbackGet(
      authed(`/api/integrations/x/callback?state=${loc.searchParams.get('state')}&code=x-code`),
      { params: Promise.resolve({ provider: 'x' }) },
    )
    const req = xState.tokenRequests[0]!
    expect(req.authorization).toBe(
      `Basic ${Buffer.from('test-x-client-id:test-x-client-secret-0123456789').toString('base64')}`,
    )
    expect(req.form.client_id).toBeUndefined()
    expect(createHash('sha256').update(req.form.code_verifier!).digest('base64url')).toBe(challenge)
    const pendingState = new URL(back.headers.get('location')!).searchParams.get('pending')!
    const list = await call<{ pending: Array<{ id: string; name: string; username: string | null }> }>(
      accountsGet,
      '/api/social-accounts',
      { token: owner.token, query: { brandId, pending: pendingState } },
    )
    expect(list.json.data!.pending[0]).toMatchObject({ name: 'Klima Servis', username: 'klimaservis' })
    xId = list.json.data!.pending[0]!.id
    await call(activatePost, '/api/social-accounts/activate', {
      token: owner.token,
      body: { brandId, pendingState, ids: [xId] },
    })
    const row = await loadAccountRow(xId)
    expect(row!.metadata).toMatchObject({ username: 'klimaservis', followers: 870 })
    expect(tokensFor(row!).refreshToken).toBe('xr-1')
  })
})

describe('Objavljivanje i naplata u tokenima', () => {
  it('sa linkom: link ide u tekst, naplaćeno 6 tokena; bez linka 1 token', async () => {
    const before = await available()
    const withLink = await scheduled({
      masterText: 'Ponuda za servis klime ove nedelje',
      linkUrl: 'https://tangerineseo.rs/servis',
    })
    expect((await runPublishTarget(withLink, ctx)).outcome).toBe('published')
    const sent = xState.posts.at(-1)!
    expect(String(sent.text)).toMatch(
      /^Ponuda za servis klime ove nedelje\n\nhttps:\/\/tangerineseo\.rs\/servis\?utm_/,
    )
    expect(sent.media).toBeUndefined()
    const t = await target(withLink.targetId)
    expect(t.permalink).toBe(`https://x.com/klimaservis/status/${t.external_post_id}`)
    expect(await available()).toBe(before - 6)

    const plain = await scheduled({ masterText: 'Samo kratak tekst bez linka, dobro jutro' })
    expect((await runPublishTarget(plain, ctx)).outcome).toBe('published')
    expect(await available()).toBe(before - 7)
  })

  it('domen bez https:// u tekstu se naplaćuje kao link', async () => {
    const before = await available()
    const job = await scheduled({ masterText: 'Zakažite na tangerineseo.rs ili pozovite' })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    expect(await available()).toBe(before - 6)
  })

  it('dve slike: upload kao tweet_image, opis slike kroz metadata, media_ids u objavi', async () => {
    const jpeg = (r: number) =>
      sharp({ create: { width: 1200, height: 900, channels: 3, background: { r, g: 30, b: 90 } } })
        .jpeg()
        .toBuffer()
    const a = await upload(await jpeg(40), 'image/jpeg', 'a.jpg')
    const b = await upload(await jpeg(200), 'image/jpeg', 'b.jpg')
    await admin.from('media_assets').update({ alt_text: 'Serviser čisti filter klime' }).eq('id', a)
    xState.imageUploads = []
    xState.metadata = []
    const job = await scheduled({
      masterText: 'Pre i posle servisa',
      media: [{ mediaAssetId: a }, { mediaAssetId: b }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    expect(xState.imageUploads.map((u) => u.category)).toEqual(['tweet_image', 'tweet_image'])
    expect(xState.metadata).toEqual([
      { id: 'm-img-1', metadata: { alt_text: { text: 'Serviser čisti filter klime' } } },
    ])
    expect(xState.posts.at(-1)!.media).toEqual({ media_ids: ['m-img-1', 'm-img-2'] })
  })

  it('video: initialize, append, finalize, obrada, pa objava; tokeni se potvrde posle obrade', async () => {
    const video = await upload(
      buildMp4({ width: 1080, height: 1920, durationMs: 20_000, mdatBytes: 90_000 }),
      'video/mp4',
      'x.mp4',
    )
    const { data: asset } = await admin.from('media_assets').select('size_bytes').eq('id', video).single()
    xState.statusPolls = 0
    xState.statusQueue = ['in_progress', 'succeeded']
    const before = await available()
    const job = await scheduled({ masterText: 'Servis za 20 sekundi', media: [{ mediaAssetId: video }] })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    expect(xState.videoInits.at(-1)).toEqual({
      media_type: 'video/mp4',
      total_bytes: asset!.size_bytes,
      media_category: 'tweet_video',
    })
    expect(xState.appends.at(-1)).toMatchObject({ segment: '0', size: asset!.size_bytes })
    expect(xState.statusPolls).toBe(2)
    expect(xState.posts.at(-1)!.media).toEqual({ media_ids: [expect.stringMatching(/^m-vid-\d+$/)] })
    const balance = await getTokenBalance(wsId)
    expect(balance.available).toBe(before - 1)
    expect(balance.reserved).toBe(0)
  })

  it('bez dovoljno tokena objava pada sa porukom; duplikat i potrošeni X krediti ne troše tokene', async () => {
    const hold = await reserveTokens({ workspaceId: wsId, amount: await available(), ttlMinutes: 5 })
    const poor = await scheduled({ masterText: 'Objava kad nema tokena' })
    expect((await runPublishTarget(poor, ctx)).outcome).toBe('failed')
    expect((await target(poor.targetId)).last_error_message).toContain('Nema dovoljno tokena za objavu na X')
    await releaseReservation(hold, 'test')

    const before = await available()
    const dup = await scheduled({ masterText: 'DUPLIKAT objava koju je X već video' })
    expect((await runPublishTarget(dup, ctx)).outcome).toBe('failed')
    expect(await available()).toBe(before)

    xState.creditsDepleted = true
    const depleted = await scheduled({ masterText: 'Objava kad Sovi ponestane X kredita' })
    const report = await runPublishTarget(depleted, ctx)
    xState.creditsDepleted = false
    expect(report.outcome).toBe('rescheduled')
    expect((await target(depleted.targetId)).last_error_message).toContain('X krediti')
    expect(await available()).toBe(before)
    expect((await getTokenBalance(wsId)).reserved).toBe(0)
  })
})

describe('Tokeni, metrike, istorija, odvajanje', () => {
  it('istekao pristupni token: osvežavanje vraća nov refresh token koji se čuva', async () => {
    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', xId)
    expect(await accessTokenFor((await loadAccountRow(xId))!)).toBe('xa-refreshed-2')
    expect(xState.tokenRequests.at(-1)!.form).toEqual({ grant_type: 'refresh_token', refresh_token: 'xr-1' })
    expect(tokensFor((await loadAccountRow(xId))!).refreshToken).toBe('xr-2')
  })

  it('metrike samo za 24 h i 7 dana (repost_count se čita); istorija najviše 20 objava', async () => {
    const { data: published } = await admin
      .from('post_targets')
      .select('id')
      .eq('social_account_id', xId)
      .eq('status', 'published')
      .limit(1)
      .single()
    expect((await capturePostMetrics(published!.id, '1h')).reason).toContain('ne prati')
    expect((await capturePostMetrics(published!.id, '24h')).status).toBe('captured')
    const { data: snap } = await admin
      .from('post_metrics_snapshots')
      .select('impressions, reactions, comments, shares, saves, link_clicks')
      .eq('target_id', published!.id)
      .eq('horizon', '24h')
      .single()
    expect(snap).toEqual({
      impressions: 900,
      reactions: 25,
      comments: 4,
      shares: 4,
      saves: 2,
      link_clicks: 12,
    })

    const imported = await importAccountHistory(xId)
    expect(imported.imported).toBeGreaterThan(0)
    expect(xState.historyQueries.at(-1)).toContain('max_results=20')
  })

  it('odvajanje opoziva refresh token kod X-a', async () => {
    const r = await call(accountDelete, `/api/social-accounts/${xId}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: xId },
    })
    expect(r.status).toBe(200)
    expect(xState.revokes.at(-1)).toEqual({ token: 'xr-2', token_type_hint: 'refresh_token' })
  })
})
