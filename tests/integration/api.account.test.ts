import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueTargetScheduled: vi.fn(async () => {}),
    enqueueTargetUnscheduled: vi.fn(async () => {}),
  }
})

import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

import { POST as deletePost } from '@/app/api/account/delete/route'
import { GET as exportGet } from '@/app/api/account/export/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { POST as transferPost } from '@/app/api/workspaces/[id]/transfer/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { resetMemoryRateLimit } from '@/lib/ratelimit'

import { geminiServer } from './gemini-mock'
import { admin, call, type TestUser } from './helpers'
import { linkedInTikTokHandlers, resetLinkedInTikTokState, ttState } from './linkedin-tiktok-mock'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const stamp = Date.now()

type User = TestUser & { password: string }

/** Korisnik sa poznatom lozinkom (brisanje naloga traži ponovnu potvrdu lozinkom). */
async function makeUser(tag: string): Promise<User> {
  const email = `it-acc-${tag}-${stamp}@sova.local`
  const password = `Lozinka-${stamp}-${tag}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signed, error: signErr } = await client.auth.signInWithPassword({ email, password })
  if (signErr || !signed.session) throw signErr ?? new Error('no session')
  return { id: data.user.id, email, token: signed.session.access_token, password }
}

let owner: User
let member: User
let wsShared = ''
let wsSolo = ''
let brandSolo = ''
let sharedPostId = ''

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...linkedInTikTokHandlers)
  owner = await makeUser('owner')
  member = await makeUser('member')
  const shared = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Zajednički prostor', type: 'agency' },
  })
  wsShared = shared.json.data!.workspaceId
  const solo = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Samo moj prostor', type: 'business' },
  })
  wsSolo = solo.json.data!.workspaceId
  brandSolo = solo.json.data!.brandId
  await admin.from('workspace_members').insert({ workspace_id: wsShared, user_id: member.id, role: 'editor' })

  const post = await call<{ id: string }>(postsPost, '/api/posts', {
    token: owner.token,
    body: { brandId: shared.json.data!.brandId, masterText: 'Objava vlasnika u zajedničkom prostoru' },
  })
  sharedPostId = post.json.data!.id

  // TikTok nalog u solo prostoru: pri brisanju naloga veza se opoziva i kod mreže
  const e = encryptSecret('act.delete-me', `social:${brandSolo}:tiktok:tt-del-1`)
  const r = encryptSecret('rft.delete-me', `social:${brandSolo}:tiktok:tt-del-1`)
  const { error } = await admin.from('social_accounts').insert({
    brand_id: brandSolo,
    workspace_id: wsSolo,
    platform: 'tiktok',
    external_id: 'tt-del-1',
    name: 'Brisanje TikTok',
    account_type: 'tiktok_account',
    status: 'active',
    capabilities: { publish: true },
    metadata: { providerUserId: 'tt-del-1' },
    access_token_enc: toPgBytea(e.ciphertext),
    refresh_token_enc: toPgBytea(r.ciphertext),
    key_version: e.keyVersion,
    token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  if (error) throw error
})

afterEach(() => {
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  for (const u of [owner, member]) if (u) await admin.auth.admin.deleteUser(u.id)
})

describe('Izvoz podataka', () => {
  it('JSON fajl sa profilom, radnim prostorima i objavama; bez tokena mreža i internih troškova', async () => {
    const res = await exportGet(
      new NextRequest(new URL('/api/account/export', APP), {
        headers: { authorization: `Bearer ${owner.token}`, origin: APP },
      }),
      { params: Promise.resolve({}) },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="sova-podaci-\d{8}\.json"$/)
    const text = await res.text()
    expect(text).not.toContain('access_token_enc')
    expect(text).not.toContain('act.delete-me')
    const data = JSON.parse(text) as {
      format: string
      profile: { email: string }
      memberships: unknown[]
      ownedWorkspaces: Array<{
        id: string
        name: string
        posts: unknown[]
        socialAccounts: Array<Record<string, unknown>>
      }>
    }
    expect(data.format).toBe('sova-izvoz-v1')
    expect(data.profile.email).toBe(owner.email)
    expect(data.memberships).toHaveLength(2)
    const shared = data.ownedWorkspaces.find((w) => w.id === wsShared)!
    expect(shared.posts).toHaveLength(1)
    const solo = data.ownedWorkspaces.find((w) => w.id === wsSolo)!
    expect(solo.socialAccounts[0]).toMatchObject({ name: 'Brisanje TikTok' })
    expect(solo.socialAccounts[0]).not.toHaveProperty('refresh_token_enc')
  })

  it('najviše tri izvoza na sat', async () => {
    const req = () =>
      exportGet(
        new NextRequest(new URL('/api/account/export', APP), {
          headers: { authorization: `Bearer ${member.token}`, origin: APP },
        }),
        {
          params: Promise.resolve({}),
        },
      )
    for (let i = 0; i < 3; i++) expect((await req()).status).toBe(200)
    expect((await req()).status).toBe(429)
  })
})

describe('Prenos vlasništva i brisanje naloga', () => {
  it('vlasnik tima ne može da obriše nalog dok ne prenese vlasništvo; pogrešan email 400', async () => {
    const wrong = await call(deletePost, '/api/account/delete', {
      token: owner.token,
      body: { confirmEmail: 'neko@drugi.rs', password: owner.password },
    })
    expect(wrong.status).toBe(400)
    const blocked = await call<unknown>(deletePost, '/api/account/delete', {
      token: owner.token,
      body: { confirmEmail: owner.email, password: owner.password },
    })
    expect(blocked.status).toBe(409)
    expect(blocked.json.error?.message).toContain('Zajednički prostor')
  })

  it('prenos: samo vlasnik, samo na člana; posle prenosa novi vlasnik dobija obaveštenje, stari je administrator', async () => {
    const notOwner = await call(transferPost, `/api/workspaces/${wsShared}/transfer`, {
      token: member.token,
      params: { id: wsShared },
      body: { userId: owner.id },
    })
    expect(notOwner.status).toBe(403)
    const stranger = await call(transferPost, `/api/workspaces/${wsShared}/transfer`, {
      token: owner.token,
      params: { id: wsShared },
      body: { userId: crypto.randomUUID() },
    })
    expect(stranger.status).toBe(404)
    const ok = await call(transferPost, `/api/workspaces/${wsShared}/transfer`, {
      token: owner.token,
      params: { id: wsShared },
      body: { userId: member.id },
    })
    expect(ok.status).toBe(200)
    const { data: ws } = await admin.from('workspaces').select('owner_id').eq('id', wsShared).single()
    expect(ws!.owner_id).toBe(member.id)
    const { data: roles } = await admin
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', wsShared)
    expect(roles!.find((r) => r.user_id === member.id)!.role).toBe('owner')
    expect(roles!.find((r) => r.user_id === owner.id)!.role).toBe('admin')
    const { data: notes } = await admin
      .from('notifications')
      .select('type')
      .eq('user_id', member.id)
      .eq('type', 'workspace_ownership')
    expect(notes).toHaveLength(1)
  })

  it('brisanje: lozinka mora biti tačna; nalog i solo prostor nestaju, veza se opoziva, objava u tuđem prostoru ostaje', async () => {
    resetLinkedInTikTokState()
    const badPassword = await call(deletePost, '/api/account/delete', {
      token: owner.token,
      body: { confirmEmail: owner.email, password: 'pogresna-lozinka' },
    })
    expect(badPassword.status).toBe(403)

    const res = await call<{ workspacesDeleted: number; redirect: string }>(
      deletePost,
      '/api/account/delete',
      {
        token: owner.token,
        body: { confirmEmail: owner.email.toUpperCase(), password: owner.password },
      },
    )
    expect(res.status).toBe(200)
    expect(res.json.data).toMatchObject({ workspacesDeleted: 1, redirect: '/login?nalog=obrisan' })
    expect(ttState.revokes).toEqual(['act.delete-me'])

    const { data: gone } = await admin.auth.admin.getUserById(owner.id)
    expect(gone.user ?? null).toBeNull()
    expect((await admin.from('workspaces').select('id').eq('id', wsSolo)).data).toEqual([])
    const { data: post } = await admin.from('posts').select('id, created_by').eq('id', sharedPostId).single()
    expect(post).toMatchObject({ id: sharedPostId, created_by: null })
    const { data: members } = await admin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', wsShared)
    expect(members!.map((m) => m.user_id)).toEqual([member.id])
  })
})
