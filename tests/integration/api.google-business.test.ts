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

import { NextRequest } from 'next/server'
import sharp from 'sharp'

import { GET as callbackGet } from '@/app/api/integrations/[provider]/callback/route'
import { GET as connectGet } from '@/app/api/integrations/[provider]/connect/route'
import { POST as uploadPost } from '@/app/api/media/upload/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { DELETE as accountDelete } from '@/app/api/social-accounts/[id]/route'
import { POST as activatePost } from '@/app/api/social-accounts/activate/route'
import { GET as accountsGet } from '@/app/api/social-accounts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { setGoogleBusinessProviderForTests } from '@/integrations/social/registry'
import { captureAccountMetrics, capturePostMetrics } from '@/services/analytics/metrics'
import { runPublishTarget, type PublishContext } from '@/services/posts/publisher'
import { loadAccountRow, tokensFor } from '@/services/social/account-rows'
import { importAccountHistory } from '@/services/social/history'
import { accessTokenFor } from '@/services/social/tokens'

import { geminiServer } from './gemini-mock'
import { gState, googleHandlers, resetGoogleState } from './google-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let wsId = ''
let brandId = ''
let novisadId = ''
let beogradId = ''

const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async () => {},
  sendEvent: async () => {},
  runId: 'test-run-8c-gbp',
}

interface PostView {
  id: string
  status: string
  version: number
  targets: Array<{ id: string; scheduledAt: string | null }>
}
interface AccountView {
  id: string
  name: string
  username: string | null
  accountType: string
  status: string
  capabilities: Record<string, boolean>
}

function authed(path: string): NextRequest {
  return new NextRequest(new URL(path, APP), {
    headers: { authorization: `Bearer ${owner.token}`, origin: APP },
  })
}

async function uploadJpeg(width = 1200, height = 900): Promise<string> {
  // šum, da JPEG bude veći od 10 KB (Google odbija manje fotografije)
  const jpeg = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 110, b: 190 },
      noise: { type: 'gaussian', mean: 120, sigma: 40 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(jpeg)], 'lokal.jpg', { type: 'image/jpeg' }))
  form.set('workspaceId', wsId)
  form.set('brandId', brandId)
  const req = new NextRequest(new URL('/api/media/upload', APP), {
    method: 'POST',
    body: form,
    headers: { origin: APP, authorization: `Bearer ${owner.token}` },
  })
  const json = (await (await uploadPost(req, { params: Promise.resolve({}) })).json()) as {
    data?: { id: string }
  }
  return json.data!.id
}

let slot = 3
async function createPost(body: Record<string, unknown>): Promise<PostView> {
  const r = await call<PostView>(postsPost, '/api/posts', { token: owner.token, body: { brandId, ...body } })
  if (r.status !== 201) throw new Error(JSON.stringify(r.json.error))
  return r.json.data!
}

async function schedule(p: PostView) {
  const when = new Date(Date.now() + slot++ * 60_000)
  when.setSeconds(0, 0)
  const s = await call<PostView>(actionPost, `/api/posts/${p.id}/schedule`, {
    token: owner.token,
    params: { id: p.id, action: 'schedule' },
    body: { version: p.version, scheduledFor: when.toISOString() },
  })
  return s
}

async function scheduled(body: Record<string, unknown>) {
  const p = await createPost(body)
  const s = await schedule(p)
  if (s.status !== 200) throw new Error(`schedule: ${JSON.stringify(s.json.error)}`)
  const t = s.json.data!.targets[0]!
  return {
    post: s.json.data!,
    job: { targetId: t.id, scheduledAt: t.scheduledAt!, version: s.json.data!.version },
  }
}

async function target(id: string) {
  return (await admin.from('post_targets').select('*').eq('id', id).single()).data!
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...googleHandlers)
  setGoogleBusinessProviderForTests({})
  setFeatureFlagForTests('platform.google_business', true)
  owner = await createTestUser('gbp')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Google poslovni profil test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  setGoogleBusinessProviderForTests(null)
  setFeatureFlagForTests('platform.google_business', null)
  geminiServer.resetHandlers()
  geminiServer.close()
  await deleteTestUser(owner)
})

