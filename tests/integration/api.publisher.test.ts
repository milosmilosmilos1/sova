import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueTargetScheduled: vi.fn(async () => {}),
    enqueueTargetUnscheduled: vi.fn(async () => {}),
    enqueueHistoryImport: vi.fn(async () => {}),
  }
})

import { NextRequest } from 'next/server'
import sharp from 'sharp'

import { POST as uploadPost } from '@/app/api/media/upload/route'
import { GET as prefsGet, PUT as prefsPut } from '@/app/api/notifications/preferences/route'
import { POST as readPost } from '@/app/api/notifications/read/route'
import { GET as notifGet } from '@/app/api/notifications/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { GET as postGet } from '@/app/api/posts/[id]/route'
import { POST as targetPost } from '@/app/api/posts/[id]/targets/[targetId]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { NOTIFICATION_TYPE_KEYS } from '@/config/notifications'
import { setMetaProviderForTests } from '@/integrations/social/registry'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { notifyUsers } from '@/services/notifications'
import {
  cancelScheduledPostsForBrand,
  handlePublishRunFailure,
  runPublishTarget,
  runWatchdog,
  setDailyLimitsForTests,
  type OutgoingEvent,
  type PublishContext,
  type PublishJob,
} from '@/services/posts/publisher'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { metaHandlers, metaState, resetMetaState } from './meta-mock'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let wsId = ''
let brandId = ''
let fbId = ''
let igAssistedId = ''
let igApiId = ''

let sent: OutgoingEvent[] = []
let sleeps: number[] = []
const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async (_name, ms) => {
    sleeps.push(ms)
  },
  sendEvent: async (_name, ev) => {
    sent.push(ev)
  },
  runId: 'test-run',
}

interface PostView {
  id: string
  status: string
  version: number
  lockedAt: string | null
  targets: Array<{
    id: string
    socialAccountId: string
    platform: string
    status: string
    scheduledAt: string | null
    externalPostId: string | null
    permalink: string | null
    lastErrorMessage: string | null
  }>
}

