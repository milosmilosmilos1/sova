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

import { DELETE as linkDelete } from '@/app/api/approval-links/[id]/route'
import { GET as linksGet, POST as linksPost } from '@/app/api/approval-links/route'
import { GET as calendarGet } from '@/app/api/calendar/route'
import { POST as actionPost } from '@/app/api/posts/[id]/[action]/route'
import { GET as commentsGet, POST as commentsPost } from '@/app/api/posts/[id]/comments/route'
import { DELETE as postDelete, GET as postGet, PATCH as postPatch } from '@/app/api/posts/[id]/route'
import { GET as versionsGet } from '@/app/api/posts/[id]/versions/route'
import { GET as postsGet, POST as postsPost } from '@/app/api/posts/route'
import { GET as publicGet, POST as publicPost } from '@/app/api/public/approvals/[token]/route'
import { GET as slotsGet, POST as slotsPost } from '@/app/api/queue-slots/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let owner: TestUser
let editor: TestUser
let stranger: TestUser | undefined
let wsId = ''
let brandId = ''
let fbAccountId = ''
let igAccountId = ''
let postId = ''
let version = 0

interface PostView {
  id: string
  status: string
  version: number
  masterText: string
  scheduledFor: string | null
  targets: Array<{
    id: string
    socialAccountId: string
    platform: string
    text: string
    usesMaster: boolean
    status: string
    scheduledAt: string | null
  }>
  media: Array<{ mediaAssetId: string }>
  actions: string[]
}

async function act<T = PostView>(
  id: string,
  action: string,
  body: Record<string, unknown>,
  token = owner.token,
) {
  return call<T>(actionPost, `/api/posts/${id}/${action}`, { token, params: { id, action }, body })
}

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

beforeAll(async () => {
  owner = await createTestUser('posts-owner')
  editor = await createTestUser('posts-editor')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Objave test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  // editor kao član (direktan upis: besplatan plan ima limit članova, a pozivnice su testirane u fazi 4)
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: editor.id, role: 'editor', all_brands: true })
  // dva aktivna naloga (Facebook stranica i Instagram) bez pravih tokena
  const { data: accounts, error: accErr } = await admin
    .from('social_accounts')
    .insert([
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: 'page-t1',
        name: 'Test strana',
        account_type: 'facebook_page',
        status: 'active',
        capabilities: { publish: true },
        metadata: { tasks: ['CREATE_CONTENT'] },
        assisted_only: false,
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: 'ig-t1',
        external_parent_id: 'page-t1',
        name: 'Test IG',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: true },
        metadata: { tasks: ['CREATE_CONTENT'] },
        assisted_only: true,
      },
    ])
    .select('id, platform')
  if (accErr) throw new Error('social_accounts insert: ' + accErr.message + ' ' + (accErr.details ?? ''))
  fbAccountId = accounts!.find((a) => a.platform === 'facebook')!.id
  igAccountId = accounts!.find((a) => a.platform === 'instagram')!.id
})

afterEach(() => {
  resetMemoryRateLimit()
  vi.mocked(enqueueTargetScheduled).mockClear()
  vi.mocked(enqueueTargetUnscheduled).mockClear()
})

afterAll(async () => {
  await deleteTestUser(editor)
  await deleteTestUser(stranger)
  await deleteTestUser(owner)
})