describe('Povezivanje (Google OAuth, nalozi i lokacije)', () => {
  it('OAuth sa offline pristupom, obe lokacije kroz dve strane, lokacija bez prava objave', async () => {
    resetGoogleState()
    const res = await connectGet(authed(`/api/integrations/google_business/connect?brandId=${brandId}`), {
      params: Promise.resolve({ provider: 'google_business' }),
    })
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(loc.searchParams.get('access_type')).toBe('offline')
    expect(loc.searchParams.get('prompt')).toBe('consent')
    expect(loc.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/business.manage')
    expect(loc.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/google_business/callback`)
    expect(loc.searchParams.get('code_challenge')).toBeNull()

    const back = await callbackGet(
      authed(
        `/api/integrations/google_business/callback?state=${loc.searchParams.get('state')}&code=gbp-code`,
      ),
      { params: Promise.resolve({ provider: 'google_business' }) },
    )
    expect(back.status).toBe(302)
    expect(gState.tokenRequests[0]).toMatchObject({
      grant_type: 'authorization_code',
      code: 'gbp-code',
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${APP}/api/integrations/google_business/callback`,
    })
    const pendingState = new URL(back.headers.get('location')!).searchParams.get('pending')!
    const list = await call<{ pending: AccountView[] }>(accountsGet, '/api/social-accounts', {
      token: owner.token,
      query: { brandId, pending: pendingState },
    })
    const pending = list.json.data!.pending
    expect(pending.map((a) => a.name).sort()).toEqual(['Klima Servis Beograd', 'Klima Servis Novi Sad'])
    const ns = pending.find((a) => a.name === 'Klima Servis Novi Sad')!
    const bg = pending.find((a) => a.name === 'Klima Servis Beograd')!
    expect(ns).toMatchObject({ accountType: 'google_business_location', username: 'Novi Sad' })
    expect(ns.capabilities.publish).toBe(true)
    expect(bg.capabilities.publish).toBe(false)
    const act = await call<AccountView[]>(activatePost, '/api/social-accounts/activate', {
      token: owner.token,
      body: { brandId, pendingState, ids: [ns.id, bg.id] },
    })
    expect(act.status).toBe(200)
    novisadId = ns.id
    beogradId = bg.id
    const row = await loadAccountRow(novisadId)
    expect(row!.external_parent_id).toBe('111')
    expect(row!.external_id).toBe('9001')
    expect(tokensFor(row!).refreshToken).toBe('g-refresh-1')
    expect((row!.metadata as Record<string, unknown>).providerUserId).toBe('1098765432100')
  })
})

