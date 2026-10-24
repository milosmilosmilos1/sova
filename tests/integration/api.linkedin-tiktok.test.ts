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
import { GET as publicMediaGet } from '@/app/api/media/public/[token]/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { DELETE as accountDelete } from '@/app/api/social-accounts/[id]/route'
import { GET as creatorGet } from '@/app/api/social-accounts/[id]/tiktok-creator/route'
import { POST as activatePost } from '@/app/api/social-accounts/activate/route'
import { GET as accountsGet } from '@/app/api/social-accounts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { setLinkedInProviderForTests, setTikTokProviderForTests } from '@/integrations/social/registry'
import { TikTokProvider } from '@/integrations/social/tiktok/provider'
import { captureAccountMetrics, capturePostMetrics } from '@/services/analytics/metrics'
import { runPublishTarget, type OutgoingEvent, type PublishContext } from '@/services/posts/publisher'
import { loadAccountRow, refFor, tokensFor } from '@/services/social/account-rows'
import { importAccountHistory } from '@/services/social/history'
import { refreshOtherTokens } from '@/services/social/refresh'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { linkedInTikTokHandlers, liState, resetLinkedInTikTokState, ttState } from './linkedin-tiktok-mock'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let wsId = ''
let brandId = ''
let liPersonId = ''
let liOrgId = ''
let ttId = ''
let liPersonTargetId = ''
let liOrgTargetId = ''

const sent: OutgoingEvent[] = []
const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async () => {},
  sendEvent: async (_name, ev) => {
    sent.push(ev)
  },
  runId: 'test-run-8b',
}

interface Target {
  id: string
  socialAccountId: string
  status: string
  scheduledAt: string | null
  externalPostId: string | null
  permalink: string | null
}
interface PostView {
  id: string
  status: string
  version: number
  targets: Target[]
}
interface AccountView {
  id: string
  platform: string
  name: string
  accountType: string
  status: string
  followers: number | null
  username: string | null
}

function authed(path: string): NextRequest {
  return new NextRequest(new URL(path, APP), {
    headers: { authorization: `Bearer ${owner.token}`, origin: APP },
  })
}

async function connectAndActivate(provider: 'linkedin' | 'tiktok'): Promise<AccountView[]> {
  const res = await connectGet(
    authed(`/api/integrations/${provider}/connect?brandId=${brandId}&redirectTo=/app/accounts`),
    {
      params: Promise.resolve({ provider }),
    },
  )
  expect(res.status).toBe(302)
  const loc = new URL(res.headers.get('location')!)
  const state = loc.searchParams.get('state')!
  const back = await callbackGet(
    authed(`/api/integrations/${provider}/callback?state=${state}&code=${provider}-code`),
    {
      params: Promise.resolve({ provider }),
    },
  )
  expect(back.status).toBe(302)
  const pendingState = new URL(back.headers.get('location')!).searchParams.get('pending')!
  const list = await call<{ pending: AccountView[] }>(accountsGet, '/api/social-accounts', {
    token: owner.token,
    query: { brandId, pending: pendingState },
  })
  const pending = list.json.data!.pending
  const act = await call<AccountView[]>(activatePost, '/api/social-accounts/activate', {
    token: owner.token,
    body: { brandId, pendingState, ids: pending.map((a) => a.id) },
  })
  expect(act.status).toBe(200)
  return act.json.data!
}

async function uploadJpeg(
  color: { r: number; g: number; b: number },
  width = 1600,
  height = 1200,
): Promise<string> {
  const jpeg = await sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg({ quality: 80 })
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(jpeg)], 'slika.jpg', { type: 'image/jpeg' }))
  form.set('workspaceId', wsId)
  form.set('brandId', brandId)
  const req = new NextRequest(new URL('/api/media/upload', APP), {
    method: 'POST',
    body: form,
    headers: { origin: APP, authorization: `Bearer ${owner.token}` },
  })
  const json = (await (await uploadPost(req, { params: Promise.resolve({}) })).json()) as {
    ok: boolean
    data?: { id: string }
  }
  if (!json.ok) throw new Error('upload nije uspeo')
  return json.data!.id
}

let slot = 3
async function scheduledPost(
  body: Record<string, unknown>,
): Promise<{ post: PostView; job: { targetId: string; scheduledAt: string; version: number } }> {
  const created = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: { brandId, ...body },
  })
  if (created.status !== 201) throw new Error(`post: ${JSON.stringify(created.json.error)}`)
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
  return {
    post: s.json.data!,
    job: { targetId: t.id, scheduledAt: t.scheduledAt!, version: s.json.data!.version },
  }
}