describe('Objave: kreiranje i izmene', () => {
  it('editor pravi nacrt sa dva targeta; verzija 1; lista ga vidi', async () => {
    const r = await call<PostView>(postsPost, '/api/posts', {
      token: editor.token,
      body: {
        brandId,
        title: 'Prva objava',
        masterText: 'Zdravo iz Sove! Ovo je test objava. #sova',
        targets: [
          { socialAccountId: fbAccountId },
          { socialAccountId: igAccountId, text: 'IG verzija teksta #sova #test' },
        ],
        linkUrl: 'https://fixture-site.test/',
      },
    })
    expect(r.status).toBe(201)
    postId = r.json.data!.id
    version = r.json.data!.version
    expect(version).toBe(1)
    expect(r.json.data!.status).toBe('draft')
    expect(r.json.data!.targets).toHaveLength(2)
    expect(r.json.data!.targets.find((t) => t.platform === 'facebook')!.usesMaster).toBe(true)
    expect(r.json.data!.targets.find((t) => t.platform === 'instagram')!.text).toBe(
      'IG verzija teksta #sova #test',
    )
    expect(r.json.data!.actions).toEqual(expect.arrayContaining(['submit', 'cancel', 'edit']))
    expect(r.json.data!.actions).not.toContain('schedule') // editor ne zakazuje iz nacrta
    const list = await call<{ items: Array<{ id: string; platforms: string[] }>; total: number }>(
      postsGet,
      '/api/posts',
      { token: editor.token, query: { brandId, status: 'draft' } },
    )
    expect(list.json.data!.total).toBe(1)
    expect(list.json.data!.items[0]!.platforms.sort()).toEqual(['facebook', 'instagram'])
  })

  it('PATCH sa zastarelom verzijom → 409; sa tačnom → verzija 2 i snimak', async () => {
    const stale = await call(postPatch, `/api/posts/${postId}`, {
      method: 'PATCH',
      token: editor.token,
      params: { id: postId },
      body: { version: 99, masterText: 'x' },
    })
    expect(stale.status).toBe(409)
    const ok = await call<PostView>(postPatch, `/api/posts/${postId}`, {
      method: 'PATCH',
      token: editor.token,
      params: { id: postId },
      body: {
        version,
        masterText: 'Zdravo iz Sove! Izmenjen tekst objave. #sova',
        targets: [{ socialAccountId: fbAccountId }],
      },
    })
    expect(ok.status).toBe(200)
    expect(ok.json.data!.version).toBe(2)
    expect(ok.json.data!.targets).toHaveLength(1)
    version = 2
    const versions = await call<Array<{ version: number; change_summary: string }>>(
      versionsGet,
      `/api/posts/${postId}/versions`,
      { token: editor.token, params: { id: postId } },
    )
    expect(versions.json.data!.map((v) => v.version)).toEqual([2, 1])
    const other = await call(postGet, `/api/posts/${postId}`, {
      token: (stranger = await createTestUser('posts-stranac')).token,
      params: { id: postId },
    })
    expect(other.status).toBe(404)
  })
})