function enc(platform: string, externalId: string, token: string) {
  const e = encryptSecret(token, `social:${brandId}:${platform}:${externalId}`)
  return { access_token_enc: toPgBytea(e.ciphertext), key_version: e.keyVersion }
}

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function createPost(
  targets: Array<{ socialAccountId: string; text?: string }>,
  extra: Record<string, unknown> = {},
): Promise<PostView> {
  const r = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: {
      brandId,
      masterText: `Publisher test ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
      targets,
      ...extra,
    },
  })
  if (r.status !== 201) throw new Error(`createPost: ${JSON.stringify(r.json.error)}`)
  return r.json.data!
}

// svaki test dobija svoj minut: isti minut na istom nalogu je zabranjen (K8)
let slot = 2
async function schedule(id: string, version: number, when = future(slot++)): Promise<PostView> {
  const r = await call<PostView>(actionPost, `/api/posts/${id}/schedule`, {
    token: owner.token,
    params: { id, action: 'schedule' },
    body: { version, scheduledFor: when },
  })
  if (r.status !== 200) throw new Error(`schedule: ${JSON.stringify(r.json.error)}`)
  return r.json.data!
}

async function view(id: string): Promise<PostView> {
  const r = await call<PostView>(postGet, `/api/posts/${id}`, { token: owner.token, params: { id } })
  return r.json.data!
}

function jobFor(p: PostView, accountId: string): PublishJob {
  const t = p.targets.find((x) => x.socialAccountId === accountId)!
  return { targetId: t.id, scheduledAt: t.scheduledAt!, version: p.version }
}

async function targetAction(
  postId: string,
  targetId: string,
  action: string,
  body: Record<string, unknown> = {},
) {
  return call<PostView>(targetPost, `/api/posts/${postId}/targets/${targetId}/${action}`, {
    token: owner.token,
    params: { id: postId, targetId, action },
    body,
  })
}

async function uploadJpeg(): Promise<string> {
  // Instagram prihvata samo JPEG (validacija po mreži iz faze 9a)
  const png = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(png)], 'slika.jpg', { type: 'image/jpeg' }))
  form.set('workspaceId', wsId)
  form.set('brandId', brandId)
  const req = new NextRequest(new URL('/api/media/upload', APP), {
    method: 'POST',
    body: form,
    headers: { origin: APP, authorization: `Bearer ${owner.token}` },
  })
  const res = await uploadPost(req, { params: Promise.resolve({}) })
  const json = (await res.json()) as { ok: boolean; data?: { id: string } }
  if (!json.ok) throw new Error('upload failed')
  return json.data!.id
}

async function targetRow(id: string) {
  const { data } = await admin.from('post_targets').select('*').eq('id', id).single()
  return data!
}

async function attempts(targetId: string) {
  const { data } = await admin
    .from('publish_attempts')
    .select('attempt_no, outcome, error_code')
    .eq('target_id', targetId)
    .order('attempt_no')
  return data ?? []
}

async function notificationsOf(type: string, postId: string) {
  const { data } = await admin
    .from('notifications')
    .select('id, user_id, title, data')
    .eq('type', type)
    .eq('user_id', owner.id)
    .contains('data', { postId })
  return data ?? []
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...metaHandlers)
  setMetaProviderForTests({ pollIntervalMs: 0, pollAttempts: 2 })
  owner = await createTestUser('pub-owner')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Publisher test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const { data: accounts, error } = await admin
    .from('social_accounts')
    .insert([
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: 'page-1',
        name: 'Test strana',
        account_type: 'facebook_page',
        status: 'active',
        capabilities: { publish: true },
        metadata: { tasks: ['CREATE_CONTENT'] },
        assisted_only: false,
        ...enc('facebook', 'page-1', 'page-token-1'),
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: 'ig-2',
        external_parent_id: 'page-2',
        name: 'Ručni IG',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: false },
        metadata: {},
        assisted_only: true,
        ...enc('instagram', 'ig-2', 'page-token-2'),
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: 'ig-1',
        external_parent_id: 'page-1',
        name: 'API IG',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: false,
        ...enc('instagram', 'ig-1', 'page-token-1'),
      },
    ])
    .select('id, external_id')
  if (error) throw new Error('social_accounts insert: ' + error.message)
  fbId = accounts!.find((a) => a.external_id === 'page-1')!.id
  igAssistedId = accounts!.find((a) => a.external_id === 'ig-2')!.id
  igApiId = accounts!.find((a) => a.external_id === 'ig-1')!.id
})

afterEach(() => {
  resetMetaState()
  resetMemoryRateLimit()
  vi.mocked(enqueueTargetScheduled).mockClear()
  vi.mocked(enqueueTargetUnscheduled).mockClear()
  sent = []
  sleeps = []
})

afterAll(async () => {
  setMetaProviderForTests(null)
  setDailyLimitsForTests(null)
  geminiServer.close()
  await deleteTestUser(owner)
})

describe('Publisher: uspeh', () => {
  it('Facebook tekst + prvi komentar: published, publish_attempts, status objave, obaveštenje, događaj', async () => {
    const created = await createPost([{ socialAccountId: fbId }], {
      firstComment: 'Prvi komentar iz Sove',
      linkUrl: 'https://fixture-site.test/ponuda?ref=sajt',
    })
    const p = await schedule(created.id, created.version)
    expect(p.status).toBe('scheduled')
    const job = jobFor(p, fbId)

    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    expect(report.externalId).toMatch(/^page-1_/)

    const t = await targetRow(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toBe(report.externalId)
    expect(t.permalink).toBe(`https://www.facebook.com/${report.externalId}`)
    expect(t.attempt_count).toBe(1)
    expect(typeof t.publish_latency_ms).toBe('number')
    expect(t.published_at).not.toBeNull()

    expect(await attempts(job.targetId)).toEqual([{ attempt_no: 1, outcome: 'success', error_code: null }])
    const after = await view(created.id)
    expect(after.status).toBe('published')
    expect(after.lockedAt).toBeNull()

    const feed = metaState.publishes.find((x) => x.path === 'page-1/feed')
    expect(feed?.body.message).toContain('Publisher test')
    // UTM (brif 10): izvor = mreža, medium = social, kampanja = podrazumevano „sova”; postojeći parametri ostaju
    const link = new URL(feed!.body.link!)
    expect(link.searchParams.get('ref')).toBe('sajt')
    expect(link.searchParams.get('utm_source')).toBe('facebook')
    expect(link.searchParams.get('utm_medium')).toBe('social')
    expect(link.searchParams.get('utm_campaign')).toBe('sova')
    expect(metaState.publishes.some((x) => x.path.endsWith('/comments'))).toBe(true)

    expect(sent).toEqual([{ kind: 'published', targetId: job.targetId, socialAccountId: fbId, brandId }])
    const notes = await notificationsOf('post_published', created.id)
    expect(notes.length).toBe(1)
  })

  it('privremena greška mreže: pauza 60 s pa drugi pokušaj uspeva; dva reda u publish_attempts', async () => {
    const created = await createPost([{ socialAccountId: fbId }])
    const p = await schedule(created.id, created.version)
    const job = jobFor(p, fbId)
    metaState.feedFailuresLeft = 1

    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    expect(report.attempts).toBe(2)
    expect(sleeps).toEqual([60_000])
    expect((await attempts(job.targetId)).map((a) => a.outcome)).toEqual(['retryable_error', 'success'])
    const t = await targetRow(job.targetId)
    expect(t.status).toBe('published')
    expect(t.attempt_count).toBe(2)
    expect((await view(created.id)).status).toBe('published')
  })

  it('zastareo run (objava je u međuvremenu otkazana) ne objavljuje ništa', async () => {
    const created = await createPost([{ socialAccountId: fbId }])
    const p = await schedule(created.id, created.version)
    const job = jobFor(p, fbId)
    const un = await call<PostView>(actionPost, `/api/posts/${created.id}/unschedule`, {
      token: owner.token,
      params: { id: created.id, action: 'unschedule' },
      body: { version: p.version },
    })
    expect(un.status).toBe(200)
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('skipped')
    expect(metaState.publishes).toEqual([])
    expect((await targetRow(job.targetId)).status).toBe('pending')
  })

  it('onFailure posle naše greške otključava target: failed sa porukom, objava failed', async () => {
    const created = await createPost([{ socialAccountId: fbId }])
    const p = await schedule(created.id, created.version)
    const job = jobFor(p, fbId)
    await handlePublishRunFailure(job.targetId, 'boom')
    const t = await targetRow(job.targetId)
    expect(t.status).toBe('failed')
    expect(t.last_error_code).toBe('INTERNAL')
    expect((await view(created.id)).status).toBe('failed')
  })
})

