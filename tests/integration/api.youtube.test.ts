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

import { GET as callbackGet } from '@/app/api/integrations/[provider]/callback/route'
import { GET as connectGet } from '@/app/api/integrations/[provider]/connect/route'
import { POST as completePost } from '@/app/api/media/complete/route'
import { POST as uploadUrlPost } from '@/app/api/media/upload-url/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { POST as activatePost } from '@/app/api/social-accounts/activate/route'
import { GET as accountsGet } from '@/app/api/social-accounts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { setYouTubeProviderForTests } from '@/integrations/social/registry'
import { captureAccountMetrics, capturePostMetrics } from '@/services/analytics/metrics'
import { runPublishTarget, type PublishContext } from '@/services/posts/publisher'
import { importAccountHistory } from '@/services/social/history'

import { buildMp4 } from '../fixtures/mp4'
import { geminiServer } from './gemini-mock'
import { googleHandlers, resetGoogleState, resetYouTubeState, ytState } from './google-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let brandId = ''
let channelId = ''

const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async () => {},
  sendEvent: async () => {},
  runId: 'test-run-8c-yt',
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

async function connect(): Promise<{
  redirect: string
  pending: Array<{ id: string; name: string; username: string | null }>
}> {
  const res = await connectGet(authed(`/api/integrations/youtube/connect?brandId=${brandId}`), {
    params: Promise.resolve({ provider: 'youtube' }),
  })
  const loc = new URL(res.headers.get('location')!)
  expect(loc.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/youtube.upload')
  expect(loc.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/youtube.readonly')
  expect(loc.searchParams.get('scope')).not.toContain('force-ssl')
  const back = await callbackGet(
    authed(`/api/integrations/youtube/callback?state=${loc.searchParams.get('state')}&code=youtube-code`),
    { params: Promise.resolve({ provider: 'youtube' }) },
  )
  const redirect = back.headers.get('location')!
  const pendingState = new URL(redirect).searchParams.get('pending')
  if (!pendingState) return { redirect, pending: [] }
  const list = await call<{ pending: Array<{ id: string; name: string; username: string | null }> }>(
    accountsGet,
    '/api/social-accounts',
    { token: owner.token, query: { brandId, pending: pendingState } },
  )
  const pending = list.json.data!.pending
  await call(activatePost, '/api/social-accounts/activate', {
    token: owner.token,
    body: { brandId, pendingState, ids: pending.map((a) => a.id) },
  })
  return { redirect, pending }
}

async function uploadVideo(opts: Parameters<typeof buildMp4>[0]): Promise<string> {
  const bytes = buildMp4(opts)
  const t = await call<{ uploadId: string; signedUrl: string }>(uploadUrlPost, '/api/media/upload-url', {
    token: owner.token,
    body: { brandId, mimeType: 'video/mp4', sizeBytes: bytes.length },
  })
  const put = await fetch(t.json.data!.signedUrl, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'x-upsert': 'false' },
    body: new Uint8Array(bytes),
  })
  expect(put.status).toBe(200)
  const done = await call<{ id: string }>(completePost, '/api/media/complete', {
    token: owner.token,
    body: { brandId, uploadId: t.json.data!.uploadId, originalName: 'short.mp4' },
  })
  if (done.status !== 200) throw new Error(JSON.stringify(done.json.error))
  return done.json.data!.id
}

const yt = (extra: Record<string, unknown> = {}) => ({
  youtube: { privacy: 'unlisted', madeForKids: false, ...extra },
})

let slot = 3
async function createPost(body: Record<string, unknown>): Promise<PostView> {
  const r = await call<PostView>(postsPost, '/api/posts', { token: owner.token, body: { brandId, ...body } })
  if (r.status !== 201) throw new Error(JSON.stringify(r.json.error))
  return r.json.data!
}

async function problemsOf(postId: string): Promise<string> {
  const v = await call<{ problems: Array<{ problems: string[] }> }>(
    actionPost,
    `/api/posts/${postId}/validate`,
    {
      token: owner.token,
      params: { id: postId, action: 'validate' },
      body: {},
    },
  )
  return v.json.data!.problems.flatMap((p) => p.problems).join(' ')
}

async function scheduled(body: Record<string, unknown>) {
  const p = await createPost(body)
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

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...googleHandlers)
  setYouTubeProviderForTests({})
  setFeatureFlagForTests('platform.youtube', true)
  resetGoogleState()
  resetYouTubeState()
  owner = await createTestUser('yt')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'YouTube Shorts test', type: 'business' },
  })
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  setYouTubeProviderForTests(null)
  setFeatureFlagForTests('platform.youtube', null)
  geminiServer.resetHandlers()
  geminiServer.close()
  await deleteTestUser(owner)
})

describe('Povezivanje kanala', () => {
  it('Google nalog bez kanala → poruka; sa kanalom → nalog sa pratiocima i plejlistom otpremanja', async () => {
    ytState.signupRequired = true
    const empty = await connect()
    expect(empty.redirect).toContain('connect=empty')
    expect(empty.redirect).toContain('provider=youtube')
    ytState.signupRequired = false

    const ok = await connect()
    expect(ok.pending).toHaveLength(1)
    expect(ok.pending[0]).toMatchObject({ name: 'Klima Servis TV', username: '@klimaservis' })
    channelId = ok.pending[0]!.id
    const { data: row } = await admin.from('social_accounts').select('*').eq('id', channelId).single()
    expect(row!.external_id).toBe('UC-klima-servis')
    expect(row!.metadata).toMatchObject({ uploadsPlaylistId: 'UU-klima-servis', followers: 1530 })
  })
})

