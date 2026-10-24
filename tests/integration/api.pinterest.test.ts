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

import { PATCH as autopilotPatch } from '@/app/api/autopilot/[brandId]/route'
import { GET as callbackGet } from '@/app/api/integrations/[provider]/callback/route'
import { GET as connectGet } from '@/app/api/integrations/[provider]/connect/route'
import { POST as completePost } from '@/app/api/media/complete/route'
import { POST as uploadUrlPost } from '@/app/api/media/upload-url/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { GET as boardsGet } from '@/app/api/social-accounts/[id]/pinterest-boards/route'
import { POST as activatePost } from '@/app/api/social-accounts/activate/route'
import { GET as accountsGet } from '@/app/api/social-accounts/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { setPinterestProviderForTests } from '@/integrations/social/registry'
import { capturePostMetrics } from '@/services/analytics/metrics'
import { runPublishTarget, type PublishContext } from '@/services/posts/publisher'
import { loadAccountRow, tokensFor } from '@/services/social/account-rows'
import { importAccountHistory } from '@/services/social/history'
import { accessTokenFor } from '@/services/social/tokens'

import { buildMp4 } from '../fixtures/mp4'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pinState, pinterestHandlers, resetPinterestState } from './pinterest-mock'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let brandId = ''
let pinId = ''