describe('Objavljivanje', () => {
  it('fotografija i dugme „Saznajte više” sa linkom objave; jezik brenda; detaljne greške (format 2)', async () => {
    gState.posts = []
    const asset = await uploadJpeg()
    const { job } = await scheduled({
      masterText: 'Servis klime za 30 minuta, termini ove nedelje u Novom Sadu.',
      linkUrl: 'https://tangerineseo.rs/servis',
      targets: [{ socialAccountId: novisadId, options: { google_business: { actionType: 'LEARN_MORE' } } }],
      media: [{ mediaAssetId: asset }],
    })
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    const body = gState.posts.at(-1)!
    expect(body).toMatchObject({
      languageCode: 'sr',
      topicType: 'STANDARD',
      summary: expect.stringContaining('Servis klime'),
    })
    expect((body.callToAction as { actionType: string; url: string }).actionType).toBe('LEARN_MORE')
    expect((body.callToAction as { url: string }).url).toContain('https://tangerineseo.rs/servis')
    const media = body.media as Array<{ mediaFormat: string; sourceUrl: string }>
    expect(media).toHaveLength(1)
    expect(media[0]!.mediaFormat).toBe('PHOTO')
    expect(media[0]!.sourceUrl).toContain('/storage/v1/object/sign/')
    expect(gState.postHeaders.at(-1)!['x-goog-api-format-version']).toBe('2')
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toMatch(/^accounts\/111\/locations\/9001\/localPosts\/lp-\d+$/)
    expect(t.permalink).toContain('local.google.com')
  })

  it('događaj: bez naslova i vremena provera ne prolazi; sa njima ide raspored po lokalnom vremenu', async () => {
    const bad = await createPost({
      masterText: 'Dan otvorenih vrata u servisu, dođite na kafu i proveru klime.',
      targets: [
        {
          socialAccountId: novisadId,
          options: { google_business: { topicType: 'EVENT', actionType: 'NONE' } },
        },
      ],
    })
    const v = await call<{ ok: boolean; problems: Array<{ problems: string[] }> }>(
      actionPost,
      `/api/posts/${bad.id}/validate`,
      { token: owner.token, params: { id: bad.id, action: 'validate' }, body: {} },
    )
    expect(v.json.data!.ok).toBe(false)
    expect(v.json.data!.problems.flatMap((p) => p.problems).join(' ')).toContain('traže naslov')

    const { job } = await scheduled({
      masterText: 'Dan otvorenih vrata u servisu, dođite na kafu i proveru klime.',
      targets: [
        {
          socialAccountId: novisadId,
          options: {
            google_business: {
              topicType: 'EVENT',
              actionType: 'CALL',
              eventTitle: 'Dan otvorenih vrata',
              eventStart: '2026-11-07T10:00',
              eventEnd: '2026-11-07T16:30',
            },
          },
        },
      ],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const body = gState.posts.at(-1)!
    expect(body.topicType).toBe('EVENT')
    expect(body.callToAction).toEqual({ actionType: 'CALL' })
    expect(body.event).toEqual({
      title: 'Dan otvorenih vrata',
      schedule: {
        startDate: { year: 2026, month: 11, day: 7 },
        startTime: { hours: 10, minutes: 0, seconds: 0, nanos: 0 },
        endDate: { year: 2026, month: 11, day: 7 },
        endTime: { hours: 16, minutes: 30, seconds: 0, nanos: 0 },
      },
    })
  })

  it('Google odbije objavu (pravila sadržaja) → target pada sa objašnjenjem; 503 → novi pokušaj', async () => {
    const rejected = await scheduled({
      masterText: 'ODBIJ ovu objavu jer sadrži nešto što Google ne dozvoljava u tekstu.',
      targets: [{ socialAccountId: novisadId, options: { google_business: { actionType: 'NONE' } } }],
    })
    expect((await runPublishTarget(rejected.job, ctx)).outcome).toBe('failed')
    expect((await target(rejected.job.targetId)).last_error_message).toContain('Google je odbio objavu')

    gState.postFailuresLeft = 1
    const retried = await scheduled({
      masterText: 'Posle kratkog prekida kod Google-a objava ipak prolazi iz drugog pokušaja.',
      targets: [{ socialAccountId: novisadId, options: { google_business: { actionType: 'NONE' } } }],
    })
    const report = await runPublishTarget(retried.job, ctx)
    expect(report.outcome).toBe('published')
    expect(report.attempts).toBe(2)
  })

  it('lokacija bez prava objave i video ne prolaze proveru', async () => {
    const p = await createPost({
      masterText: 'Objava za lokaciju koju Google još nije potvrdio za objavljivanje.',
      targets: [{ socialAccountId: beogradId, options: { google_business: { actionType: 'NONE' } } }],
    })
    const v = await call<{ ok: boolean; problems: Array<{ problems: string[] }> }>(
      actionPost,
      `/api/posts/${p.id}/validate`,
      { token: owner.token, params: { id: p.id, action: 'validate' }, body: {} },
    )
    expect(v.json.data!.problems.flatMap((x) => x.problems).join(' ')).toContain(
      'ne dozvoljava objave za ovu lokaciju',
    )
  })
})

describe('Tokeni, metrike, istorija i odvajanje', () => {
  it('istekao pristupni token se osvežava; Google ne menja refresh token', async () => {
    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', novisadId)
    const row = await loadAccountRow(novisadId)
    const token = await accessTokenFor(row!)
    expect(token).toMatch(/^g-token-refreshed-\d+$/)
    expect(gState.tokenRequests.at(-1)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'g-refresh-1',
    })
    const fresh = await loadAccountRow(novisadId)
    expect(tokensFor(fresh!).refreshToken).toBe('g-refresh-1')
    expect(new Date(fresh!.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000)
  })

  it('dnevne metrike lokacije (izostala vrednost = 0); objave nemaju metrike; istorija se uvozi', async () => {
    const r = await captureAccountMetrics(novisadId, '2026-10-22')
    expect(r.status).toBe('captured')
    expect(gState.metricsQueries.at(-1)).toContain('dailyMetrics=WEBSITE_CLICKS')
    const { data: m } = await admin
      .from('account_metrics_daily')
      .select('impressions, website_clicks, raw')
      .eq('social_account_id', novisadId)
      .eq('date', '2026-10-22')
      .single()
    expect(m).toMatchObject({ impressions: 12 + 30 + 41, website_clicks: 5, raw: { engagement: 5 + 2 + 1 } })

    const { data: published } = await admin
      .from('post_targets')
      .select('id')
      .eq('social_account_id', novisadId)
      .eq('status', 'published')
      .limit(1)
      .single()
    const pm = await capturePostMetrics(published!.id, '24h')
    expect(pm).toMatchObject({ status: 'skipped' })
    expect(pm.reason).toContain('nema metrike objava')

    const imported = await importAccountHistory(novisadId)
    expect(imported.imported).toBeGreaterThan(0)
  })

  it('odvajanje: dok druga lokacija istog Google naloga ostaje, Google se ne opoziva; posle poslednje da', async () => {
    gState.revokes = []
    const first = await call(accountDelete, `/api/social-accounts/${beogradId}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: beogradId },
    })
    expect(first.status).toBe(200)
    expect(gState.revokes).toEqual([])
    const last = await call(accountDelete, `/api/social-accounts/${novisadId}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: novisadId },
    })
    expect(last.status).toBe(200)
    expect(gState.revokes).toEqual(['g-refresh-1'])
  })
})
