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

import { randomUUID } from 'node:crypto'

import { NextRequest } from 'next/server'
import sharp from 'sharp'

import { DELETE as brandDelete, PATCH as brandPatch } from '@/app/api/brands/[id]/route'
import { POST as cropPost } from '@/app/api/media/[id]/crop/route'
import { DELETE as mediaDelete } from '@/app/api/media/[id]/route'
import { POST as uploadPost } from '@/app/api/media/upload/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { POST as replacePost } from '@/app/api/posts/[id]/media/replace/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { DELETE as workspaceDelete } from '@/app/api/workspaces/[id]/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { storeGeneratedImage } from '@/services/media'
import { zonedToUtc } from '@/lib/zoned-time'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

let owner: TestUser
let wsId = ''
let brandId = ''
let fbId = ''

interface PostView {
  id: string
  version: number
  status: string
  scheduledFor?: string | null
  targets: Array<{ id: string; scheduledAt: string | null }>
  media?: Array<{ mediaAssetId: string }>
}

/** Jednobojna slika; `tint` daje drugi fajl (isti bajtovi bi se spojili u jedan medij). */
async function jpeg(width = 800, height = 800, tint = 20): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: tint, g: 90, b: 160 } } })
    .jpeg({ quality: 80 })
    .toBuffer()
}

/** Prelaz boja po obe ose: isečci sa različitih položaja daju različite fajlove. */
async function gradient(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      raw[i] = Math.round((y / height) * 255)
      raw[i + 1] = 90
      raw[i + 2] = Math.round((x / width) * 255)
    }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer()
}

async function uploadRaw(
  bytes: Buffer,
  name: string,
  type: string,
): Promise<{ status: number; json: { data?: { id: string }; error?: { message: string } } }> {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], name, { type }))
  form.set('workspaceId', wsId)
  form.set('brandId', brandId)
  const req = new NextRequest(new URL('/api/media/upload', APP), {
    method: 'POST',
    body: form,
    headers: { origin: APP, authorization: `Bearer ${owner.token}` },
  })
  const res = await uploadPost(req, { params: Promise.resolve({}) })
  return {
    status: res.status,
    json: (await res.json()) as { data?: { id: string }; error?: { message: string } },
  }
}

async function upload(width?: number, height?: number, tint?: number): Promise<string> {
  const r = await uploadRaw(await jpeg(width, height, tint), 'slika.jpg', 'image/jpeg')
  return r.json.data!.id
}