async function target(id: string) {
  const { data } = await admin.from('post_targets').select('*').eq('id', id).single()
  return data!
}

const validTikTok = {
  privacyLevel: 'FOLLOWER_OF_CREATOR',
  allowComment: true,
  allowDuet: false,
  allowStitch: false,
  commercial: true,
  brandOrganic: true,
  brandedContent: false,
  consent: true,
  consentAt: new Date().toISOString(),
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...linkedInTikTokHandlers)
  setLinkedInProviderForTests({
    linkPreview: async () => ({ title: 'Ponuda za servis klime', description: 'Servis za 30 minuta' }),
  })
  setTikTokProviderForTests({})
  setFeatureFlagForTests('platform.linkedin', true)
  setFeatureFlagForTests('platform.tiktok', true)
  owner = await createTestUser('li-tt')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'LinkedIn i TikTok test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetMemoryRateLimit()
})

afterAll(async () => {
  setLinkedInProviderForTests(null)
  setTikTokProviderForTests(null)
  setFeatureFlagForTests('platform.linkedin', null)
  setFeatureFlagForTests('platform.tiktok', null)
  geminiServer.close()
  await deleteTestUser(owner)
})

describe('LinkedIn', () => {
  it('connect: OAuth sa istim skupom scope-ova; profil i stranica (ANALYST se preskače); token šifrovan', async () => {
    resetLinkedInTikTokState()
    const res = await connectGet(authed(`/api/integrations/linkedin/connect?brandId=${brandId}`), {
      params: Promise.resolve({ provider: 'linkedin' }),
    })
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(loc.searchParams.get('client_id')).toBe(process.env.LINKEDIN_CLIENT_ID)
    expect(loc.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/linkedin/callback`)
    expect(loc.searchParams.get('scope')!.split(' ')).toEqual(
      expect.arrayContaining([
        'openid',
        'w_member_social',
        'rw_organization_admin',
        'w_organization_social',
        'r_member_postAnalytics',
      ]),
    )

    const accounts = await connectAndActivate('linkedin')
    const person = accounts.find((a) => a.accountType === 'linkedin_person')!
    const org = accounts.find((a) => a.accountType === 'linkedin_organization')!
    expect(accounts).toHaveLength(2)
    expect(person).toMatchObject({ name: 'Marko Marković', status: 'active' })
    expect(org).toMatchObject({ name: 'Klima servis d.o.o.', followers: 321, username: 'klima-servis' })
    liPersonId = person.id
    liOrgId = org.id
    const row = (await loadAccountRow(person.id))!
    expect(tokensFor(row).accessToken).toBe('li-token-1')
    expect(new Date(row.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000)
    expect(row.metadata).toMatchObject({ providerUserId: 'li-member-1', linkedinUserId: 'li-member-1' })
    expect(liState.tokenRequests[0]).toMatchObject({
      grant_type: 'authorization_code',
      code: 'linkedin-code',
    })
  })

  it('objava na profil: little format i dve slike kroz Images API, verzionisana zaglavlja', async () => {
    resetLinkedInTikTokState()
    const a = await uploadJpeg({ r: 10, g: 120, b: 200 })
    const b = await uploadJpeg({ r: 200, g: 80, b: 20 })
    const { job } = await scheduledPost({
      masterText: 'Akcija (samo danas) za *sve* klime #klima',
      targets: [{ socialAccountId: liPersonId }],
      media: [{ mediaAssetId: a }, { mediaAssetId: b, sortOrder: 1 }],
    })
    liPersonTargetId = job.targetId
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    expect(report.externalId).toMatch(/^urn:li:share:/)

    const post = liState.posts[0]!
    expect(post.body).toMatchObject({
      author: 'urn:li:person:li-member-1',
      commentary: 'Akcija \\(samo danas\\) za \\*sve\\* klime #klima',
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
    })
    expect((post.body.content as { multiImage: { images: unknown[] } }).multiImage.images).toHaveLength(2)
    expect(post.headers['linkedin-version']).toBe('202610')
    expect(post.headers['x-restli-protocol-version']).toBe('2.0.0')
    expect(liState.imageInits).toBe(2)
    expect(liState.uploads.map((u) => u.auth)).toEqual(['Bearer li-token-1', 'Bearer li-token-1'])
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.permalink).toBe(`https://www.linkedin.com/feed/update/${report.externalId}/`)
  })

  it('objava stranice sa linkom: članak sa naslovom iz pregleda stranice (Posts API ne čita link)', async () => {
    resetLinkedInTikTokState()
    const { job } = await scheduledPost({
      masterText: 'Nova ponuda za servis',
      linkUrl: 'https://primer.rs/ponuda',
      targets: [{ socialAccountId: liOrgId }],
    })
    liOrgTargetId = job.targetId
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    const body = liState.posts[0]!.body as {
      author: string
      content: { article: { source: string; title: string; description: string } }
    }
    expect(body.author).toBe('urn:li:organization:2414183')
    expect(body.content.article.title).toBe('Ponuda za servis klime')
    expect(body.content.article.description).toBe('Servis za 30 minuta')
    const source = new URL(body.content.article.source)
    expect(source.origin + source.pathname).toBe('https://primer.rs/ponuda')
    expect(source.searchParams.get('utm_source')).toBe('linkedin')
  })

  it('metrike: stranica iz statistike deljenja, profil iz Member Post Analytics', async () => {
    expect((await capturePostMetrics(liOrgTargetId, '24h')).status).toBe('captured')
    expect((await capturePostMetrics(liPersonTargetId, '24h')).status).toBe('captured')
    const { data: snaps } = await admin
      .from('post_metrics_snapshots')
      .select('target_id, impressions, reach, reactions, comments, shares, link_clicks')
      .in('target_id', [liOrgTargetId, liPersonTargetId])
    const org = snaps!.find((s) => s.target_id === liOrgTargetId)!
    const person = snaps!.find((s) => s.target_id === liPersonTargetId)!
    expect(org).toMatchObject({
      impressions: 500,
      reach: 410,
      reactions: 30,
      comments: 4,
      shares: 2,
      link_clicks: 12,
    })
    expect(person).toMatchObject({ impressions: 900, reach: 700, reactions: 45, comments: 6, shares: 3 })
    expect((await captureAccountMetrics(liOrgId, new Date().toISOString().slice(0, 10))).status).toBe(
      'captured',
    )
    const { data: daily } = await admin
      .from('account_metrics_daily')
      .select('followers')
      .eq('social_account_id', liOrgId)
      .single()
    expect(daily!.followers).toBe(321)
  })

  it('istek bez refresh tokena: obaveštenje 7 dana ranije (jednom), posle isteka needs_reauth i u publisheru', async () => {
    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString() })
      .eq('id', liOrgId)
    await refreshOtherTokens()
    await refreshOtherTokens()
    const { data: notes } = await admin
      .from('notifications')
      .select('title, body, data')
      .eq('user_id', owner.id)
      .eq('type', 'account_expiring')
    expect(notes).toHaveLength(1)
    expect(notes![0]!.body).toContain('Klima servis d.o.o.')

    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', liPersonId)
    const { job } = await scheduledPost({
      masterText: 'Objava posle isteka',
      targets: [{ socialAccountId: liPersonId }],
    })
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('failed')
    expect((await target(job.targetId)).status).toBe('failed')
    expect((await loadAccountRow(liPersonId))!.status).toBe('needs_reauth')
  })
})

