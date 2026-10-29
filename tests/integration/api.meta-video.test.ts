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

import { POST as completePost } from '@/app/api/media/complete/route'
import { POST as uploadUrlPost } from '@/app/api/media/upload-url/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setMetaProviderForTests } from '@/integrations/social/registry'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { captureAccountMetrics, capturePostMetrics } from '@/services/analytics/metrics'
import { runPublishTarget, type PublishContext } from '@/services/posts/publisher'

import { buildMp4 } from '../fixtures/mp4'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { metaHandlers, metaState, resetMetaState } from './meta-mock'

/** Meta video (D-089): Instagram Reels i video u karuselu, Facebook Reels i video, nove metrike. */
let owner: TestUser
let wsId = ''
let brandId = ''
let fbId = ''
let igId = ''
const targets: Record<string, string> = {}

const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async () => {},
  sendEvent: async () => {},
  runId: 'test-run-meta-video',
}

interface PostView {
  id: string
  version: number
  targets: Array<{ id: string; scheduledAt: string | null }>
}

function enc(platform: string, externalId: string, token: string) {
  const e = encryptSecret(token, `social:${brandId}:${platform}:${externalId}`)
  return { access_token_enc: toPgBytea(e.ciphertext), key_version: e.keyVersion }
}

async function upload(bytes: Buffer, mimeType: string): Promise<string> {
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
    body: {
      brandId,
      uploadId: t.json.data!.uploadId,
      originalName: mimeType.startsWith('video') ? 'v.mp4' : 'i.jpg',
    },
  })
  if (done.status !== 200) throw new Error(JSON.stringify(done.json.error))
  return done.json.data!.id
}

const video = (width: number, height: number, durationMs: number) =>
  upload(buildMp4({ width, height, durationMs, mdatBytes: 30_000 }), 'video/mp4')

let slot = 3
async function scheduled(body: Record<string, unknown>) {
  const created = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: { brandId, ...body },
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
  if (s.status !== 200) throw new Error(JSON.stringify(s.json.error))
  const t = s.json.data!.targets[0]!
  return { postId: p.id, job: { targetId: t.id, scheduledAt: t.scheduledAt!, version: s.json.data!.version } }
}

async function target(id: string) {
  const { data } = await admin.from('post_targets').select('*').eq('id', id).single()
  return data!
}

async function problemsOf(body: Record<string, unknown>): Promise<string> {
  const created = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: { brandId, ...body },
  })
  const id = created.json.data!.id
  const v = await call<{ ok: boolean; problems: Array<{ problems: string[] }> }>(
    actionPost,
    `/api/posts/${id}/validate`,
    { token: owner.token, params: { id, action: 'validate' }, body: {} },
  )
  return v.json.data!.problems.flatMap((p) => p.problems).join(' | ')
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...metaHandlers)
  setMetaProviderForTests({ pollIntervalMs: 0, pollAttempts: 2 })
  owner = await createTestUser('meta-video')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Meta video test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const base = { brand_id: brandId, workspace_id: wsId, status: 'active', assisted_only: false }
  const { data, error } = await admin
    .from('social_accounts')
    .insert([
      {
        ...base,
        platform: 'facebook',
        external_id: 'page-1',
        name: 'Test strana',
        account_type: 'facebook_page',
        capabilities: { publish: true },
        metadata: { tasks: ['CREATE_CONTENT'] },
        ...enc('facebook', 'page-1', 'page-token-1'),
      },
      {
        ...base,
        platform: 'instagram',
        external_id: 'ig-1',
        external_parent_id: 'page-1',
        name: 'API IG',
        account_type: 'instagram_business',
        capabilities: { publish: true },
        metadata: {},
        ...enc('instagram', 'ig-1', 'page-token-1'),
      },
    ])
    .select('id, external_id')
  if (error) throw new Error(error.message)
  fbId = data!.find((a) => a.external_id === 'page-1')!.id
  igId = data!.find((a) => a.external_id === 'ig-1')!.id
})

afterEach(() => {
  resetMetaState()
  resetMemoryRateLimit()
})

afterAll(async () => {
  setMetaProviderForTests(null)
  geminiServer.close()
  await deleteTestUser(owner)
})