async function insertFacebookAccount(
  forBrand: string,
  forWorkspace: string,
  externalId: string,
): Promise<string> {
  const e = encryptSecret(`page-token-${externalId}`, `social:${forBrand}:facebook:${externalId}`)
  const { data, error } = await admin
    .from('social_accounts')
    .insert({
      brand_id: forBrand,
      workspace_id: forWorkspace,
      platform: 'facebook',
      external_id: externalId,
      name: 'Ivična strana',
      account_type: 'facebook_page',
      status: 'active',
      capabilities: { publish: true },
      metadata: { tasks: ['CREATE_CONTENT'] },
      assisted_only: false,
      access_token_enc: toPgBytea(e.ciphertext),
      key_version: e.keyVersion,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function createPost(
  text: string,
  media: string[] = [],
  on: { brandId: string; accountId: string } = { brandId, accountId: fbId },
): Promise<PostView> {
  const r = await call<PostView>(postsPost, '/api/posts', {
    token: owner.token,
    body: {
      brandId: on.brandId,
      masterText: text,
      targets: [{ socialAccountId: on.accountId }],
      media: media.map((id) => ({ mediaAssetId: id })),
    },
  })
  if (r.status !== 201) throw new Error(JSON.stringify(r.json.error))
  return r.json.data!
}

async function schedule(p: PostView, whenIso: string): Promise<PostView> {
  const r = await call<PostView>(actionPost, `/api/posts/${p.id}/schedule`, {
    token: owner.token,
    params: { id: p.id, action: 'schedule' },
    body: { version: p.version, scheduledFor: whenIso },
  })
  if (r.status !== 200) throw new Error(JSON.stringify(r.json.error))
  return r.json.data!
}

async function unschedule(postId: string, version: number): Promise<void> {
  const r = await call(actionPost, `/api/posts/${postId}/unschedule`, {
    token: owner.token,
    params: { id: postId, action: 'unschedule' },
    body: { version },
  })
  if (r.status !== 200) throw new Error(JSON.stringify(r.json.error))
}

function tomorrow(): string {
  const d = new Date(Date.now() + 2 * 86_400_000)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  owner = await createTestUser('edge')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Ivični slučajevi', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  fbId = await insertFacebookAccount(brandId, wsId, 'page-edge')
})

afterEach(() => {
  resetMemoryRateLimit()
  vi.mocked(enqueueTargetScheduled).mockClear()
  vi.mocked(enqueueTargetUnscheduled).mockClear()
})

afterAll(async () => {
  await deleteTestUser(owner)
})

describe('Mediji (U6, U7, U9)', () => {
  it('GIF se odbija sa objašnjenjem umesto opšte poruke o formatima', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
    const r = await uploadRaw(gif, 'animacija.gif', 'image/gif')
    expect(r.status).toBe(400)
    expect(r.json.error?.message).toContain('GIF još nije podržan')
  })

  it('medij u zakazanoj objavi se ne briše (409); posle otkazivanja zakazivanja briše se', async () => {
    const asset = await upload()
    const p = await createPost('Objava sa slikom koja se ne sme obrisati dok je zakazana', [asset])
    const s = await schedule(p, zonedToUtc(tomorrow(), '09:00', 'Europe/Belgrade'))
    const blocked = await call(mediaDelete, `/api/media/${asset}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: asset },
    })
    expect(blocked.status).toBe(409)
    expect(blocked.json.error?.message).toContain('zakazanoj objavi')

    const un = await call<PostView>(actionPost, `/api/posts/${p.id}/unschedule`, {
      token: owner.token,
      params: { id: p.id, action: 'unschedule' },
      body: { version: s.version },
    })
    expect(un.status).toBe(200)
    const ok = await call(mediaDelete, `/api/media/${asset}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: asset },
    })
    expect(ok.status).toBe(200)
    const { data } = await admin.from('media_assets').select('deleted_at').eq('id', asset).single()
    expect(data!.deleted_at).not.toBeNull()
  })

  it('zamena medija u zakazanoj objavi zadržava termin; stari medij se posle toga briše', async () => {
    const a = await upload(800, 800, 41)
    const b = await upload(800, 800, 42)
    const p = await createPost('Objava kojoj se menja slika bez otkazivanja termina', [a])
    const s = await schedule(p, zonedToUtc(tomorrow(), '10:17', 'Europe/Belgrade'))
    const replace = (body: Record<string, unknown>, token = owner.token) =>
      call<PostView>(replacePost, `/api/posts/${p.id}/media/replace`, { token, params: { id: p.id }, body })

    const r = await replace({ version: s.version, fromMediaId: a, toMediaId: b })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      status: 'scheduled',
      version: s.version + 1,
      scheduledFor: s.scheduledFor,
    })
    expect(r.json.data!.media!.map((m) => m.mediaAssetId)).toEqual([b])
    const { data: ver } = await admin
      .from('post_versions')
      .select('change_summary')
      .eq('post_id', p.id)
      .eq('version', s.version + 1)
      .single()
    expect(ver!.change_summary).toBe('zamena medija')

    const del = (id: string) =>
      call(mediaDelete, `/api/media/${id}`, { method: 'DELETE', token: owner.token, params: { id } })
    expect((await del(a)).status).toBe(200)
    expect((await del(b)).status).toBe(409)
    expect((await replace({ version: s.version, fromMediaId: b, toMediaId: a })).status).toBe(409)
    await unschedule(p.id, s.version + 1)
  })

  it('zamena: nacrt 409, medij van opsega mreže 400, urednik 403', async () => {
    const a = await upload(800, 800, 51)
    const b = await upload(800, 800, 52)
    const tall = (await uploadRaw(await gradient(540, 960), 'uspravna.jpg', 'image/jpeg')).json.data!.id
    const p = await createPost('Objava za pravila zamene medija u zakazanoj objavi', [a])
    const replace = (body: Record<string, unknown>, token = owner.token) =>
      call<PostView>(replacePost, `/api/posts/${p.id}/media/replace`, { token, params: { id: p.id }, body })

    expect((await replace({ version: p.version, fromMediaId: a, toMediaId: b })).status).toBe(409)
    const s = await schedule(p, zonedToUtc(tomorrow(), '11:23', 'Europe/Belgrade'))
    const bad = await replace({ version: s.version, fromMediaId: a, toMediaId: tall })
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.json.error)).toContain('Odnos stranica 9:16 je van opsega od 4:5 do 1,91:1')
    expect((await replace({ version: s.version, fromMediaId: b, toMediaId: a })).status).toBe(404)

    const editor = await createTestUser('edge-editor')
    try {
      await admin.from('workspace_members').insert({ workspace_id: wsId, user_id: editor.id, role: 'editor' })
      expect((await replace({ version: s.version, fromMediaId: a, toMediaId: b }, editor.token)).status).toBe(
        403,
      )
    } finally {
      await deleteTestUser(editor)
      await unschedule(p.id, s.version)
    }
  })

  it('kad upis u bazu ne uspe, fajl se briše iz skladišta (bez siročića)', async () => {
    const ghostWorkspace = randomUUID()
    await expect(
      storeGeneratedImage({
        workspaceId: ghostWorkspace,
        brandId: null,
        bytes: await jpeg(),
        mimeType: 'image/jpeg',
        generationId: randomUUID(),
        model: 'test-model',
        prompt: 'proba',
      }),
    ).rejects.toThrow()
    const { data: files } = await admin.storage.from('generated').list(`ws/${ghostWorkspace}/generated`)
    expect(files ?? []).toEqual([])
  })
})

