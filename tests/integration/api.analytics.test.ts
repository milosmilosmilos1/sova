import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as generatePost } from '@/app/api/analytics/insights/generate/route'
import { GET as insightsGet } from '@/app/api/analytics/insights/route'
import { GET as overviewGet } from '@/app/api/analytics/overview/route'
import { GET as postsGet } from '@/app/api/analytics/posts/route'
import { POST as refreshPost } from '@/app/api/analytics/refresh/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setMetaProviderForTests } from '@/integrations/social/registry'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { generateInsights } from '@/services/analytics/insights'
import {
  captureAccountMetrics,
  capturePostMetrics,
  runAccountMetricsSweep,
} from '@/services/analytics/metrics'

import { enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { metaHandlers, metaState, resetMetaState } from './meta-mock'

let owner: TestUser
let viewerUser: TestUser
let wsId = ''
let brandId = ''
let fbId = ''
let igId = ''
let pillarId = ''
let fbTarget = ''
let fbTarget2 = ''
let goneTarget = ''
let igTarget = ''

function enc(platform: string, externalId: string, token: string) {
  const e = encryptSecret(token, `social:${brandId}:${platform}:${externalId}`)
  return { access_token_enc: toPgBytea(e.ciphertext), key_version: e.keyVersion }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function publishedTarget(
  accountId: string,
  platform: 'facebook' | 'instagram',
  externalId: string,
  text: string,
  pillar: string | null,
  ago: number,
) {
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      master_text: text,
      status: 'published',
      created_by: owner.id,
      pillar_id: pillar,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const { data: t, error: tErr } = await admin
    .from('post_targets')
    .insert({
      post_id: post!.id,
      brand_id: brandId,
      social_account_id: accountId,
      platform,
      status: 'published',
      external_post_id: externalId,
      published_at: daysAgo(ago),
      permalink: `https://example.test/${externalId}`,
    })
    .select('id')
    .single()
  if (tErr) throw new Error(tErr.message)
  return t!.id
}

async function snapshots(targetId: string) {
  const { data } = await admin
    .from('post_metrics_snapshots')
    .select('*')
    .eq('target_id', targetId)
    .order('captured_at')
  return data ?? []
}

interface Overview {
  totals: {
    posts: number
    withMetrics: number
    reach: number
    engagement: number
    engagementRate: number | null
  }
  deltas: { posts: number | null; reach: number | null }
  perPlatform: Array<{ key: string; posts: number; reach: number; engagement: number }>
  perPillar: Array<{ label: string; posts: number }>
  topPosts: Array<{ targetId: string; engagement: number; horizon: string }>
  weakPosts: unknown[]
  followers: Array<{ accountId: string; last: number | null; delta: number | null }>
  notes: string[]
  timezone: string
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...metaHandlers)
  setMetaProviderForTests({ pollIntervalMs: 0, pollAttempts: 2 })
  owner = await createTestUser('ana-owner')
  viewerUser = await createTestUser('ana-viewer')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Analitika test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: viewerUser.id, role: 'viewer', all_brands: true })
  const { data: accounts, error } = await admin
    .from('social_accounts')
    .insert([
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: 'page-1',
        name: 'Strana',
        account_type: 'facebook_page',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: false,
        ...enc('facebook', 'page-1', 'page-token-1'),
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: 'ig-1',
        external_parent_id: 'page-1',
        name: 'IG',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: false,
        ...enc('instagram', 'ig-1', 'page-token-1'),
      },
    ])
    .select('id, platform')
  if (error) throw new Error(error.message)
  fbId = accounts!.find((a) => a.platform === 'facebook')!.id
  igId = accounts!.find((a) => a.platform === 'instagram')!.id
  const { data: pillar } = await admin
    .from('content_pillars')
    .insert({ brand_id: brandId, name: 'Edukacija', share_percent: 50 })
    .select('id')
    .single()
  pillarId = pillar!.id
  fbTarget = await publishedTarget(fbId, 'facebook', 'page-1_901', 'FB objava jedan', pillarId, 2)
  fbTarget2 = await publishedTarget(fbId, 'facebook', 'page-1_902', 'FB objava dva', null, 3)
  goneTarget = await publishedTarget(fbId, 'facebook', 'page-1_777', 'Obrisana objava', null, 4)
  igTarget = await publishedTarget(igId, 'instagram', 'ig-post-1', 'IG objava', pillarId, 1)
})

afterEach(() => {
  resetMetaState()
  resetGeminiMock()
  resetMemoryRateLimit()
})

afterAll(async () => {
  setMetaProviderForTests(null)
  geminiServer.close()
  await deleteTestUser(viewerUser)
  await deleteTestUser(owner)
})