describe('Publisher: asistirano objavljivanje', () => {
  it('nalog bez API objavljivanja → assisted_pending + obaveštenje; „označi kao objavljeno” završava objavu', async () => {
    const mediaId = await uploadJpeg()
    const created = await createPost([{ socialAccountId: igAssistedId, text: 'IG ručno #sova' }], {
      media: [{ mediaAssetId: mediaId, sortOrder: 0 }],
    })
    const p = await schedule(created.id, created.version)
    const job = jobFor(p, igAssistedId)

    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('assisted')
    const t = await targetRow(job.targetId)
    expect(t.status).toBe('assisted_pending')
    expect(t.assisted).toBe(true)
    expect((await view(created.id)).status).toBe('scheduled')
    expect((await notificationsOf('post_assisted_pending', created.id)).length).toBe(1)
    expect(metaState.publishes).toEqual([])

    const retry = await targetAction(created.id, job.targetId, 'retry')
    expect(retry.status).toBe(409)

    const done = await targetAction(created.id, job.targetId, 'assisted-done', {
      permalink: 'https://www.instagram.com/p/rucno123/',
    })
    expect(done.status).toBe(200)
    expect(done.json.data!.status).toBe('published')
    const after = await targetRow(job.targetId)
    expect(after.status).toBe('assisted_done')
    expect(after.permalink).toBe('https://www.instagram.com/p/rucno123/')
    expect(after.assisted_done_at).not.toBeNull()
  })
})