describe('Promena zone brenda (K7)', () => {
  it('nepoznata zona 400; uz shiftSchedule zakazana objava zadržava isto lokalno vreme', async () => {
    const bad = await call(brandPatch, `/api/brands/${brandId}`, {
      method: 'PATCH',
      token: owner.token,
      params: { id: brandId },
      body: { timezone: 'Mars/Olympus' },
    })
    expect(bad.status).toBe(400)

    const date = tomorrow()
    const p = await createPost('Objava u 10 časova po lokalnom vremenu brenda za proveru zone')
    const s = await schedule(p, zonedToUtc(date, '10:00', 'Europe/Belgrade'))
    const targetId = s.targets[0]!.id
    const res = await call<{ timezone: string; shifted: { targets: number; posts: number } }>(
      brandPatch,
      `/api/brands/${brandId}`,
      {
        method: 'PATCH',
        token: owner.token,
        params: { id: brandId },
        body: { timezone: 'America/New_York', shiftSchedule: true },
      },
    )
    expect(res.status).toBe(200)
    expect(res.json.data!.timezone).toBe('America/New_York')
    expect(res.json.data!.shifted.targets).toBe(1)
    const expected = zonedToUtc(date, '10:00', 'America/New_York')
    const { data: t } = await admin
      .from('post_targets')
      .select('scheduled_at, status')
      .eq('id', targetId)
      .single()
    expect(new Date(t!.scheduled_at!).toISOString()).toBe(expected)
    expect(t!.status).toBe('scheduled')
    expect(vi.mocked(enqueueTargetUnscheduled)).toHaveBeenCalledWith(targetId)
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledWith(
      targetId,
      expected,
      expect.any(Number),
      fbId,
    )
    const { data: post } = await admin.from('posts').select('scheduled_for').eq('id', p.id).single()
    expect(new Date(post!.scheduled_for!).toISOString()).toBe(expected)
  })
})