const ctx: PublishContext = {
  run: (_name, fn) => fn(),
  sleepUntil: async () => {},
  sleep: async () => {},
  sendEvent: async () => {},
  runId: 'test-run-8c-pin',
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

async function image(r: number): Promise<string> {
  const jpeg = await sharp({
    create: { width: 1000, height: 1500, channels: 3, background: { r, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer()
  return upload(jpeg, 'image/jpeg', `pin-${r}.jpg`)
}

const pin = (extra: Record<string, unknown> = {}) => ({
  pinterest: { boardId: '1001', boardName: 'Saveti za klimu', ...extra },
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
  geminiServer.use(...pinterestHandlers)
  setPinterestProviderForTests({ sandbox: false })
  setFeatureFlagForTests('platform.pinterest', true)
  resetPinterestState()
  owner = await createTestUser('pin')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Pinterest test', type: 'business' },
  })
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  setPinterestProviderForTests(null)
  setFeatureFlagForTests('platform.pinterest', null)
  setFeatureFlagForTests('autopilot_level3', null)
  geminiServer.resetHandlers()
  geminiServer.close()
  await deleteTestUser(owner)
})

describe('Povezivanje i table', () => {
  it('OAuth sa Basic autentikacijom aplikacije; poslovni nalog; table kroz dve strane', async () => {
    const res = await connectGet(authed(`/api/integrations/pinterest/connect?brandId=${brandId}`), {
      params: Promise.resolve({ provider: 'pinterest' }),
    })
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://www.pinterest.com/oauth/')
    expect(loc.searchParams.get('scope')).toBe(
      'user_accounts:read,boards:read,boards:write,pins:read,pins:write',
    )
    const back = await callbackGet(
      authed(`/api/integrations/pinterest/callback?state=${loc.searchParams.get('state')}&code=pin-code`),
      { params: Promise.resolve({ provider: 'pinterest' }) },
    )
    const tokenReq = pinState.tokenRequests[0]!
    expect(tokenReq.authorization).toBe(
      `Basic ${Buffer.from('1234567:test-pinterest-secret-0123456789').toString('base64')}`,
    )
    expect(tokenReq.form).toEqual({
      grant_type: 'authorization_code',
      code: 'pin-code',
      redirect_uri: `${APP}/api/integrations/pinterest/callback`,
    })
    const pendingState = new URL(back.headers.get('location')!).searchParams.get('pending')!
    const list = await call<{ pending: Array<{ id: string; name: string; accountType: string }> }>(
      accountsGet,
      '/api/social-accounts',
      { token: owner.token, query: { brandId, pending: pendingState } },
    )
    const pending = list.json.data!.pending
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ name: 'Klima Servis', accountType: 'pinterest_business' })
    pinId = pending[0]!.id
    await call(activatePost, '/api/social-accounts/activate', {
      token: owner.token,
      body: { brandId, pendingState, ids: [pinId] },
    })
    const row = await loadAccountRow(pinId)
    expect(tokensFor(row!).refreshToken).toBe('pinr-1')
    expect(new Date(row!.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)

    const boards = await call<Array<{ id: string; name: string }>>(
      boardsGet,
      `/api/social-accounts/${pinId}/pinterest-boards`,
      {
        token: owner.token,
        params: { id: pinId },
      },
    )
    expect(boards.json.data!.map((b) => b.name)).toEqual(['Saveti za klimu', 'Akcije'])
  })
})

describe('Provera i objavljivanje', () => {
  it('bez table, bez medija i karusel od 6 slika ne prolaze proveru', async () => {
    const noBoard = await createPost({ masterText: 'Pin bez table', targets: [{ socialAccountId: pinId }] })
    const p = await problemsOf(noBoard.id)
    expect(p).toContain('Izaberite Pinterest tablu')
    expect(p).toContain('sliku ili video')
    const ids = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => image(i * 40)))
    const six = await createPost({
      masterText: 'Šest slika',
      targets: [{ socialAccountId: pinId, options: pin() }],
      media: ids.map((mediaAssetId) => ({ mediaAssetId })),
    })
    expect(await problemsOf(six.id)).toContain('najviše 5 slika')
  })

  it('pin sa slikom: tabla, naslov, opis, link sa UTM-om, link na pin', async () => {
    pinState.pins = []
    const img = await image(200)
    const job = await scheduled({
      masterText: 'Pet saveta kako da klima troši manje struje ovog leta',
      title: 'Klima koja štedi',
      linkUrl: 'https://tangerineseo.rs/saveti',
      targets: [{ socialAccountId: pinId, options: pin() }],
      media: [{ mediaAssetId: img }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const body = pinState.pins.at(-1)!
    expect(body).toMatchObject({
      board_id: '1001',
      title: 'Klima koja štedi',
      description: 'Pet saveta kako da klima troši manje struje ovog leta',
    })
    expect(body.link as string).toContain('https://tangerineseo.rs/saveti')
    expect(body.link as string).toContain('utm_source=pinterest')
    const source = body.media_source as { source_type: string; url: string }
    expect(source.source_type).toBe('image_url')
    expect(source.url).toContain('/storage/v1/object/sign/')
    const t = await target(job.targetId)
    expect(t.permalink).toBe(`https://www.pinterest.com/pin/${t.external_post_id}/`)
  })

  it('karusel od dve slike; nepostojeća tabla → target pada sa objašnjenjem', async () => {
    const a = await image(120)
    const b = await image(130)
    const job = await scheduled({
      masterText: 'Pre i posle čišćenja klime',
      targets: [{ socialAccountId: pinId, options: pin({ title: 'Pre i posle' }) }],
      media: [{ mediaAssetId: a }, { mediaAssetId: b }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const source = pinState.pins.at(-1)!.media_source as { source_type: string; items: unknown[] }
    expect(source.source_type).toBe('multiple_image_urls')
    expect(source.items).toHaveLength(2)

    const c = await image(140)
    const bad = await scheduled({
      masterText: 'Pin na tabli koja više ne postoji',
      targets: [{ socialAccountId: pinId, options: pin({ boardId: 'missing' }) }],
      media: [{ mediaAssetId: c }],
    })
    expect((await runPublishTarget(bad, ctx)).outcome).toBe('failed')
    expect((await target(bad.targetId)).last_error_message).toContain('tabla ne postoji')
  })

  it('video pin: registracija medija, upload na S3 bez Bearer-a, obrada, pa pin sa kadrom kao naslovnom', async () => {
    const video = await upload(
      buildMp4({ width: 1080, height: 1920, durationMs: 12_000, mdatBytes: 120_000 }),
      'video/mp4',
      'pin.mp4',
    )
    pinState.mediaPolls = 0
    pinState.mediaStatusQueue = ['processing', 'processing', 'succeeded']
    const job = await scheduled({
      masterText: 'Kako izgleda servis klime za 60 sekundi',
      targets: [{ socialAccountId: pinId, options: pin({ title: 'Servis za minut' }) }],
      media: [{ mediaAssetId: video }],
    })
    expect((await runPublishTarget(job, ctx)).outcome).toBe('published')
    const s3 = pinState.s3Uploads.at(-1)!
    expect(s3.fields).toEqual(expect.arrayContaining(['key', 'policy', 'x-amz-signature', 'file']))
    expect(s3.fields.at(-1)).toBe('file')
    const { data: asset } = await admin.from('media_assets').select('size_bytes').eq('id', video).single()
    expect(s3.fileSize).toBe(asset!.size_bytes)
    expect(pinState.mediaPolls).toBe(3)
    expect(pinState.pins.at(-1)!.media_source).toEqual({
      source_type: 'video_id',
      media_id: expect.stringMatching(/^med-\d+$/),
      cover_image_key_frame_time: 1,
    })
  })
})

describe('Tokeni i pravila Pinterest-a', () => {
  it('osvežavanje vraća nov refresh token (continuous) i čuva se', async () => {
    await admin
      .from('social_accounts')
      .update({ token_expires_at: new Date(Date.now() + 3_600_000).toISOString() })
      .eq('id', pinId)
    const token = await accessTokenFor((await loadAccountRow(pinId))!)
    expect(token).toBe('pina-refreshed-2')
    expect(pinState.tokenRequests.at(-1)!.form).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'pinr-1',
    })
    expect(tokensFor((await loadAccountRow(pinId))!).refreshToken).toBe('pinr-2')
  })

  it('bez uvoza istorije i metrika (čuvanje zabranjeno); Pinterest ne može na nivo 3 Autopilota', async () => {
    expect((await importAccountHistory(pinId)).imported).toBe(0)
    const { data: published } = await admin
      .from('post_targets')
      .select('id')
      .eq('social_account_id', pinId)
      .eq('status', 'published')
      .limit(1)
      .single()
    expect((await capturePostMetrics(published!.id, '24h')).reason).toContain('nema metrike objava')

    setFeatureFlagForTests('autopilot_level3', true)
    const { data: b } = await admin.from('brands').select('name').eq('id', brandId).single()
    const r = await call(autopilotPatch, `/api/autopilot/${brandId}`, {
      method: 'PATCH',
      token: owner.token,
      params: { brandId },
      body: { level: 3, confirm: b!.name, level3AccountIds: [pinId] },
    })
    expect(r.status).toBe(400)
    expect(r.json.error?.message).toContain('Pinterest')
  })
})