async function jpeg(r: number, g: number, b: number, size = 1080): Promise<string> {
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer()
  return upload(bytes, 'image/jpeg')
}

describe('Instagram video', () => {
  it('Reel: kontejner REELS sa video_url, objava posle obrade, prvi komentar posle objave', async () => {
    metaState.videoProcessingPolls = 1
    const v = await video(1080, 1920, 20_000)
    const { job } = await scheduled({
      masterText: 'Servis klime za 20 sekundi',
      firstComment: 'Zakažite na primer.rs',
      targets: [{ socialAccountId: igId }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const container = metaState.publishes.find((p) => p.path === 'ig-1/media')!
    expect(container.body).toMatchObject({
      media_type: 'REELS',
      caption: 'Servis klime za 20 sekundi',
      share_to_feed: 'true',
    })
    expect(container.body.video_url).toMatch(/^http/)
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toMatch(/^ig-reel-/)
    expect(metaState.publishes.at(-1)).toEqual({
      path: `${t.external_post_id}/comments`,
      body: { message: 'Zakažite na primer.rs' },
    })
    targets.igReel = job.targetId
  })

  it('karusel sa slikom i videom: delovi se obrade, pa karusel i objava (ručka prelazi u sledeću fazu)', async () => {
    metaState.videoProcessingPolls = 1
    const img = await jpeg(20, 90, 160)
    const v = await video(1080, 1080, 10_000)
    const { job } = await scheduled({
      masterText: 'Pre i posle servisa',
      targets: [{ socialAccountId: igId }],
      media: [{ mediaAssetId: img }, { mediaAssetId: v, sortOrder: 1 }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const media = metaState.publishes.filter((p) => p.path === 'ig-1/media')
    expect(media).toHaveLength(3)
    expect(media[0]!.body).toMatchObject({ is_carousel_item: 'true' })
    expect(media[0]!.body.image_url).toMatch(/^http/)
    expect(media[1]!.body).toMatchObject({ media_type: 'VIDEO', is_carousel_item: 'true' })
    const ids = Object.keys(metaState.containers).slice(0, 2)
    expect(media[2]!.body).toMatchObject({
      media_type: 'CAROUSEL',
      children: ids.join(','),
      caption: 'Pre i posle servisa',
    })
    expect(metaState.publishes.filter((p) => p.path === 'ig-1/media_publish')).toHaveLength(1)
    expect((await target(job.targetId)).status).toBe('published')
  })

  it('Instagram odbije video (2207026): target pada sa razumljivom porukom', async () => {
    metaState.videoFinalStatus = 'ERROR'
    const v = await video(1080, 1920, 8_000)
    const { job } = await scheduled({
      masterText: 'Video u pogrešnom formatu',
      targets: [{ socialAccountId: igId }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('failed')
    const t = await target(job.targetId)
    expect(t.status).toBe('failed')
    expect(t.last_error_message).toContain('MP4')
  })
})

describe('Facebook video', () => {
  it('Reel (uspravan, 20 s): video_reels start, bajtovi na rupload, finish sa opisom; objava kad je video spreman', async () => {
    metaState.fbVideoProcessingPolls = 1
    const v = await video(1080, 1920, 20_000)
    const { data: asset } = await admin.from('media_assets').select('size_bytes').eq('id', v).single()
    const { job } = await scheduled({
      masterText: 'Reel o servisu',
      linkUrl: 'https://primer.rs/servis',
      firstComment: 'Pitanja pišite ispod',
      targets: [{ socialAccountId: fbId }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const phases = metaState.publishes.filter((p) => p.path === 'page-1/video_reels').map((p) => p.body)
    expect(phases[0]).toMatchObject({ upload_phase: 'start' })
    expect(phases[1]).toMatchObject({ upload_phase: 'finish', video_state: 'PUBLISHED' })
    expect(phases[1]!.description).toContain('Reel o servisu')
    expect(phases[1]!.description).toContain('https://primer.rs/servis')
    expect(metaState.ruploads).toEqual([
      {
        videoId: phases[1]!.video_id,
        auth: 'OAuth page-token-1',
        offset: '0',
        fileSize: String(asset!.size_bytes),
        size: asset!.size_bytes,
      },
    ])
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toBe(phases[1]!.video_id)
    expect(t.permalink).toBe(`https://www.facebook.com/reel/${t.external_post_id}`)
    expect(metaState.publishes.at(-1)).toEqual({
      path: `${t.external_post_id}/comments`,
      body: { message: 'Pitanja pišite ispod' },
    })
    targets.fbReel = job.targetId
  })

  it('vodoravan video ide kroz /videos na graph-video sa file_url; link iz permalink_url', async () => {
    const v = await video(1920, 1080, 30_000)
    const { job } = await scheduled({
      masterText: 'Običan video',
      targets: [{ socialAccountId: fbId }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const sent = metaState.publishes.find((p) => p.path === 'graph-video:page-1/videos')!
    expect(sent.body.file_url).toMatch(/^http/)
    expect(sent.body.description).toBe('Običan video')
    expect(metaState.ruploads).toHaveLength(0)
    const t = await target(job.targetId)
    expect(t.permalink).toBe(`https://www.facebook.com/page-1/videos/${t.external_post_id}/`)
  })

  it('Facebook ne obradi video: target pada sa porukom', async () => {
    metaState.fbVideoFails = true
    const v = await video(1920, 1080, 12_000)
    const { job } = await scheduled({
      masterText: 'Video koji ne prolazi',
      targets: [{ socialAccountId: fbId }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('failed')
    expect((await target(job.targetId)).last_error_message).toContain('Facebook nije obradio video')
  })

  it('provera: Facebook ne meša sliku i video; Instagram Reel duži od 15 minuta ne prolazi', async () => {
    const img = await jpeg(200, 60, 10, 1200)
    const short = await video(1080, 1080, 8_000)
    expect(
      await problemsOf({
        masterText: 'Slika i video',
        targets: [{ socialAccountId: fbId }],
        media: [{ mediaAssetId: img }, { mediaAssetId: short, sortOrder: 1 }],
      }),
    ).toContain('ne meša slike i video')
    const long = await video(1080, 1920, 16 * 60_000)
    expect(
      await problemsOf({
        masterText: 'Predug Reel',
        targets: [{ socialAccountId: igId }],
        media: [{ mediaAssetId: long }],
      }),
    ).toContain('od 3 sekunde do 15 minuta')
  })
})

describe('Metrike posle gašenja starih Meta metrika', () => {
  it('Reel i Facebook video iz video_insights, IG Reel sa pregledima; nalozi bez ugašenih metrika', async () => {
    expect((await capturePostMetrics(targets.fbReel!, '24h')).status).toBe('captured')
    expect((await capturePostMetrics(targets.igReel!, '24h')).status).toBe('captured')
    const { data: snaps } = await admin
      .from('post_metrics_snapshots')
      .select('target_id, reactions, comments, video_views, reach, impressions')
      .in('target_id', [targets.fbReel!, targets.igReel!])
    const fb = snaps!.find((s) => s.target_id === targets.fbReel)!
    const ig = snaps!.find((s) => s.target_id === targets.igReel)!
    expect(fb).toMatchObject({ reactions: 7, comments: 2, video_views: 300 })
    expect(ig).toMatchObject({ reactions: 5, comments: 1, reach: 100, impressions: 101, video_views: 101 })

    const day = new Date().toISOString().slice(0, 10)
    expect((await captureAccountMetrics(fbId, day)).status).toBe('captured')
    expect((await captureAccountMetrics(igId, day)).status).toBe('captured')
    const { data: daily } = await admin
      .from('account_metrics_daily')
      .select('social_account_id, followers, reach')
      .in('social_account_id', [fbId, igId])
    expect(daily!.find((d) => d.social_account_id === fbId)).toMatchObject({ followers: 203, reach: 200 })
    expect(daily!.find((d) => d.social_account_id === igId)).toMatchObject({ followers: 860, reach: 100 })
  })
})

describe('Priče (D-107)', () => {
  const story = { format: 'story' }

  it('Instagram priča sa slikom: kontejner STORIES bez opisa, objava, bez prvog komentara', async () => {
    const img = await jpeg(200, 40, 90)
    const { job } = await scheduled({
      masterText: 'Natpis koji se ne objavljuje',
      firstComment: 'Ne ide uz priču',
      targets: [{ socialAccountId: igId, options: story }],
      media: [{ mediaAssetId: img }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const container = metaState.publishes.find((p) => p.path === 'ig-1/media')!
    expect(container.body.media_type).toBe('STORIES')
    expect(container.body.image_url).toMatch(/^http/)
    expect(container.body).not.toHaveProperty('caption')
    expect(metaState.publishes.filter((p) => p.path === 'ig-1/media_publish')).toHaveLength(1)
    expect(metaState.publishes.some((p) => p.path.endsWith('/comments'))).toBe(false)
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toMatch(/^ig-post-/)
  })

  it('Instagram priča sa videom: kontejner STORIES sa video_url, objava posle obrade', async () => {
    metaState.videoProcessingPolls = 1
    const v = await video(1080, 1920, 12_000)
    const { job } = await scheduled({
      masterText: 'Video priča',
      targets: [{ socialAccountId: igId, options: story }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const container = metaState.publishes.find((p) => p.path === 'ig-1/media')!
    expect(container.body).toMatchObject({ media_type: 'STORIES' })
    expect(container.body.video_url).toMatch(/^http/)
    expect((await target(job.targetId)).status).toBe('published')
  })

  it('Facebook priča sa slikom: neobjavljena fotografija pa photo_stories', async () => {
    const img = await jpeg(30, 160, 90)
    const { job } = await scheduled({
      masterText: 'Priča na stranici',
      targets: [{ socialAccountId: fbId, options: story }],
      media: [{ mediaAssetId: img }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const photo = metaState.publishes.find((p) => p.path === 'page-1/photos')!
    expect(photo.body).toMatchObject({ published: 'false' })
    expect(photo.body).not.toHaveProperty('caption')
    const sent = metaState.publishes.find((p) => p.path === 'page-1/photo_stories')!
    expect(sent.body.photo_id).toMatch(/^photo-/)
    expect(metaState.publishes.some((p) => p.path === 'page-1/feed')).toBe(false)
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toMatch(/^story-/)
  })

  it('Facebook priča sa videom: video_stories start, bajtovi na rupload, finish', async () => {
    const v = await video(1080, 1920, 15_000)
    const { data: asset } = await admin.from('media_assets').select('size_bytes').eq('id', v).single()
    const { job } = await scheduled({
      masterText: 'Video priča na stranici',
      targets: [{ socialAccountId: fbId, options: story }],
      media: [{ mediaAssetId: v }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const phases = metaState.publishes.filter((p) => p.path === 'page-1/video_stories').map((p) => p.body)
    expect(phases[0]).toMatchObject({ upload_phase: 'start' })
    expect(phases[1]).toMatchObject({ upload_phase: 'finish', video_id: phases[1]!.video_id })
    expect(metaState.ruploads).toEqual([
      {
        videoId: phases[1]!.video_id,
        auth: 'OAuth page-token-1',
        offset: '0',
        fileSize: String(asset!.size_bytes),
        size: asset!.size_bytes,
      },
    ])
    expect(metaState.publishes.some((p) => p.path === 'page-1/video_reels')).toBe(false)
    const t = await target(job.targetId)
    expect(t.status).toBe('published')
    expect(t.external_post_id).toMatch(/^story-/)
  })

  it('provera: priča ima tačno jedan medij, a video u priči traje od 3 do 60 sekundi', async () => {
    const a = await jpeg(10, 10, 10)
    const b = await jpeg(20, 20, 20)
    expect(
      await problemsOf({
        masterText: 'Dve slike',
        targets: [{ socialAccountId: igId, options: story }],
        media: [{ mediaAssetId: a }, { mediaAssetId: b, sortOrder: 1 }],
      }),
    ).toContain('Priča mora imati tačno jednu sliku ili jedan video.')
    const long = await video(1080, 1920, 90_000)
    expect(
      await problemsOf({
        masterText: 'Predug video',
        targets: [{ socialAccountId: fbId, options: story }],
        media: [{ mediaAssetId: long }],
      }),
    ).toContain('Video u priči traje od 3 do 60 sekundi.')
    // tekst preko limita mreže ne smeta priči, opis se ne objavljuje
    expect(
      await problemsOf({
        masterText: 'x'.repeat(2300),
        targets: [{ socialAccountId: igId, options: story }],
        media: [{ mediaAssetId: a }],
      }),
    ).toBe('')
  })
})