describe('Tok odobravanja', () => {
  let linkToken = ''
  let linkId = ''
  it('editor ne može da zakaže iz nacrta (403), šalje na odobrenje → in_review, approvals red, obaveštenje vlasniku', async () => {
    const forbidden = await act(postId, 'schedule', { version, scheduledFor: future(60) }, editor.token)
    expect(forbidden.status).toBe(409)
    const r = await act(postId, 'submit', { version }, editor.token)
    expect(r.status).toBe(200)
    expect(r.json.data!.status).toBe('in_review')
    version = r.json.data!.version
    const { data: approvals } = await admin
      .from('approvals')
      .select('decision, requested_by')
      .eq('post_id', postId)
    expect(approvals).toHaveLength(1)
    expect(approvals![0]).toMatchObject({ decision: null, requested_by: editor.id })
    const { data: notif } = await admin
      .from('notifications')
      .select('type, user_id')
      .eq('brand_id', brandId)
      .eq('type', 'post_review_requested')
    expect(notif!.map((n) => n.user_id)).toContain(owner.id)
    const editorApprove = await act(postId, 'approve', { version }, editor.token)
    expect(editorApprove.status).toBe(403)
  })

  it('javni link: samo objave na odobrenju; klijent traži izmene uz komentar → nacrt; ponovno slanje i odobrenje', async () => {
    const bad = await call(linksPost, '/api/approval-links', {
      token: owner.token,
      body: { brandId, postIds: ['00000000-0000-0000-0000-000000000000'] },
    })
    expect(bad.status).toBe(400)
    const link = await call<{ id: string; url: string }>(linksPost, '/api/approval-links', {
      token: owner.token,
      body: { brandId, postIds: [postId], clientLabel: 'Klijent d.o.o.', expiresInDays: 3 },
    })
    expect(link.status).toBe(201)
    linkId = link.json.data!.id
    linkToken = link.json.data!.url.split('/approve/')[1]!
    const listed = await call<Array<{ id: string; url: string | null }>>(linksGet, '/api/approval-links', {
      token: owner.token,
      query: { brandId },
    })
    expect(listed.json.data![0]).toMatchObject({ id: linkId, url: null })

    const pub = await call<{
      brandName: string
      posts: Array<{ id: string; version: number; status: string; text: string; platforms: string[] }>
    }>(publicGet, `/api/public/approvals/${linkToken}`, { params: { token: linkToken } })
    expect(pub.status).toBe(200)
    expect(pub.json.data!.posts[0]).toMatchObject({
      id: postId,
      status: 'in_review',
      platforms: ['facebook'],
    })
    const missing = await call(publicGet, '/api/public/approvals/nepostojeci-token-xx', {
      params: { token: 'nepostojeci-token-xx' },
    })
    expect(missing.status).toBe(404)

    const noComment = await call(publicPost, `/api/public/approvals/${linkToken}`, {
      params: { token: linkToken },
      body: { kind: 'decision', postId, postVersion: version, decision: 'changes_requested' },
    })
    expect(noComment.status).toBe(400)
    const stale = await call(publicPost, `/api/public/approvals/${linkToken}`, {
      params: { token: linkToken },
      body: { kind: 'decision', postId, postVersion: 1, decision: 'approved' },
    })
    expect(stale.status).toBe(409)
    const changes = await call<{ status: string; comments: Array<{ author: string; body: string }> }>(
      publicPost,
      `/api/public/approvals/${linkToken}`,
      {
        params: { token: linkToken },
        body: {
          kind: 'decision',
          postId,
          postVersion: version,
          decision: 'changes_requested',
          comment: 'Dodajte cenu.',
          name: 'Marko',
        },
      },
    )
    expect(changes.status).toBe(200)
    expect(changes.json.data!.status).toBe('draft')
    expect(changes.json.data!.comments[0]).toMatchObject({ author: 'Marko', body: 'Dodajte cenu.' })
    const { data: linkRow } = await admin.from('approval_links').select('use_count').eq('id', linkId).single()
    expect(linkRow!.use_count).toBe(1)

    const view = await call<PostView>(postGet, `/api/posts/${postId}`, {
      token: editor.token,
      params: { id: postId },
    })
    version = view.json.data!.version
    const edit = await call<PostView>(postPatch, `/api/posts/${postId}`, {
      method: 'PATCH',
      token: editor.token,
      params: { id: postId },
      body: { version, masterText: 'Servis klime od 2.990 din. Zakažite danas! #sova' },
    })
    version = edit.json.data!.version
    const resubmit = await act(postId, 'submit', { version }, editor.token)
    version = resubmit.json.data!.version
    const approve = await act(postId, 'approve', { version, comment: 'Može.' })
    expect(approve.status).toBe(200)
    expect(approve.json.data!.status).toBe('approved')
    version = approve.json.data!.version
    const comments = await call<Array<{ authorName: string; body: string; viaLink: boolean }>>(
      commentsGet,
      `/api/posts/${postId}/comments`,
      { token: editor.token, params: { id: postId } },
    )
    expect(comments.json.data!.map((c) => c.viaLink)).toEqual([true, false])
    const revoke = await call(linkDelete, `/api/approval-links/${linkId}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: linkId },
    })
    expect(revoke.status).toBe(200)
    const gone = await call(publicGet, `/api/public/approvals/${linkToken}`, { params: { token: linkToken } })
    expect(gone.status).toBe(404)
  })
})

describe('Zakazivanje', () => {
  let secondId = ''
  it('prošlost → 400 sa hintom; budućnost → scheduled, target scheduled, događaj poslat', async () => {
    const past = await act(
      postId,
      'schedule',
      { version, scheduledFor: new Date(Date.now() - 3600_000).toISOString() },
      editor.token,
    )
    expect(past.status).toBe(400)
    expect(past.json.error?.message).toMatch(/Objavi sada/)
    const when = future(120)
    const r = await act(postId, 'schedule', { version, scheduledFor: when }, editor.token)
    expect(r.status).toBe(200)
    expect(r.json.data!.status).toBe('scheduled')
    expect(new Date(r.json.data!.scheduledFor!).toISOString()).toBe(when)
    expect(r.json.data!.targets[0]!.status).toBe('scheduled')
    expect(new Date(r.json.data!.targets[0]!.scheduledAt!).toISOString()).toBe(when)
    version = r.json.data!.version
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(enqueueTargetScheduled).mock.calls[0]![1]).toBe(when)
    const edit = await call(postPatch, `/api/posts/${postId}`, {
      method: 'PATCH',
      token: editor.token,
      params: { id: postId },
      body: { version, masterText: 'x' },
    })
    expect(edit.status).toBe(409) // zakazana se ne menja bez otkazivanja zakazivanja
  })

  it('isti minut na istom nalogu → 409 (K8); druga objava u drugom minutu prolazi', async () => {
    const created = await call<PostView>(postsPost, '/api/posts', {
      token: owner.token,
      body: { brandId, masterText: 'Druga objava', targets: [{ socialAccountId: fbAccountId }] },
    })
    secondId = created.json.data!.id
    const first = await call<PostView>(postGet, `/api/posts/${postId}`, {
      token: owner.token,
      params: { id: postId },
    })
    const sameMinute = await act(secondId, 'schedule', {
      version: created.json.data!.version,
      scheduledFor: first.json.data!.scheduledFor,
    })
    expect(sameMinute.status).toBe(409)
    expect(sameMinute.json.error?.message).toMatch(/istom minutu/)
    const check = await call<PostView>(postGet, `/api/posts/${secondId}`, {
      token: owner.token,
      params: { id: secondId },
    })
    expect(check.json.data!.status).toBe('draft')
    expect(check.json.data!.targets[0]!.status).toBe('pending')
    const ok = await act(secondId, 'schedule', {
      version: check.json.data!.version,
      scheduledFor: future(125),
    })
    expect(ok.status).toBe(200) // owner zakazuje direktno iz nacrta
  })

  it('pauza, nastavak, otkazivanje zakazivanja, otkazivanje, vraćanje, brisanje; kalendar prikazuje zakazane', async () => {
    const cal = await call<{ items: Array<{ postId: string; status: string }>; timezone: string }>(
      calendarGet,
      '/api/calendar',
      {
        token: owner.token,
        query: { brandId, from: new Date().toISOString(), to: future(24 * 60) },
      },
    )
    expect(cal.json.data!.timezone).toBe('Europe/Belgrade')
    expect(cal.json.data!.items.map((i) => i.postId).sort()).toEqual([postId, secondId].sort())

    const paused = await act(postId, 'pause', { version })
    expect(paused.json.data!.status).toBe('paused')
    expect(paused.json.data!.targets[0]!.status).toBe('paused')
    expect(vi.mocked(enqueueTargetUnscheduled)).toHaveBeenCalledTimes(1)
    version = paused.json.data!.version
    const resumed = await act(postId, 'resume', { version })
    expect(resumed.json.data!.status).toBe('scheduled')
    expect(resumed.json.data!.targets[0]!.status).toBe('scheduled')
    version = resumed.json.data!.version
    const unscheduled = await act(postId, 'unschedule', { version })
    expect(unscheduled.json.data!.status).toBe('draft')
    expect(unscheduled.json.data!.targets[0]).toMatchObject({ status: 'pending', scheduledAt: null })
    version = unscheduled.json.data!.version
    const canceled = await act(postId, 'cancel', { version })
    expect(canceled.json.data!.status).toBe('canceled')
    version = canceled.json.data!.version
    const restored = await act(postId, 'restore', { version })
    expect(restored.json.data!.status).toBe('draft')
    expect(restored.json.data!.targets[0]!.status).toBe('pending')
    version = restored.json.data!.version
    const editorDelete = await call(postDelete, `/api/posts/${postId}`, {
      method: 'DELETE',
      token: editor.token,
      params: { id: postId },
    })
    expect(editorDelete.status).toBe(403)
    const del = await call(postDelete, `/api/posts/${postId}`, {
      method: 'DELETE',
      token: owner.token,
      params: { id: postId },
    })
    expect(del.status).toBe(200)
    const after = await call(postGet, `/api/posts/${postId}`, { token: owner.token, params: { id: postId } })
    expect(after.status).toBe(404)
  })

  it('komentari tima i red objava sa sledećim slobodnim terminom', async () => {
    const c = await call<{ authorName: string; body: string }>(
      commentsPost,
      `/api/posts/${secondId}/comments`,
      { token: editor.token, params: { id: secondId }, body: { body: 'Može li ranije?' } },
    )
    expect(c.status).toBe(201)
    expect(c.json.data!.body).toBe('Može li ranije?')
    const slot = await call<{ id: string; weekday: number; timeLocal: string }>(
      slotsPost,
      '/api/queue-slots',
      { token: owner.token, body: { brandId, socialAccountId: fbAccountId, weekday: 1, timeLocal: '09:30' } },
    )
    expect(slot.status).toBe(201)
    expect(slot.json.data).toMatchObject({ weekday: 1, timeLocal: '09:30' })
    const dup = await call(slotsPost, '/api/queue-slots', {
      token: owner.token,
      body: { brandId, socialAccountId: fbAccountId, weekday: 1, timeLocal: '09:30' },
    })
    expect(dup.status).toBe(409)
    const next = await call<{ next: string | null }>(slotsGet, '/api/queue-slots', {
      token: owner.token,
      query: { brandId, socialAccountId: fbAccountId, next: '1' },
    })
    expect(next.json.data!.next).toBeTruthy()
    const nextDate = new Date(next.json.data!.next!)
    expect(nextDate.getTime()).toBeGreaterThan(Date.now())
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Belgrade',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).format(nextDate)
    expect(local).toMatch(/Mon/)
    expect(local).toMatch(/09:30/)
    const list = await call<Array<{ id: string }>>(slotsGet, '/api/queue-slots', {
      token: owner.token,
      query: { brandId },
    })
    expect(list.json.data).toHaveLength(1)
  })
})
