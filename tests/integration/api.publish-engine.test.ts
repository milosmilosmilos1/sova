import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { POST as cronPost } from '@/app/api/cron/publish/route'
import { setMetaProviderForTests } from '@/integrations/social/registry'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { PUBLISH_CRON_FLAG, setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { ensureRuns, publishTick } from '@/services/posts/publish-engine'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { metaHandlers, metaState, resetMetaState } from './meta-mock'

/**
 * Objave bez Inngest-a (D-193): isti koraci objave, ali ih pokreće krug (Netlify na 2 min) ili
 * „Objavi sada”, a završeni koraci i pauze se pamte u `publish_runs`.
 */
let owner: TestUser
let wsId = ''
let brandId = ''
let fbId = ''

interface PostView {
  id: string
  status: string
  version: number
  targets: Array<{ id: string; socialAccountId: string; status: string; scheduledAt: string | null }>
}

function enc(platform: string, externalId: string, token: string) {
  const e = encryptSecret(token, `social:${brandId}:${platform}:${externalId}`)
  return { access_token_enc: toPgBytea(e.ciphertext), key_version: e.keyVersion }
}

async function createPost(): Promise<PostView> {
  const r = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: {
      brandId,
      masterText: `Engine test ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
      targets: [{ socialAccountId: fbId }],
    },
  })
  if (r.status !== 201) throw new Error(`createPost: ${JSON.stringify(r.json.error)}`)
  return r.json.data!
}

// svaki test svoj minut: isti minut na istom nalogu nije dozvoljen
let slot = 3
async function scheduled(): Promise<{ post: PostView; targetId: string; at: Date }> {
  const created = await createPost()
  const when = new Date(Date.now() + slot++ * 60_000)
  const r = await call<PostView>(actionPost, `/api/posts/${created.id}/schedule`, {
    token: owner.token,
    params: { id: created.id, action: 'schedule' },
    body: { version: created.version, scheduledFor: when.toISOString() },
  })
  if (r.status !== 200) throw new Error(`schedule: ${JSON.stringify(r.json.error)}`)
  return { post: r.json.data!, targetId: r.json.data!.targets[0]!.id, at: when }
}

async function target(id: string) {
  const { data } = await admin.from('post_targets').select('*').eq('id', id).single()
  return data!
}

async function run(id: string) {
  const { data } = await admin.from('publish_runs').select('*').eq('target_id', id).maybeSingle()
  return data
}

const feedPublishes = () => metaState.publishes.filter((p) => p.path === 'page-1/feed').length

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...metaHandlers)
  setMetaProviderForTests({ pollIntervalMs: 0, pollAttempts: 2 })
  setFeatureFlagForTests(PUBLISH_CRON_FLAG, true)
  owner = await createTestUser('engine-owner')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Engine test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const { data, error } = await admin
    .from('social_accounts')
    .insert({
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
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  fbId = data!.id
})

afterEach(() => {
  resetMetaState()
  resetMemoryRateLimit()
})

afterAll(async () => {
  setFeatureFlagForTests(PUBLISH_CRON_FLAG, null)
  setMetaProviderForTests(null)
  geminiServer.close()
  if (wsId) await admin.from('workspaces').delete().eq('id', wsId)
  if (owner) await deleteTestUser(owner)
})

describe('objave bez Inngest-a (D-193)', () => {
  it('krug pre termina ne radi ništa; posle termina objavljuje jednom, a sledeći krug ne ponavlja', async () => {
    const { targetId, at } = await scheduled()
    const before = await publishTick({ now: () => new Date(at.getTime() - 5 * 60_000) })
    expect(before).toMatchObject({ enabled: true, created: 0, advanced: 0 })

    const after = () => new Date(at.getTime() + 5_000)
    const tick = await publishTick({ now: after })
    expect(tick).toMatchObject({ enabled: true, published: 1 })
    expect((await target(targetId)).status).toBe('published')
    expect(feedPublishes()).toBe(1)
    expect(await run(targetId)).toMatchObject({ status: 'done', outcome: 'published', locked_until: null })

    const again = await publishTick({ now: after })
    expect(again.published).toBe(0)
    expect(feedPublishes()).toBe(1)
  })

  it('privremena greška mreže: krug staje na pauzi od 60 s i sledeći krug posle pauze objavljuje', async () => {
    const { targetId, at } = await scheduled()
    metaState.feedFailuresLeft = 1
    const t0 = at.getTime() + 5_000
    const first = await publishTick({ now: () => new Date(t0) })
    expect(first).toMatchObject({ advanced: 1, published: 0 })
    const waiting = await run(targetId)
    expect(waiting?.status).toBe('waiting')
    expect(new Date(waiting!.wake_at).getTime()).toBeGreaterThan(t0)
    expect((waiting!.steps as Record<string, unknown>)['attempt-1']).toBeTruthy()

    // pre isteka pauze ništa
    expect((await publishTick({ now: () => new Date(t0 + 30_000) })).advanced).toBe(0)
    const second = await publishTick({ now: () => new Date(t0 + 61_000) })
    expect(second.published).toBe(1)
    const t = await target(targetId)
    expect(t.status).toBe('published')
    expect(t.attempt_count).toBe(2)
    // prvi poziv je pao (500), drugi je objavio: dva poziva prema mreži, jedna objava
    expect(feedPublishes()).toBe(2)
    expect(await run(targetId)).toMatchObject({ status: 'done', outcome: 'published' })
  })

  it('otkazana objava: prolaz koji čeka se otkazuje i ništa se ne objavljuje', async () => {
    const { post, targetId, at } = await scheduled()
    const due = new Date(at.getTime() + 5_000)
    expect(await ensureRuns(due)).toBeGreaterThanOrEqual(1)
    expect((await run(targetId))?.status).toBe('waiting')

    const current = await call<PostView>(actionPost, `/api/posts/${post.id}/unschedule`, {
      token: owner.token,
      params: { id: post.id, action: 'unschedule' },
      body: { version: post.version },
    })
    expect(current.status).toBe(200)
    expect((await run(targetId))?.status).toBe('cancelled')
    expect((await publishTick({ now: () => due })).published).toBe(0)
    expect(feedPublishes()).toBe(0)
    expect((await target(targetId)).status).not.toBe('published')
  })

  it('dva kruga u isto vreme: objava ide samo jednom', async () => {
    const { targetId, at } = await scheduled()
    const due = () => new Date(at.getTime() + 5_000)
    const [a, b] = await Promise.all([publishTick({ now: due }), publishTick({ now: due })])
    expect(a.published + b.published).toBe(1)
    expect((await target(targetId)).status).toBe('published')
    expect(feedPublishes()).toBe(1)
  })

  it('„Objavi sada” objavljuje u istom zahtevu, bez čekanja kruga', async () => {
    const created = await createPost()
    const r = await call<PostView>(actionPost, `/api/posts/${created.id}/publish-now`, {
      token: owner.token,
      params: { id: created.id, action: 'publish-now' },
      body: { version: created.version },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.targets[0]!.status).toBe('published')
    expect(feedPublishes()).toBe(1)
  }, 40_000)

  it('ruta kruga traži CRON_SECRET; isključen prekidač znači da krug ne radi ništa', async () => {
    const denied = await call(cronPost, '/api/cron/publish', { body: {} })
    expect(denied.status).toBe(401)
    setFeatureFlagForTests(PUBLISH_CRON_FLAG, false)
    try {
      expect(await publishTick()).toMatchObject({ enabled: false, advanced: 0 })
    } finally {
      setFeatureFlagForTests(PUBLISH_CRON_FLAG, true)
    }
  })
})
