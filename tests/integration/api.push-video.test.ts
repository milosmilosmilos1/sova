import { createECDH, randomBytes } from 'node:crypto'

import { http, HttpResponse } from 'msw'
import webpush from 'web-push'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as videoPost } from '@/app/api/approvals/[id]/video/route'
import { GET as pushGet } from '@/app/api/push/route'
import { POST as subscribePost } from '@/app/api/push/subscribe/route'
import { POST as testPost } from '@/app/api/push/test/route'
import { POST as unsubscribePost } from '@/app/api/push/unsubscribe/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setPushKeysForTests } from '@/lib/push/web-push'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { isPushEndpoint } from '@/lib/schemas/push'
import { notifyUsers } from '@/services/notifications'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Obaveštenja na telefonu i video iz karusela (D-118). */
let user: TestUser
let wsId = ''
let brandId = ''
const pushed: Array<{ device: string; ttl: string | null; auth: string | null }> = []

function subscription(device: string) {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${device}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  }
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(
    http.post('https://fcm.googleapis.com/fcm/send/:device', ({ request, params }) => {
      const device = String(params.device)
      pushed.push({ device, ttl: request.headers.get('ttl'), auth: request.headers.get('authorization') })
      // uređaj „gone” više ne postoji (korisnik je obrisao pregledač)
      return device.startsWith('gone')
        ? new HttpResponse(null, { status: 410 })
        : new HttpResponse(null, { status: 201 })
    }),
  )
  const keys = webpush.generateVAPIDKeys()
  setPushKeysForTests({ ...keys, subject: 'mailto:test@sova.test' })
  user = await createTestUser('push')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Push test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetMemoryRateLimit()
  pushed.length = 0
})