describe('Provera objave (Shorts pravila)', () => {
  it('fotografija, položen video, video duži od 3 minuta i izjava za decu', async () => {
    const landscape = await uploadVideo({ width: 1920, height: 1080, durationMs: 20_000 })
    const p1 = await createPost({
      masterText: 'Položen video za proveru pravila',
      title: 'Položen video',
      targets: [{ socialAccountId: channelId, options: yt() }],
      media: [{ mediaAssetId: landscape }],
    })
    expect(await problemsOf(p1.id)).toContain('vertikalan ili kvadratan')

    const long = await uploadVideo({ width: 1080, height: 1920, durationMs: 200_000 })
    const p2 = await createPost({
      masterText: 'Predugačak video',
      title: 'Dug video',
      targets: [{ socialAccountId: channelId, options: { youtube: { privacy: 'public' } } }],
      media: [{ mediaAssetId: long }],
    })
    const problems = await problemsOf(p2.id)
    expect(problems).toContain('najviše 3 minuta')
    expect(problems).toContain('namenjen deci')

    const p3 = await createPost({
      masterText: 'Samo tekst bez videa',
      targets: [{ socialAccountId: channelId, options: yt() }],
    })
    expect(await problemsOf(p3.id)).toContain('tačno jedan video')
  })
})

describe('Objavljivanje', () => {
  it('resumable upload sa metapodacima, obrada pa link na Short', async () => {
    const video = await uploadVideo({ width: 1080, height: 1920, durationMs: 45_000, mdatBytes: 300_000 })
    ytState.statusQueue = ['uploaded', 'uploaded', 'processed']
    ytState.statusPolls = 0
    const job = await scheduled({
      masterText: 'Kako za 30 sekundi proveriti filter klime #klima #servis',
      title: 'Filter klime za 30 sekundi',
      targets: [{ socialAccountId: channelId, options: yt({ title: 'Filter klime za 30 sekundi' }) }],
      media: [{ mediaAssetId: video }],
    })
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    const init = ytState.inits.at(-1)!
    expect(init.body).toMatchObject({
      snippet: {
        title: 'Filter klime za 30 sekundi',
        description: 'Kako za 30 sekundi proveriti filter klime #klima #servis',
        categoryId: '22',
        defaultLanguage: 'sr',
      },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
    })
    const { data: asset } = await admin.from('media_assets').select('size_bytes').eq('id', video).single()
    expect(init.headers['x-upload-content-length']).toBe(String(asset!.size_bytes))
    expect(init.headers['x-upload-content-type']).toBe('video/mp4')
    expect(ytState.uploads.at(-1)).toEqual({ contentType: 'video/mp4', size: asset!.size_bytes })
    expect(ytState.statusPolls).toBe(3)
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toMatch(/^vid-\d+$/)
    expect(t.permalink).toBe(`https://www.youtube.com/shorts/${t.external_post_id}`)
  })

  it('YouTube odbije video (duplikat) → target pada sa razlogom', async () => {
    const video = await uploadVideo({ width: 1080, height: 1080, durationMs: 15_000, mdatBytes: 200_000 })
    ytState.statusQueue = ['rejected']
    ytState.statusPolls = 0
    ytState.rejectionReason = 'duplicate'
    const job = await scheduled({
      masterText: 'Isti video drugi put',
      title: 'Kopija',
      targets: [{ socialAccountId: channelId, options: yt() }],
      media: [{ mediaAssetId: video }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('failed')
    expect((await target(job.targetId)).last_error_message).toContain('duplikat')
  })

  it('potrošena dnevna kvota projekta → termin se pomera za 24 h', async () => {
    const video = await uploadVideo({ width: 1080, height: 1920, durationMs: 10_000, mdatBytes: 150_000 })
    ytState.quotaExceeded = true
    const job = await scheduled({
      masterText: 'Objava kad je kvota potrošena',
      title: 'Kvota',
      targets: [{ socialAccountId: channelId, options: yt() }],
      media: [{ mediaAssetId: video }],
    })
    const report = await runPublishTarget(job, ctx)
    ytState.quotaExceeded = false
    expect(report.outcome).toBe('rescheduled')
    const t = await target(job.targetId)
    expect(t.status).toBe('scheduled')
    expect(new Date(t.scheduled_at!).getTime() - new Date(job.scheduledAt).getTime()).toBe(24 * 3_600_000)
  })
})

describe('Metrike i istorija', () => {
  it('pregledi, lajkovi i komentari objave; pratioci kanala; istorija iz plejliste otpremanja', async () => {
    const { data: published } = await admin
      .from('post_targets')
      .select('id')
      .eq('social_account_id', channelId)
      .eq('status', 'published')
      .limit(1)
      .single()
    expect((await capturePostMetrics(published!.id, '24h')).status).toBe('captured')
    const { data: snap } = await admin
      .from('post_metrics_snapshots')
      .select('impressions, reactions, comments, video_views')
      .eq('target_id', published!.id)
      .single()
    expect(snap).toEqual({ impressions: 1200, reactions: 80, comments: 7, video_views: 1200 })

    expect((await captureAccountMetrics(channelId, '2026-10-22')).status).toBe('captured')
    const { data: acc } = await admin
      .from('account_metrics_daily')
      .select('followers')
      .eq('social_account_id', channelId)
      .eq('date', '2026-10-22')
      .single()
    expect(acc!.followers).toBe(1530)

    const imported = await importAccountHistory(channelId)
    expect(imported.imported).toBeGreaterThanOrEqual(2)
    const { data: hist } = await admin
      .from('historical_posts')
      .select('external_id, permalink, metrics')
      .eq('social_account_id', channelId)
      .eq('external_id', 'vid-old-1')
      .single()
    expect(hist!.permalink).toBe('https://www.youtube.com/watch?v=vid-old-1')
    expect(hist!.metrics).toMatchObject({ views: 1200, likes: 80, comments: 7 })
  })
})
