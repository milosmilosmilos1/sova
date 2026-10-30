import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GET as calendarGet } from '@/app/api/calendar/route'
import { GET as guideGet } from '@/app/api/guide/route'
import { PATCH as ideaPatch } from '@/app/api/ideas/[id]/route'
import { POST as votePost } from '@/app/api/ideas/[id]/vote/route'
import { GET as ideasGet, POST as ideasPost } from '@/app/api/ideas/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Tabla predloga, vodič i sličice u kalendaru (D-115). */
let alice: TestUser
let bob: TestUser
let boss: TestUser
let wsId = ''
let brandId = ''
const ids: string[] = []

interface Idea {
  id: string
  kind: string
  title: string
  status: string
  votes: number
  voted: boolean
  mine: boolean
}

function list(token: string, query: Record<string, string> = {}) {
  return call<Idea[]>(ideasGet, '/api/ideas', { token, query })
}

beforeAll(async () => {
  alice = await createTestUser('ideas-a')
  bob = await createTestUser('ideas-b')
  boss = await createTestUser('ideas-admin')
  await admin.from('profiles').update({ platform_role: 'platform_admin' }).eq('id', boss.id)
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: alice.token,
    body: { name: 'Predlozi test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  if (ids.length) await admin.from('feature_requests').delete().in('id', ids)
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(alice)
  await deleteTestUser(bob)
  await deleteTestUser(boss)
})

describe('tabla predloga', () => {
  it('ideja je javna, prijava problema samo autoru i administratoru', async () => {
    const stamp = Date.now()
    const idea = await call<Idea>(ideasPost, '/api/ideas', {
      token: alice.token,
      body: { title: `Ponavljanje objave svake nedelje ${stamp}`, body: 'Da tok ponovi dobru objavu.' },
    })
    expect(idea.status).toBe(201)
    expect(idea.json.data).toMatchObject({ kind: 'idea', status: 'new', votes: 0, mine: true })
    const bug = await call<Idea>(ideasPost, '/api/ideas', {
      token: alice.token,
      body: { kind: 'bug', title: `Pregled slajda se ne učitava ${stamp}` },
    })
    expect(bug.status).toBe(201)
    ids.push(idea.json.data!.id, bug.json.data!.id)

    const short = await call(ideasPost, '/api/ideas', { token: alice.token, body: { title: 'ab' } })
    expect(short.status).toBe(400)

    const forBob = (await list(bob.token, { q: String(stamp) })).json.data!
    expect(forBob.map((i) => i.id)).toEqual([idea.json.data!.id])
    expect(forBob[0]!.mine).toBe(false)
    const forAlice = (await list(alice.token, { q: String(stamp) })).json.data!
    expect(forAlice.map((i) => i.kind).sort()).toEqual(['bug', 'idea'])
    const forBoss = (await list(boss.token, { q: String(stamp) })).json.data!
    expect(forBoss).toHaveLength(2)
    // znaci iz PostgREST filtera u pretrazi ne lome upit
    expect((await list(bob.token, { q: 'a,b(c)"d%' })).status).toBe(200)
  })

  it('glas se uključuje i isključuje, broj je tačan i za dva korisnika; prijava problema se ne glasa', async () => {
    const id = ids[0]!
    const v1 = await call<{ voted: boolean; votes: number }>(votePost, `/api/ideas/${id}/vote`, {
      token: bob.token,
      method: 'POST',
      params: { id },
    })
    expect(v1.json.data).toEqual({ voted: true, votes: 1 })
    const v2 = await call<{ voted: boolean; votes: number }>(votePost, `/api/ideas/${id}/vote`, {
      token: alice.token,
      method: 'POST',
      params: { id },
    })
    expect(v2.json.data).toEqual({ voted: true, votes: 2 })
    const v3 = await call<{ voted: boolean; votes: number }>(votePost, `/api/ideas/${id}/vote`, {
      token: bob.token,
      method: 'POST',
      params: { id },
    })
    expect(v3.json.data).toEqual({ voted: false, votes: 1 })
    const top = (await list(alice.token, { sort: 'top' })).json.data!.find((i) => i.id === id)!
    expect(top).toMatchObject({ votes: 1, voted: true })

    const bugVote = await call(votePost, `/api/ideas/${ids[1]}/vote`, {
      token: bob.token,
      method: 'POST',
      params: { id: ids[1]! },
    })
    expect(bugVote.status).toBe(404)
  })

  it('status menja samo administrator platforme', async () => {
    const id = ids[0]!
    const denied = await call(ideaPatch, `/api/ideas/${id}`, {
      token: alice.token,
      method: 'PATCH',
      params: { id },
      body: { status: 'planned' },
    })
    expect(denied.status).toBe(403)
    const ok = await call<Idea>(ideaPatch, `/api/ideas/${id}`, {
      token: boss.token,
      method: 'PATCH',
      params: { id },
      body: { status: 'planned' },
    })
    expect(ok.json.data!.status).toBe('planned')
  })
})

describe('vodič i kalendar', () => {
  it('vodič broji ključne korake brenda', async () => {
    const r = await call<{ steps: Array<{ key: string; done: boolean }>; done: number; next: string | null }>(
      guideGet,
      '/api/guide',
      { token: alice.token, query: { brandId } },
    )
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ done: 0, next: 'networks' })
    await admin
      .from('brands')
      .update({ voice: { offer: 'Servis klima', topics: [] } })
      .eq('id', brandId)
    const { data: post } = await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        master_text: 'Objava',
        status: 'scheduled',
        created_by: alice.id,
      })
      .select('id')
      .single()
    const after = await call<{
      steps: Array<{ key: string; done: boolean }>
      done: number
      next: string | null
    }>(guideGet, '/api/guide', { token: alice.token, query: { brandId } })
    expect(after.json.data!.steps).toEqual([
      { key: 'networks', done: false },
      { key: 'voice', done: true },
      { key: 'flow', done: false },
      { key: 'decision', done: true },
    ])
    expect((await call(guideGet, '/api/guide', { token: bob.token, query: { brandId } })).status).toBe(404)
    await admin.from('posts').delete().eq('id', post!.id)
  })

  it('kalendar daje sličicu prve slike objave, a tekst ostaje bez nje', async () => {
    const when = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const path = `ws/${wsId}/brand/${brandId}/uploads/${crypto.randomUUID()}.png`
    await admin.storage
      .from('uploads')
      .upload(path, new Uint8Array([137, 80, 78, 71]), { contentType: 'image/png' })
    const { data: asset } = await admin
      .from('media_assets')
      .insert({
        workspace_id: wsId,
        brand_id: brandId,
        kind: 'image',
        source: 'upload',
        bucket: 'uploads',
        storage_path: path,
        mime_type: 'image/png',
        size_bytes: 4,
      })
      .select('id')
      .single()
    const { data: posts } = await admin
      .from('posts')
      .insert([
        {
          brand_id: brandId,
          workspace_id: wsId,
          master_text: 'Sa slikom',
          status: 'draft',
          scheduled_for: when,
          created_by: alice.id,
        },
        {
          brand_id: brandId,
          workspace_id: wsId,
          master_text: 'Samo tekst',
          status: 'draft',
          scheduled_for: when,
          created_by: alice.id,
        },
      ])
      .select('id, master_text')
    const withImage = posts!.find((p) => p.master_text === 'Sa slikom')!.id
    await admin.from('post_media').insert({ post_id: withImage, media_asset_id: asset!.id, sort_order: 0 })
    const r = await call<{ items: Array<{ postId: string; thumb: string | null; mediaCount: number }> }>(
      calendarGet,
      '/api/calendar',
      {
        token: alice.token,
        query: {
          brandId,
          from: new Date().toISOString(),
          to: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        },
      },
    )
    expect(r.status).toBe(200)
    const byId = new Map(r.json.data!.items.map((i) => [i.postId, i]))
    expect(byId.get(withImage)!.thumb).toContain('token=')
    expect(byId.get(withImage)!.mediaCount).toBe(1)
    const textOnly = posts!.find((p) => p.master_text === 'Samo tekst')!.id
    expect(byId.get(textOnly)!.thumb).toBeNull()
  })
})