describe('TikTok', () => {
  it('connect bez PKCE (web), nalog na čekanju pa aktivan; token 24 h i refresh token', async () => {
    resetLinkedInTikTokState()
    const res = await connectGet(authed(`/api/integrations/tiktok/connect?brandId=${brandId}`), {
      params: Promise.resolve({ provider: 'tiktok' }),
    })
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(loc.searchParams.get('client_key')).toBe(process.env.TIKTOK_CLIENT_KEY)
    expect(loc.searchParams.get('scope')).toBe(
      'user.info.basic,user.info.profile,user.info.stats,video.publish,video.list',
    )
    expect(loc.searchParams.has('code_challenge')).toBe(false)

    const [acc] = await connectAndActivate('tiktok')
    expect(acc).toMatchObject({
      platform: 'tiktok',
      name: 'Klima Servis',
      username: 'klimaservis',
      followers: 1234,
    })
    ttId = acc!.id
    const row = (await loadAccountRow(ttId))!
    expect(tokensFor(row)).toMatchObject({ accessToken: 'act.1', refreshToken: 'rft.1' })
    const ttl = new Date(row.token_expires_at!).getTime() - Date.now()
    expect(ttl).toBeGreaterThan(23 * 3600_000)
    expect(ttl).toBeLessThan(25 * 3600_000)
  })

  it('creator_info ruta i provera: bez privatnosti i saglasnosti objava ne prolazi', async () => {
    const info = await call<{ privacyLevelOptions: string[]; stitchDisabled: boolean; nickname: string }>(
      creatorGet,
      `/api/social-accounts/${ttId}/tiktok-creator`,
      { token: owner.token, params: { id: ttId } },
    )
    expect(info.status).toBe(200)
    expect(info.json.data).toMatchObject({ nickname: 'Klima Servis', stitchDisabled: true })
    expect(info.json.data!.privacyLevelOptions).toContain('FOLLOWER_OF_CREATOR')

    const img = await uploadJpeg({ r: 30, g: 30, b: 30 })
    const created = await call<PostView>(postsPost, '/api/posts', {
      token: owner.token,
      body: {
        brandId,
        masterText: 'TikTok bez podešavanja',
        targets: [{ socialAccountId: ttId }],
        media: [{ mediaAssetId: img }],
      },
    })
    const v = await call<{ ok: boolean; problems: Array<{ problems: string[] }> }>(
      actionPost,
      `/api/posts/${created.json.data!.id}/validate`,
      {
        token: owner.token,
        params: { id: created.json.data!.id, action: 'validate' },
        body: {},
      },
    )
    expect(v.json.data!.ok).toBe(false)
    const problems = v.json.data!.problems.flatMap((p) => p.problems).join(' | ')
    expect(problems).toContain('ko može da vidi objavu')
    expect(problems).toContain('saglasnost')
  })

  it('foto objava: PULL_FROM_URL sa našeg domena, opcije iz editora, polling do objave sa linkom', async () => {
    resetLinkedInTikTokState()
    ttState.statusQueue = [
      { status: 'PROCESSING_DOWNLOAD' },
      { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['7311000000000000001'] },
    ]
    const img = await uploadJpeg({ r: 0, g: 160, b: 90 }, 2400, 3000)
    const { job } = await scheduledPost({
      title: 'Servis klime',
      masterText: 'Servis klime za 30 minuta #klima',
      targets: [{ socialAccountId: ttId, options: { tiktok: validTikTok } }],
      media: [{ mediaAssetId: img }],
    })
    const report = await runPublishTarget(job, ctx)
    expect(report.outcome).toBe('published')
    const t = await target(job.targetId)
    expect(t.external_post_id).toBe('7311000000000000001')
    expect(t.permalink).toBe('https://www.tiktok.com/@klimaservis/photo/7311000000000000001')

    const init = ttState.photoInits[0] as {
      post_mode: string
      media_type: string
      post_info: Record<string, unknown>
      source_info: { source: string; photo_images: string[]; photo_cover_index: number }
    }
    expect(init).toMatchObject({ post_mode: 'DIRECT_POST', media_type: 'PHOTO' })
    expect(init.post_info).toMatchObject({
      title: 'Servis klime',
      privacy_level: 'FOLLOWER_OF_CREATOR',
      disable_comment: false,
      brand_organic_toggle: true,
      brand_content_toggle: false,
    })
    expect(init.source_info.source).toBe('PULL_FROM_URL')
    const url = init.source_info.photo_images[0]!
    expect(url.startsWith('https://media.sova.test/api/media/public/')).toBe(true)
    expect(url.endsWith('.jpg')).toBe(true)

    // ruta servira JPEG do 1080 px širine, bez preusmeravanja; izmenjen token je 404
    const token = url.split('/').pop()!
    const res = await publicMediaGet(new NextRequest(new URL(`/api/media/public/${token}`, APP)), {
      params: Promise.resolve({ token }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect(meta.width).toBeLessThanOrEqual(1080)
    expect(meta.height).toBeLessThanOrEqual(1920)
    const sig = token.slice(0, -4)
    const forged = `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}.jpg`
    const bad = await publicMediaGet(new NextRequest(new URL(`/api/media/public/${forged}`, APP)), {
      params: Promise.resolve({ token: forged }),
    })
    expect(bad.status).toBe(404)
  })

  it('moderacija još traje: publish_id je privremeni ID, metrike ga kasnije razreše', async () => {
    resetLinkedInTikTokState()
    ttState.statusQueue = [{ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [] }]
    const img = await uploadJpeg({ r: 90, g: 90, b: 200 })
    const { job } = await scheduledPost({
      masterText: 'Objava na moderaciji',
      targets: [{ socialAccountId: ttId, options: { tiktok: validTikTok } }],
      media: [{ mediaAssetId: img }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    expect((await target(job.targetId)).external_post_id).toMatch(/^publish:p_pub_url~v2\./)

    ttState.statusQueue = [
      { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['7311000000000000002'] },
    ]
    expect((await capturePostMetrics(job.targetId, '1h')).status).toBe('captured')
    const t = await target(job.targetId)
    expect(t.external_post_id).toBe('7311000000000000002')
    const { data: snap } = await admin
      .from('post_metrics_snapshots')
      .select('reactions, comments, shares, impressions')
      .eq('target_id', job.targetId)
      .single()
    expect(snap).toMatchObject({ reactions: 77, comments: 9, shares: 4, impressions: 3100 })
  })

  it('privatnost više nije dostupna na nalogu: objava pada sa jasnom porukom', async () => {
    resetLinkedInTikTokState()
    ttState.privacyOptions = ['SELF_ONLY']
    const img = await uploadJpeg({ r: 250, g: 250, b: 0 })
    const { job } = await scheduledPost({
      masterText: 'Privatnost se promenila',
      targets: [{ socialAccountId: ttId, options: { tiktok: validTikTok } }],
      media: [{ mediaAssetId: img }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('failed')
    const t = await target(job.targetId)
    expect(t.status).toBe('failed')
    expect(t.last_error_message).toContain('privatnost')
    expect(ttState.photoInits).toHaveLength(0)
  })

  it('token pred istek se osvežava pre objave; TikTok-ov nov refresh token se čuva', async () => {
    resetLinkedInTikTokState()
    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq('id', ttId)
    const img = await uploadJpeg({ r: 5, g: 5, b: 5 })
    const { job } = await scheduledPost({
      masterText: 'Posle osvežavanja tokena',
      targets: [{ socialAccountId: ttId, options: { tiktok: validTikTok } }],
      media: [{ mediaAssetId: img }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const refresh = ttState.tokenRequests.find((r) => r.grant_type === 'refresh_token')
    expect(refresh?.refresh_token).toBe('rft.1')
    const row = (await loadAccountRow(ttId))!
    const tokens = tokensFor(row)
    expect(tokens.refreshToken).toMatch(/^rft\.\d+$/)
    expect(tokens.refreshToken).not.toBe('rft.1')
    expect(new Date(row.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000)

    // periodični posao: nalog kome ističe za 1 h se osvežava, onaj sa punim tokenom ne
    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() + 3600_000).toISOString() })
      .eq('id', ttId)
    const summary = await refreshOtherTokens()
    expect(summary.refreshed).toBeGreaterThanOrEqual(1)
  })

  it('video kroz FILE_UPLOAD: jedan deo za mali fajl, ručka za praćenje statusa', async () => {
    resetLinkedInTikTokState()
    const row = (await loadAccountRow(ttId))!
    const result = await new TikTokProvider().publish(
      {
        text: 'Kratak video servisa',
        link: null,
        media: [
          {
            url: 'https://storage.tiktok-fixture.test/v.mp4',
            mimeType: 'video/mp4',
            width: 1080,
            height: 1920,
            alt: null,
            durationMs: 15_000,
          },
        ],
        firstComment: null,
        isAiGenerated: true,
        clientKey: 'video-test',
        options: { tiktok: validTikTok },
      },
      refFor(row),
      tokensFor(row).accessToken,
    )
    expect(result.pending).toMatchObject({ kind: 'tiktok_publish', mediaType: 'video' })
    const init = ttState.videoInits[0] as {
      post_info: Record<string, unknown>
      source_info: Record<string, unknown>
    }
    expect(init.source_info).toEqual({
      source: 'FILE_UPLOAD',
      video_size: 1024 * 1024,
      chunk_size: 1024 * 1024,
      total_chunk_count: 1,
    })
    // stitch je isključen na nalogu: šalje se disable_stitch bez obzira na izbor
    expect(init.post_info).toMatchObject({
      privacy_level: 'FOLLOWER_OF_CREATOR',
      disable_stitch: true,
      is_aigc: true,
    })
    expect(ttState.chunks).toEqual([
      { range: `bytes 0-${1024 * 1024 - 1}/${1024 * 1024}`, size: 1024 * 1024 },
    ])
  })

  it('istorija i metrike naloga; prekid veze opoziva token na TikTok-u', async () => {
    const imported = await importAccountHistory(ttId)
    expect(imported).toMatchObject({ status: 'imported', imported: 2 })
    const { data: hist } = await admin
      .from('historical_posts')
      .select('external_id, metrics, permalink')
      .eq('social_account_id', ttId)
    expect(hist!.map((h) => h.external_id).sort()).toEqual(['7300000000000000001', '7300000000000000002'])
    expect((await captureAccountMetrics(ttId, new Date().toISOString().slice(0, 10))).status).toBe('captured')

    resetLinkedInTikTokState()
    const current = tokensFor((await loadAccountRow(ttId))!).accessToken
    const del = await call(accountDelete, `/api/social-accounts/${ttId}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: ttId },
    })
    expect(del.status).toBe(200)
    expect(ttState.revokes).toEqual([current])
    expect(await loadAccountRow(ttId)).toBeNull()
  })
})