describe('Dupli tekst na istom nalogu (K9)', () => {
  it('isti tekst kao zakazana objava na istom Facebook nalogu ne prolazi proveru; drugačiji prolazi; Instagram se ne proverava', async () => {
    const text = 'Besplatan pregled klima uređaja ove nedelje, javite se na vreme'
    const first = await createPost(text)
    await schedule(first, zonedToUtc(tomorrow(), '12:30', 'America/New_York'))
    const second = await createPost(`  ${text.toUpperCase()}  `)
    const v = await call<{ ok: boolean; problems: Array<{ problems: string[] }> }>(
      actionPost,
      `/api/posts/${second.id}/validate`,
      {
        token: owner.token,
        params: { id: second.id, action: 'validate' },
        body: {},
      },
    )
    expect(v.json.data!.ok).toBe(false)
    expect(v.json.data!.problems.flatMap((p) => p.problems).join(' ')).toContain(
      'Isti tekst je već zakazan na ovom nalogu',
    )
    expect(v.json.data!.problems.flatMap((p) => p.problems).join(' ')).toContain(
      'Facebook odbija identične objave',
    )

    // Instagram isti opis uz drugu sliku prima, pa za njega nema provere duplikata
    const { data: ig, error: igErr } = await admin
      .from('social_accounts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: 'ig-edge',
        name: 'ivicni.ig',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: true,
      })
      .select('id')
      .single()
    if (igErr) throw igErr
    // ista objava na Instagramu juče (direktno u bazi: Instagram bez slike ne može da se zakaže)
    const { data: igPost, error: igPostErr } = await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        master_text: text,
        status: 'published',
        created_by: owner.id,
      })
      .select('id')
      .single()
    if (igPostErr) throw igPostErr
    const { error: igTargetErr } = await admin.from('post_targets').insert({
      post_id: igPost.id,
      brand_id: brandId,
      social_account_id: ig.id,
      platform: 'instagram',
      status: 'published',
      external_post_id: 'ig-edge-1',
      published_at: new Date(Date.now() - 86_400_000).toISOString(),
    })
    if (igTargetErr) throw igTargetErr
    const igCheck = await createPost(text, [], { brandId, accountId: ig.id })
    const vi2 = await call<{ problems: Array<{ problems: string[] }> }>(
      actionPost,
      `/api/posts/${igCheck.id}/validate`,
      {
        token: owner.token,
        params: { id: igCheck.id, action: 'validate' },
        body: {},
      },
    )
    expect(vi2.json.data!.problems.flatMap((p) => p.problems).join(' ')).not.toContain('Isti tekst')
    const third = await createPost('Sasvim drugačiji tekst o čišćenju klima uređaja pred leto')
    const ok = await call<{ ok: boolean }>(actionPost, `/api/posts/${third.id}/validate`, {
      token: owner.token,
      params: { id: third.id, action: 'validate' },
      body: {},
    })
    expect(ok.json.data!.ok).toBe(true)
  })
})

describe('Meko brisanje brenda i radnog prostora', () => {
  it('vlasnik briše drugi brend i drugi radni prostor (200); zakazane objave se otkazuju', async () => {
    const ws2 = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
      token: owner.token,
      body: { name: 'Prostor za brisanje', type: 'business' },
    })
    const ws2Id = ws2.json.data!.workspaceId
    const ws2Brand = ws2.json.data!.brandId
    // drugi brend mimo limita besplatnog plana (1 brend), da bi brisanje brenda bilo dozvoljeno
    const { data: extra, error } = await admin
      .from('brands')
      .insert({ workspace_id: ws2Id, name: 'Drugi brend', created_by: owner.id })
      .select('id')
      .single()
    if (error) throw error
    const extraAccount = await insertFacebookAccount(extra.id, ws2Id, 'page-extra')
    const onExtra = await createPost('Zakazana objava drugog brenda koja se otkazuje pri brisanju', [], {
      brandId: extra.id,
      accountId: extraAccount,
    })
    await schedule(onExtra, zonedToUtc(tomorrow(), '11:00', 'Europe/Belgrade'))

    const del = await call<{ canceled: number }>(brandDelete, `/api/brands/${extra.id}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: extra.id },
    })
    expect(del.status).toBe(200)
    expect(del.json.data!.canceled).toBe(1)
    const { data: b } = await admin.from('brands').select('deleted_at, status').eq('id', extra.id).single()
    expect(b!.deleted_at).not.toBeNull()
    expect(b!.status).toBe('archived')
    const { data: canceledPost } = await admin.from('posts').select('status').eq('id', onExtra.id).single()
    expect(canceledPost!.status).toBe('canceled')

    const mainAccount = await insertFacebookAccount(ws2Brand, ws2Id, 'page-ws2')
    const onWs2 = await createPost('Zakazana objava prostora koji se briše, ne sme da ode na mrežu', [], {
      brandId: ws2Brand,
      accountId: mainAccount,
    })
    const scheduled = await schedule(onWs2, zonedToUtc(tomorrow(), '11:30', 'Europe/Belgrade'))
    vi.mocked(enqueueTargetUnscheduled).mockClear()
    const wsDel = await call<{ canceled: number }>(workspaceDelete, `/api/workspaces/${ws2Id}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: ws2Id },
    })
    expect(wsDel.status).toBe(200)
    expect(wsDel.json.data!.canceled).toBe(1)
    const { data: w } = await admin.from('workspaces').select('deleted_at').eq('id', ws2Id).single()
    expect(w!.deleted_at).not.toBeNull()
    expect(vi.mocked(enqueueTargetUnscheduled)).toHaveBeenCalledWith(scheduled.targets[0]!.id)
    const { data: t } = await admin
      .from('post_targets')
      .select('status')
      .eq('id', scheduled.targets[0]!.id)
      .single()
    expect(t!.status).toBe('canceled')
  })
})