describe('Metrike objava', () => {
  it('Facebook snimak 1h: reakcije, komentari, deljenja, doseg; isti horizont drugi put se preskače; adhoc uvek', async () => {
    const r = await capturePostMetrics(fbTarget, '1h')
    expect(r.status).toBe('captured')
    const [s] = await snapshots(fbTarget)
    expect(s).toMatchObject({
      horizon: '1h',
      reactions: 9,
      comments: 1,
      shares: 2,
      impressions: 200,
      reach: 201,
      link_clicks: 202,
    })
    expect(Number(s!.engagement_rate)).toBeGreaterThan(0)
    const again = await capturePostMetrics(fbTarget, '1h')
    expect(again.status).toBe('skipped')
    const adhoc = await capturePostMetrics(fbTarget, 'adhoc')
    expect(adhoc.status).toBe('captured')
    expect((await snapshots(fbTarget)).map((x) => x.horizon)).toEqual(['1h', 'adhoc'])
    expect((await capturePostMetrics(fbTarget2, '24h')).status).toBe('captured')
  })

  it('Instagram snimak: doseg, pregledi, čuvanja, deljenja iz insights', async () => {
    const r = await capturePostMetrics(igTarget, '24h')
    expect(r.status).toBe('captured')
    const [s] = await snapshots(igTarget)
    expect(s).toMatchObject({
      horizon: '24h',
      reactions: 5,
      comments: 1,
      reach: 100,
      impressions: 101,
      saves: 102,
      shares: 103,
    })
  })

  it('N6: objava obrisana na mreži → target deleted_externally, bez snimka', async () => {
    metaState.goneIds.push('page-1_777')
    const r = await capturePostMetrics(goneTarget, '1h')
    expect(r.status).toBe('deleted')
    const { data } = await admin
      .from('post_targets')
      .select('status, last_error_code')
      .eq('id', goneTarget)
      .single()
    expect(data).toMatchObject({ status: 'deleted_externally', last_error_code: 'DELETED_EXTERNALLY' })
    expect(await snapshots(goneTarget)).toHaveLength(0)
    expect((await capturePostMetrics(goneTarget, '24h')).status).toBe('skipped')
  })

  it('metrike naloga: upsert po (nalog, dan); dnevni prolaz obrađuje sve aktivne naloge', async () => {
    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    expect((await captureAccountMetrics(fbId, day)).status).toBe('captured')
    expect((await captureAccountMetrics(fbId, day)).status).toBe('captured')
    const { data: rows } = await admin.from('account_metrics_daily').select('*').eq('social_account_id', fbId)
    expect(rows).toHaveLength(1)
    expect(rows![0]!.followers).toBeGreaterThan(0)
    expect(rows![0]!.reach).toBeGreaterThan(0)
    const sweep = await runAccountMetricsSweep(day)
    expect(sweep.captured).toBeGreaterThanOrEqual(2)
    const { count } = await admin
      .from('account_metrics_daily')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brandId)
    expect(count).toBe(2)
  })
})

describe('Analitika API', () => {
  it('pregled: zbirovi, mreže, stubovi, najbolje objave, pratioci; obrisana objava se ne broji', async () => {
    const r = await call<Overview>(overviewGet, '/api/analytics/overview', {
      token: owner.token,
      query: { brandId },
    })
    expect(r.status).toBe(200)
    const o = r.json.data!
    expect(o.timezone).toBe('Europe/Belgrade')
    expect(o.totals.posts).toBe(3)
    expect(o.totals.withMetrics).toBe(3)
    // FB1 (9+1+2) + FB2 (9+1+2) + IG (5+1+103+102)
    expect(o.totals.engagement).toBe(12 + 12 + 211)
    expect(o.totals.reach).toBe(201 + 201 + 100)
    expect(o.deltas.posts).toBeNull()
    expect(o.perPlatform.map((p) => p.key).sort()).toEqual(['facebook', 'instagram'])
    expect(o.perPlatform.find((p) => p.key === 'facebook')).toMatchObject({
      posts: 2,
      reach: 402,
      engagement: 24,
    })
    expect(o.perPillar).toEqual([expect.objectContaining({ label: 'Edukacija', posts: 2 })])
    expect(o.topPosts[0]).toMatchObject({ targetId: igTarget, engagement: 211, horizon: '24h' })
    expect(o.topPosts.find((p) => p.targetId === fbTarget)?.horizon).toBe('1h') // 1h ima prednost nad adhoc
    expect(o.followers).toHaveLength(2)
    expect(o.followers.every((f) => f.last && f.last > 0)).toBe(true)

    const viewerRead = await call<Overview>(overviewGet, '/api/analytics/overview', {
      token: viewerUser.token,
      query: { brandId },
    })
    expect(viewerRead.status).toBe(200)
    const bad = await call(overviewGet, '/api/analytics/overview', {
      token: owner.token,
      query: { brandId, from: '2026-10-20', to: '2026-10-01' },
    })
    expect(bad.status).toBe(400)
  })

  it('objave sa metrikama: filter po mreži, horizonti po objavi; ručno osvežavanje samo za urednike', async () => {
    const all = await call<{
      items: Array<{ targetId: string; horizonsCaptured: string[]; reactions: number | null }>
    }>(postsGet, '/api/analytics/posts', {
      token: owner.token,
      query: { brandId },
    })
    expect(all.json.data!.items).toHaveLength(3)
    const fb = all.json.data!.items.find((i) => i.targetId === fbTarget)!
    expect(fb.horizonsCaptured.sort()).toEqual(['1h', 'adhoc'])
    expect(fb.reactions).toBe(9)
    const ig = await call<{ items: unknown[] }>(postsGet, '/api/analytics/posts', {
      token: owner.token,
      query: { brandId, platform: 'instagram' },
    })
    expect(ig.json.data!.items).toHaveLength(1)

    const forbidden = await call(refreshPost, '/api/analytics/refresh', {
      token: viewerUser.token,
      body: { targetId: igTarget },
    })
    expect(forbidden.status).toBe(403)
    const ok = await call<{ status: string }>(refreshPost, '/api/analytics/refresh', {
      token: owner.token,
      body: { targetId: igTarget },
    })
    expect(ok.status).toBe(200)
    expect(ok.json.data!.status).toBe('captured')
    expect((await snapshots(igTarget)).map((s) => s.horizon)).toEqual(['24h', 'adhoc'])
  })
})