describe('Publisher: greške, retry i delimičan uspeh', () => {
  it('odbijen medij → failed sa razlogom; retry zakazuje sledeći minut i drugi run objavljuje (IG kontejner)', async () => {
    const mediaId = await uploadJpeg()
    const created = await createPost([{ socialAccountId: igApiId, text: `IG api ${Date.now()}` }], {
      media: [{ mediaAssetId: mediaId, sortOrder: 0 }],
    })
    const p = await schedule(created.id, created.version)
    const job = jobFor(p, igApiId)

    metaState.mediaRejected = true
    const failed = await runPublishTarget(job, ctx)
    expect(failed.outcome).toBe('failed')
    const t1 = await targetRow(job.targetId)
    expect(t1.status).toBe('failed')
    expect(t1.last_error_code).toBe('MEDIA_REJECTED')
    expect(t1.last_error_message).toBeTruthy()
    expect((await view(created.id)).status).toBe('failed')
    expect((await attempts(job.targetId)).map((a) => a.outcome)).toEqual(['permanent_error'])
    expect((await notificationsOf('post_failed', created.id)).length).toBe(1)

    metaState.mediaRejected = false
    vi.mocked(enqueueTargetScheduled).mockClear()
    const retry = await targetAction(created.id, job.targetId, 'retry')
    expect(retry.status).toBe(200)
    expect(retry.json.data!.status).toBe('scheduled')
    const retried = retry.json.data!.targets.find((x) => x.id === job.targetId)!
    expect(retried.status).toBe('scheduled')
    expect(new Date(retried.scheduledAt!).getTime()).toBeGreaterThan(Date.now())
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(enqueueTargetScheduled).mock.calls[0]![0]).toBe(job.targetId)
    expect(vi.mocked(enqueueTargetScheduled).mock.calls[0]![3]).toBe(igApiId)

    const job2: PublishJob = {
      targetId: job.targetId,
      scheduledAt: retried.scheduledAt!,
      version: retry.json.data!.version,
    }
    const ok = await runPublishTarget(job2, ctx)
    expect(ok.outcome).toBe('published')
    expect(ok.externalId).toMatch(/^ig-post-/)
    const t2 = await targetRow(job.targetId)
    expect(t2.status).toBe('published')
    expect(t2.attempt_count).toBe(2)
    expect(t2.permalink).toContain('instagram.com')
    expect((await view(created.id)).status).toBe('published')
    expect(
      metaState.publishes.some((x) => x.path === 'ig-1/media' && x.body.image_url?.includes('/uploads/')),
    ).toBe(true)
  })

  it('K12: dve mreže, jedna padne → partially_published; posle retry-ja → published', async () => {
    const mediaId = await uploadJpeg()
    const created = await createPost([{ socialAccountId: fbId }, { socialAccountId: igApiId }], {
      media: [{ mediaAssetId: mediaId, sortOrder: 0 }],
    })
    const p = await schedule(created.id, created.version)
    // FB: slika se odbija kad je mediaRejected, pa prvo FB bez greške
    const fb = await runPublishTarget(jobFor(p, fbId), ctx)
    expect(fb.outcome).toBe('published')
    metaState.mediaRejected = true
    const ig = await runPublishTarget(jobFor(p, igApiId), ctx)
    expect(ig.outcome).toBe('failed')
    const mid = await view(created.id)
    expect(mid.status).toBe('partially_published')
    expect(mid.targets.map((t) => t.status).sort()).toEqual(['failed', 'published'])

    metaState.mediaRejected = false
    const igTarget = mid.targets.find((t) => t.socialAccountId === igApiId)!
    const retry = await targetAction(created.id, igTarget.id, 'retry')
    expect(retry.status).toBe(200)
    expect(retry.json.data!.status).toBe('partially_published')
    const again = await runPublishTarget(
      {
        targetId: igTarget.id,
        scheduledAt: retry.json.data!.targets.find((t) => t.id === igTarget.id)!.scheduledAt!,
        version: retry.json.data!.version,
      },
      ctx,
    )
    expect(again.outcome).toBe('published')
    expect((await view(created.id)).status).toBe('published')
  })

  it('N7: dnevni limit potrošen → termin pomeren za 24 h, nov događaj, obaveštenje', async () => {
    setDailyLimitsForTests({ facebook: 1 })
    try {
      const created = await createPost([{ socialAccountId: fbId }])
      const p = await schedule(created.id, created.version)
      const job = jobFor(p, fbId)
      const report = await runPublishTarget(job, ctx)
      expect(report.outcome).toBe('rescheduled')
      const t = await targetRow(job.targetId)
      expect(t.status).toBe('scheduled')
      const diff = new Date(t.scheduled_at!).getTime() - new Date(job.scheduledAt).getTime()
      expect(diff).toBeGreaterThanOrEqual(24 * 3600_000)
      expect(diff).toBeLessThan(24 * 3600_000 + 10 * 60_000)
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ kind: 'scheduled', targetId: job.targetId, socialAccountId: fbId })
      expect((await notificationsOf('post_rescheduled', created.id)).length).toBe(1)
      expect((await view(created.id)).status).toBe('scheduled')
      expect(metaState.publishes).toEqual([])
    } finally {
      setDailyLimitsForTests(null)
    }
  })
})