describe('Sečenje slike (N9)', () => {
  const cut = (id: string, body: Record<string, unknown>) =>
    call<{ id: string; width: number; height: number }>(cropPost, `/api/media/${id}/crop`, {
      token: owner.token,
      params: { id },
      body,
    })

  it('9:16 se seče na 4:5 kao nova slika; original ostaje, opis i AI oznaka se nasleđuju', async () => {
    const original = (await uploadRaw(await gradient(540, 960), 'vertikalna.jpg', 'image/jpeg')).json.data!.id
    await admin
      .from('media_assets')
      .update({ alt_text: 'Vertikalni kadar', is_ai_generated: true })
      .eq('id', original)
    const r = await cut(original, { aspect: 0.8 })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ width: 540, height: 675 })
    expect(r.json.data!.id).not.toBe(original)
    const { data: row } = await admin.from('media_assets').select('*').eq('id', r.json.data!.id).single()
    expect(row).toMatchObject({ alt_text: 'Vertikalni kadar', is_ai_generated: true, brand_id: brandId })
    expect((row!.source_data as { cropped_from?: string }).cropped_from).toBe(original)
    const file = await admin.storage.from('uploads').download(row!.storage_path)
    const meta = await sharp(Buffer.from(await file.data!.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([540, 675])
    const { data: orig } = await admin
      .from('media_assets')
      .select('deleted_at, height')
      .eq('id', original)
      .single()
    expect(orig).toMatchObject({ deleted_at: null, height: 960 })

    // drugi položaj je drugi isečak, a isti zahtev ponovo vraća postojeći (bez duplikata)
    const top = await cut(original, { aspect: 0.8, position: 0 })
    expect(top.json.data!.id).not.toBe(r.json.data!.id)
    expect((await cut(original, { aspect: 0.8 })).json.data!.id).toBe(r.json.data!.id)
  })

  it('video se ne seče, premala slika i neispravan odnos se odbijaju', async () => {
    const small = await upload(300, 300, 61)
    const tooSmall = await cut(small, { aspect: 0.5 })
    expect(tooSmall.status).toBe(400)
    expect(tooSmall.json.error?.message).toContain('premala')
    expect((await cut(small, { aspect: 9 })).status).toBe(400)

    const videoId = randomUUID()
    await admin.from('media_assets').insert({
      id: videoId,
      workspace_id: wsId,
      brand_id: brandId,
      kind: 'video',
      source: 'upload',
      bucket: 'uploads',
      storage_path: `ws/${wsId}/brand/${brandId}/uploads/${videoId}.mp4`,
      mime_type: 'video/mp4',
      size_bytes: 1000,
      width: 1080,
      height: 1920,
      duration_ms: 5000,
    })
    const video = await cut(videoId, { aspect: 0.8 })
    expect(video.status).toBe(400)
    expect(video.json.error?.message).toContain('samo slike')
  })
})