describe('AI uvidi', () => {
  it('premalo podataka → skipped bez poziva modela', async () => {
    const r = await generateInsights(brandId, { from: '2020-01-01', to: '2020-01-31', userId: owner.id })
    expect(r.status).toBe('skipped')
    expect(r.reason).toContain('bar 3')
  })

  it('generisanje: uvidi sa dokazima iz poznatih objava, predlog u Inbox, obaveštenje; posmatrač 403', async () => {
    const forbidden = await call(generatePost, '/api/analytics/insights/generate', {
      token: viewerUser.token,
      body: { brandId },
    })
    expect(forbidden.status).toBe(403)

    enqueueReply({
      kind: 'text',
      json: {
        items: [
          {
            claim: 'Instagram objava ima 211 interakcija, najviše u periodu.',
            recommendation: 'Ponovite format sa čuvanjima: karusel sa savetima.',
            evidence_post_ids: [igTarget, 'nepostojeci-id'],
            confidence: 0.8,
            suggestion_kind: 'repeat_format',
            suggestion_title: 'Ponovi karusel sa savetima',
            suggestion_body: 'Napravite karusel sa 5 saveta za zimu, objavite utorkom u 18 h.',
          },
          {
            claim: 'Facebook objave imaju ravnomeran doseg oko 200.',
            recommendation: 'Testirajte fotografiju tima umesto linka.',
            evidence_post_ids: [fbTarget, fbTarget2],
            confidence: 1.4,
            suggestion_kind: '',
            suggestion_title: '',
            suggestion_body: '',
          },
        ],
      },
    })
    const r = await call<{ status: string; insightId: string; items: number; suggestions: number }>(
      generatePost,
      '/api/analytics/insights/generate',
      {
        token: owner.token,
        body: { brandId },
      },
    )
    expect(r.status).toBe(201)
    expect(r.json.data).toMatchObject({ status: 'created', items: 2, suggestions: 1 })

    const list = await call<{
      insights: Array<{ id: string; items: Array<{ evidenceTargetIds: string[]; confidence: number }> }>
    }>(insightsGet, '/api/analytics/insights', {
      token: owner.token,
      query: { brandId },
    })
    expect(list.json.data!.insights).toHaveLength(1)
    const items = list.json.data!.insights[0]!.items
    expect(items[0]!.evidenceTargetIds).toEqual([igTarget])
    expect(items[1]!.confidence).toBe(1)

    const { data: sugg } = await admin
      .from('suggestions')
      .select('source, kind, status, title, score, evidence')
      .eq('brand_id', brandId)
    expect(sugg).toHaveLength(1)
    expect(sugg![0]).toMatchObject({
      source: 'insight',
      kind: 'repeat_format',
      status: 'new',
      title: 'Ponovi karusel sa savetima',
      score: 80,
    })
    const { data: notes } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', owner.id)
      .eq('type', 'insights_ready')
    expect(notes!.length).toBe(1)
    const { data: gen } = await admin
      .from('ai_generations')
      .select('status, type, token_reservation_id')
      .eq('brand_id', brandId)
      .eq('type', 'insights')
    expect(gen![0]).toMatchObject({ status: 'succeeded', token_reservation_id: null })
  })
})