describe('Watchdog (K11)', () => {
  it('kasni target se ponovo šalje jednom u 10 min, alarm posle 15 min, zaglavljen publishing se otključava', async () => {
    const { data: post } = await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        master_text: 'Kasni objava',
        status: 'scheduled',
        created_by: owner.id,
      })
      .select('id')
      .single()
    const late = new Date(Date.now() - 20 * 60_000).toISOString()
    const stuckAt = new Date(Date.now() - 45 * 60_000).toISOString()
    const { data: targets, error } = await admin
      .from('post_targets')
      .insert([
        {
          post_id: post!.id,
          brand_id: brandId,
          social_account_id: fbId,
          platform: 'facebook',
          status: 'scheduled',
          scheduled_at: late,
        },
        {
          post_id: post!.id,
          brand_id: brandId,
          social_account_id: igApiId,
          platform: 'instagram',
          status: 'publishing',
          scheduled_at: stuckAt,
          last_attempt_at: stuckAt,
        },
      ])
      .select('id, social_account_id')
    if (error) throw new Error(error.message)
    const lateId = targets!.find((t) => t.social_account_id === fbId)!.id
    const stuckId = targets!.find((t) => t.social_account_id === igApiId)!.id

    const wctx = { run: ctx.run, sendEvent: ctx.sendEvent }
    const first = await runWatchdog(wctx)
    expect(first.resent).toBe(2)
    expect(first.alarms).toBe(2)
    expect(first.unstuck).toBe(1)
    expect(sent.map((e) => e.targetId).sort()).toEqual([lateId, stuckId].sort())
    expect((await targetRow(lateId)).last_error_code).toBe('WATCHDOG_RESENT')
    expect((await targetRow(stuckId)).status).toBe('scheduled')
    const alarms = await notificationsOf('publish_watchdog_alarm', post!.id)
    expect(alarms.length).toBe(2)

    sent = []
    const second = await runWatchdog(wctx)
    expect(second.resent).toBe(0)
    expect(sent).toEqual([])
  })
})

describe('Obaveštenja: API i podešavanja', () => {
  it('lista sa brojem nepročitanih, označavanje svih kao pročitanih', async () => {
    const list = await call<{
      items: Array<{ id: string; title: string; readAt: string | null }>
      unreadCount: number
    }>(notifGet, '/api/notifications', { token: owner.token, query: { workspaceId: wsId, limit: '50' } })
    expect(list.status).toBe(200)
    expect(list.json.data!.unreadCount).toBeGreaterThan(0)
    expect(list.json.data!.items[0]!.title).toBeTruthy()

    const read = await call<{ updated: number }>(readPost, '/api/notifications/read', {
      token: owner.token,
      body: { all: true, workspaceId: wsId },
    })
    expect(read.status).toBe(200)
    expect(read.json.data!.updated).toBeGreaterThan(0)
    const after = await call<{ unreadCount: number }>(notifGet, '/api/notifications', {
      token: owner.token,
      query: { workspaceId: wsId, unread: '1' },
    })
    expect(after.json.data!.unreadCount).toBe(0)
  })

  it('podešavanja: podrazumevano iz kataloga; isključen in_app kanal preskače red u notifications', async () => {
    type Prefs = { items: Array<{ type: string; inApp: boolean; email: boolean }> }
    const def = await call<Prefs>(prefsGet, '/api/notifications/preferences', {
      token: owner.token,
      query: { workspaceId: wsId },
    })
    expect(def.status).toBe(200)
    expect(def.json.data!.items).toHaveLength(NOTIFICATION_TYPE_KEYS.length)
    expect(def.json.data!.items.find((i) => i.type === 'post_published')).toMatchObject({
      inApp: true,
      email: false,
    })

    const put = await call<Prefs>(prefsPut, '/api/notifications/preferences', {
      token: owner.token,
      method: 'PUT',
      body: {
        workspaceId: wsId,
        items: [
          { type: 'post_published', inApp: true, email: true },
          { type: 'post_failed', inApp: false, email: false },
        ],
      },
    })
    expect(put.status).toBe(200)
    expect(put.json.data!.items.find((i) => i.type === 'post_failed')).toMatchObject({
      inApp: false,
      email: false,
    })
    expect(put.json.data!.items.find((i) => i.type === 'post_published')).toMatchObject({
      inApp: true,
      email: true,
    })

    const before =
      (await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', owner.id))
        .count ?? 0
    const delivered = await notifyUsers({
      userIds: [owner.id],
      workspaceId: wsId,
      brandId,
      type: 'post_failed',
      title: 'Test',
      body: null,
    })
    expect(delivered).toBe(0)
    const afterCount =
      (await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', owner.id))
        .count ?? 0
    expect(afterCount).toBe(before)
  })
})

describe('Arhiviranje brenda (K3)', () => {
  it('otkazuje zakazane objave i run-ove pre arhiviranja', async () => {
    const created = await createPost([{ socialAccountId: fbId }])
    const p = await schedule(created.id, created.version)
    const canceled = await cancelScheduledPostsForBrand(brandId, owner.id)
    expect(canceled).toBeGreaterThanOrEqual(1)
    expect((await view(created.id)).status).toBe('canceled')
    expect((await targetRow(p.targets[0]!.id)).status).toBe('canceled')
    expect(vi.mocked(enqueueTargetUnscheduled)).toHaveBeenCalled()
  })
})