afterAll(async () => {
  setPushKeysForTests(undefined)
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('obaveštenja na telefonu', () => {
  it('dozvoljeni su samo servisi pregledača za obaveštenja', async () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true)
    expect(isPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.test/x')).toBe(false)
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    const bad = await call(subscribePost, '/api/push/subscribe', {
      token: user.token,
      body: { ...subscription('x'), endpoint: 'https://localhost/push' },
    })
    expect(bad.status).toBe(400)
  })

  it('pretplata, probno obaveštenje i obaveštenje „čeka odobrenje” stižu na uređaj', async () => {
    const status = await call<{ publicKey: string | null; devices: number }>(pushGet, '/api/push', {
      token: user.token,
    })
    expect(status.json.data!.publicKey).toBeTruthy()
    expect(status.json.data!.devices).toBe(0)
    const r = await call<{ devices: number }>(subscribePost, '/api/push/subscribe', {
      token: user.token,
      body: subscription('phone-1'),
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.devices).toBe(1)

    const test = await call<{ sent: number }>(testPost, '/api/push/test', {
      token: user.token,
      method: 'POST',
    })
    expect(test.json.data).toEqual({ sent: 1 })
    expect(pushed[0]).toMatchObject({ device: 'phone-1', ttl: '86400' })
    expect(pushed[0]!.auth).toMatch(/^vapid t=/)

    pushed.length = 0
    await notifyUsers({
      userIds: [user.id],
      workspaceId: wsId,
      brandId,
      type: 'post_review_requested',
      title: 'Objava čeka odobrenje',
      body: 'Letnji servis',
      link: '/app/approvals',
    })
    expect(pushed.map((p) => p.device)).toEqual(['phone-1'])
    // obaveštenje koje ne traži telefon ne ide na uređaj
    pushed.length = 0
    await notifyUsers({
      userIds: [user.id],
      workspaceId: wsId,
      brandId,
      type: 'post_published',
      title: 'Objavljeno',
      body: null,
    })
    expect(pushed).toEqual([])
  })

  it('pretplata koju servis više ne zna se briše; odjava briše uređaj', async () => {
    await call(subscribePost, '/api/push/subscribe', { token: user.token, body: subscription('gone-1') })
    const test = await call<{ sent: number }>(testPost, '/api/push/test', {
      token: user.token,
      method: 'POST',
    })
    expect(test.json.data!.sent).toBe(1)
    const { data: left } = await admin.from('push_subscriptions').select('endpoint').eq('user_id', user.id)
    expect(left!.map((s) => s.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/phone-1'])

    const off = await call<{ devices: number }>(unsubscribePost, '/api/push/unsubscribe', {
      token: user.token,
      body: { endpoint: 'https://fcm.googleapis.com/fcm/send/phone-1' },
    })
    expect(off.json.data!.devices).toBe(0)
  })
})

describe('video iz karusela', () => {
  it('nov nacrt dobija video, isti opis i samo naloge koji primaju video; priča postaje video', async () => {
    const base = {
      brand_id: brandId,
      workspace_id: wsId,
      status: 'active' as const,
      capabilities: { publish: true },
      metadata: {},
      assisted_only: false,
    }
    const { data: accounts } = await admin
      .from('social_accounts')
      .insert([
        {
          ...base,
          platform: 'instagram',
          external_id: `ig-v-${Date.now()}`,
          name: 'IG',
          account_type: 'instagram_business',
        },
        {
          ...base,
          platform: 'google_business',
          external_id: `gbp-v-${Date.now()}`,
          name: 'GBP',
          account_type: 'location',
        },
      ])
      .select('id, platform')
    const ig = accounts!.find((a) => a.platform === 'instagram')!.id
    const gbp = accounts!.find((a) => a.platform === 'google_business')!.id
    const asset = (kind: 'image' | 'video') => ({
      workspace_id: wsId,
      brand_id: brandId,
      kind,
      source: 'upload' as const,
      bucket: 'uploads',
      storage_path: `ws/${wsId}/brand/${brandId}/uploads/${crypto.randomUUID()}.${kind === 'video' ? 'mp4' : 'png'}`,
      mime_type: kind === 'video' ? 'video/mp4' : 'image/png',
      size_bytes: 1000,
      width: 1080,
      height: kind === 'video' ? 1920 : 1350,
      duration_ms: kind === 'video' ? 12000 : null,
    })
    const rows = [asset('image'), asset('image'), asset('video')]
    // fajlovi moraju da postoje u skladištu: pregled objave pravi potpisane linkove
    for (const row of rows)
      await admin.storage
        .from('uploads')
        .upload(row.storage_path, new Uint8Array([0, 1, 2, 3]), { contentType: row.mime_type })
    const { data: media } = await admin.from('media_assets').insert(rows).select('id, kind')
    const images = media!.filter((m) => m.kind === 'image').map((m) => m.id)
    const video = media!.find((m) => m.kind === 'video')!.id
    const { data: post } = await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        title: 'Tri saveta za leto',
        master_text: 'Opis karusela #leto',
        status: 'draft',
        created_by: user.id,
      })
      .select('id')
      .single()
    await admin
      .from('post_media')
      .insert(images.map((id, i) => ({ post_id: post!.id, media_asset_id: id, sort_order: i })))
    const { error: targetsError } = await admin.from('post_targets').insert([
      {
        post_id: post!.id,
        brand_id: brandId,
        social_account_id: ig,
        platform: 'instagram',
        text_content: '',
        options: { format: 'story' },
      },
      {
        post_id: post!.id,
        brand_id: brandId,
        social_account_id: gbp,
        platform: 'google_business',
        text_content: '',
        options: {},
      },
    ])

    expect(targetsError).toBeNull()
    const wrong = await call(videoPost, `/api/approvals/${post!.id}/video`, {
      token: user.token,
      params: { id: post!.id },
      body: { mediaAssetId: images[0] },
    })
    expect(wrong.status).toBe(400)
    const r = await call<{ postId: string; status: string; targets: number }>(
      videoPost,
      `/api/approvals/${post!.id}/video`,
      {
        token: user.token,
        params: { id: post!.id },
        body: { mediaAssetId: video },
      },
    )
    expect(r.status).toBe(201)
    expect(r.json.data).toMatchObject({ status: 'draft', targets: 1 })
    const { data: created } = await admin
      .from('posts')
      .select('title, master_text, status, post_media(media_asset_id), post_targets(platform, options)')
      .eq('id', r.json.data!.postId)
      .single()
    expect(created).toMatchObject({
      title: 'Tri saveta za leto (video)',
      master_text: 'Opis karusela #leto',
      status: 'draft',
      post_media: [{ media_asset_id: video }],
      post_targets: [{ platform: 'instagram', options: {} }],
    })
  })
})
