import { createHmac } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

import { GET as auditExportGet } from '@/app/api/admin/audit/export/route'
import { PATCH as flagPatch } from '@/app/api/admin/flags/[key]/route'
import { POST as exitPost } from '@/app/api/admin/impersonation/exit/route'
import { POST as impersonatePost } from '@/app/api/admin/impersonation/route'
import { POST as retryPost } from '@/app/api/admin/publishing/retry/route'
import { PUT as settingsPut } from '@/app/api/admin/settings/[key]/route'
import { POST as userActionPost } from '@/app/api/admin/users/[id]/[action]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { PATCH as membersPatch } from '@/app/api/workspaces/[id]/members/route'
import { DELETE as workspaceDelete, PATCH as workspacePatch } from '@/app/api/workspaces/[id]/route'
import { GET as workspacesGet, POST as workspacesPost } from '@/app/api/workspaces/route'
import { IMP_COOKIE, mintImpersonationJwt } from '@/lib/auth/impersonation-core'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { enqueueTargetScheduled } from '@/lib/jobs/enqueue'
import { getMaintenance } from '@/lib/maintenance'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import type { AdminContext } from '@/services/admin/audit'
import { listAudit } from '@/services/admin/audit'
import { getPublishMonitor } from '@/services/admin/monitor'
import { getAiCosts, getDashboard } from '@/services/admin/stats'
import { getUserDetail, listUsers } from '@/services/admin/users'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const stamp = Date.now()

/** RFC 6238 TOTP (SHA-1, 30 s, 6 cifara) — isto što računa aplikacija za autentifikaciju. */
function base32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const h = createHmac('sha1', base32(secret)).update(counter).digest()
  const o = h[h.length - 1]! & 0xf
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

/** Admin se dodeljuje samo kroz allowlist pri registraciji (kao u produkciji); MFA kroz pravi TOTP. */
async function createAdmin(tag: string, withMfa: boolean): Promise<TestUser> {
  const email = `it-${tag}-${stamp}@sova.local`
  const password = `Lozinka-${stamp}-${tag}!`
  const { error: allowErr } = await admin
    .from('platform_admin_allowlist')
    .insert({ email, note: 'integracioni test' })
  if (allowErr) throw allowErr
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signed, error: signErr } = await client.auth.signInWithPassword({ email, password })
  if (signErr || !signed.session) throw signErr ?? new Error('no session')
  let token = signed.session.access_token
  if (withMfa) {
    const { data: factor, error: enrollErr } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `it-${tag}`,
    })
    if (enrollErr) throw enrollErr
    const { data: verified, error: verifyErr } = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totp(factor.totp.secret),
    })
    if (verifyErr) throw verifyErr
    token = verified.access_token
  }
  return { id: data.user.id, email, token }
}

async function raw(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  path: string,
  opts: {
    method?: string
    token?: string
    body?: unknown
    query?: Record<string, string>
    cookie?: string
  } = {},
): Promise<Response> {
  const url = new URL(path, APP)
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v)
  const headers = new Headers({ origin: APP })
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`)
  if (opts.cookie) headers.set('cookie', opts.cookie)
  let body: string | undefined
  if (opts.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(opts.body)
  }
  const req = new NextRequest(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
  return handler(req, { params: Promise.resolve({}) })
}

let adm: TestUser
let admNoMfa: TestUser
let target: TestUser
let outsider: TestUser
let victim: TestUser
let unverifiedId = ''
let wsT = ''
let brandT = ''
let wsVictim = ''
let failedTargetId = ''
let failedPostId = ''
let ctx: AdminContext

async function startImpersonation(userId: string, extra: Record<string, unknown> = {}) {
  const res = await raw(impersonatePost, '/api/admin/impersonation', {
    token: adm.token,
    body: { userId, reason: 'Korisnik prijavio da ne vidi kalendar', ...extra },
  })
  const json = (await res.json()) as {
    ok: boolean
    data?: { sessionId: string; mode: string; expiresAt: string }
    error?: { code: string; message: string }
  }
  const setCookie = res.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0] ?? ''
  return { status: res.status, json, setCookie, cookie }
}

async function workspacesAs(token: string, cookie?: string) {
  return call<Array<{ workspaceId: string }>>(workspacesGet, '/api/workspaces', {
    token,
    headers: cookie ? { cookie } : {},
  })
}

async function auditRows(filter: { action: string; targetId?: string; sessionId?: string }) {
  let q = admin
    .from('admin_audit_log')
    .select('*')
    .eq('action', filter.action)
    .order('id', { ascending: false })
  if (filter.targetId) q = q.eq('target_id', filter.targetId)
  if (filter.sessionId) q = q.eq('impersonation_session_id', filter.sessionId)
  const { data } = await q
  return data ?? []
}

beforeAll(async () => {
  resetMemoryRateLimit()
  adm = await createAdmin('adm', true)
  admNoMfa = await createAdmin('adm-nomfa', false)
  target = await createTestUser('adm-target')
  outsider = await createTestUser('adm-outsider')
  victim = await createTestUser('adm-victim')
  ctx = {
    adminId: adm.id,
    adminEmail: adm.email,
    ip: '127.0.0.1',
    userAgent: 'vitest',
    requestId: 'it-admin',
  }

  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: target.token,
    body: { name: 'Admin test meta', type: 'business' },
  })
  wsT = ws.json.data!.workspaceId
  brandT = ws.json.data!.brandId
  const wsV = await call<{ workspaceId: string }>(workspacesPost, '/api/workspaces', {
    token: victim.token,
    body: { name: 'Admin test brisanje', type: 'business' },
  })
  wsVictim = wsV.json.data!.workspaceId

  const { data: unverified, error } = await admin.auth.admin.createUser({
    email: `it-adm-unverified-${stamp}@sova.local`,
    password: `Lozinka-${stamp}-u!`,
  })
  if (error) throw error
  unverifiedId = unverified.user.id

  // neuspela objava za monitor: nalog + objava kroz API, pa servisnom ulogom do 'failed' (dozvoljeni prelazi)
  const e = encryptSecret('page-token-admin', `social:${brandT}:facebook:page-adm`)
  const { data: account, error: accErr } = await admin
    .from('social_accounts')
    .insert({
      brand_id: brandT,
      workspace_id: wsT,
      platform: 'facebook',
      external_id: 'page-adm',
      name: 'Admin test strana',
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
  if (accErr) throw accErr
  const post = await call<{ id: string; targets: Array<{ id: string }> }>(postsPost, '/api/posts', {
    token: target.token,
    body: {
      brandId: brandT,
      masterText: `Admin monitor ${stamp}`,
      targets: [{ socialAccountId: account.id }],
    },
  })
  if (post.status !== 201) throw new Error(`post: ${JSON.stringify(post.json.error)}`)
  failedPostId = post.json.data!.id
  failedTargetId = post.json.data!.targets[0]!.id
  const when = new Date(Date.now() + (3 * 24 * 60 + Math.floor(Math.random() * 500)) * 60_000)
  when.setSeconds(0, 0)
  for (const status of ['scheduled', 'publishing', 'failed'] as const) {
    const { error: tErr } = await admin
      .from('post_targets')
      .update({
        status,
        scheduled_at: when.toISOString(),
        ...(status === 'failed'
          ? { last_error_code: 'TEST_FAIL', last_error_message: 'Mreža je odbila objavu (test).' }
          : {}),
      })
      .eq('id', failedTargetId)
    if (tErr) throw new Error(`target → ${status}: ${tErr.message}`)
  }
  for (const status of ['scheduled', 'publishing', 'failed'] as const) {
    const { error: pErr } = await admin.from('posts').update({ status }).eq('id', failedPostId)
    if (pErr) throw new Error(`post → ${status}: ${pErr.message}`)
  }
})

afterAll(async () => {
  await deleteTestUser(target)
  await deleteTestUser(outsider)
  await deleteTestUser(victim)
  if (unverifiedId) await admin.auth.admin.deleteUser(unverifiedId).catch(() => {})
  // audit log nema strane ključeve (migracija 019), pa se i test admini brišu; zapisi ostaju
  await deleteTestUser(adm)
  await deleteTestUser(admNoMfa)
  await admin
    .from('platform_admin_allowlist')
    .delete()
    .in('email', [adm?.email, admNoMfa?.email].filter(Boolean))
})

describe('API: admin pristup', () => {
  it('neulogovan 401, običan korisnik 403, admin bez MFA 403', async () => {
    const params = { id: target.id, action: 'logout' }
    const path = `/api/admin/users/${target.id}/logout`
    expect((await call(userActionPost, path, { params, body: {} })).status).toBe(401)
    expect((await call(userActionPost, path, { token: outsider.token, params, body: {} })).status).toBe(403)
    const noMfa = await call(userActionPost, path, { token: admNoMfa.token, params, body: {} })
    expect(noMfa.status).toBe(403)
    expect(noMfa.json.error?.message).toContain('dvofaktorsku')
  })
})

describe('API: admin korisnici', () => {
  it('pregled, lista i detalj; otvaranje detalja ide u audit', async () => {
    const dash = await getDashboard(30)
    expect(dash.users.total).toBeGreaterThanOrEqual(5)
    expect(dash.workspaces).toBeGreaterThanOrEqual(2)
    expect(dash.billing.enabled).toBe(false)

    const found = await listUsers({ q: target.email })
    expect(found.items.map((u) => u.id)).toEqual([target.id])
    expect(found.items[0]!.workspaces).toBe(1)
    const admins = await listUsers({ status: 'admin', q: `adm-${stamp}` })
    expect(admins.items.some((u) => u.id === adm.id)).toBe(true)
    const unverified = await listUsers({ status: 'unverified', q: 'it-adm-unverified' })
    expect(unverified.items.some((u) => u.id === unverifiedId)).toBe(true)

    const detail = await getUserDetail(ctx, target.id)
    expect(detail.workspaces.map((w) => w.id)).toEqual([wsT])
    expect(detail.brands.map((b) => b.id)).toEqual([brandT])
    expect(detail.socialAccounts[0]).not.toHaveProperty('access_token_enc')
    expect((await auditRows({ action: 'user.view', targetId: target.id })).length).toBe(1)
  })

  it('tokeni: dodavanje i oduzimanje uz razlog, ledger i tačno jedan audit zapis', async () => {
    const params = { id: target.id, action: 'tokens' }
    const path = `/api/admin/users/${target.id}/tokens`
    const add = await call<{ before: number; after: number }>(userActionPost, path, {
      token: adm.token,
      params,
      body: { workspaceId: wsT, delta: 25, reason: 'Kompenzacija za kašnjenje' },
    })
    expect(add.status).toBe(200)
    expect(add.json.data!.after).toBe(add.json.data!.before + 25)

    const { data: ledger } = await admin
      .from('token_ledger')
      .select('id, delta, reason, actor_id, note')
      .eq('workspace_id', wsT)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    expect(ledger).toMatchObject({
      delta: 25,
      reason: 'admin_adjust',
      actor_id: adm.id,
      note: 'Kompenzacija za kašnjenje',
    })

    const rows = await auditRows({ action: 'tokens.adjust', targetId: target.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ admin_email: adm.email, target_type: 'user' })
    expect(rows[0]!.after).toMatchObject({ delta: 25, ledgerId: ledger!.id, available: add.json.data!.after })
    expect((await auditRows({ action: 'tokens.adjust', targetId: wsT })).length).toBe(0)

    const sub = await call<{ before: number; after: number }>(userActionPost, path, {
      token: adm.token,
      params,
      body: { workspaceId: wsT, delta: -5, reason: 'Ispravka greške' },
    })
    expect(sub.json.data!.after).toBe(add.json.data!.after - 5)

    const tooMuch = await call(userActionPost, path, {
      token: adm.token,
      params,
      body: { workspaceId: wsT, delta: -100000, reason: 'Previše' },
    })
    expect(tooMuch.status).toBe(400)
    const zero = await call(userActionPost, path, {
      token: adm.token,
      params,
      body: { workspaceId: wsT, delta: 0, reason: 'Nula tokena' },
    })
    expect(zero.status).toBe(400)
    expect(zero.json.error?.message).toContain('0')
    const foreign = await call(userActionPost, path, {
      token: adm.token,
      params,
      body: { workspaceId: wsVictim, delta: 5, reason: 'Tuđi prostor' },
    })
    expect(foreign.status).toBe(400)
  })

  it('ban i unban: blokiran nalog ne prolazi kroz API; drugi admin i sopstveni nalog su zaštićeni', async () => {
    const ban = await call(userActionPost, `/api/admin/users/${target.id}/ban`, {
      token: adm.token,
      params: { id: target.id, action: 'ban' },
      body: { reason: 'Slanje spama kroz objave' },
    })
    expect(ban.status).toBe(200)
    const { data: p } = await admin
      .from('profiles')
      .select('is_banned, banned_reason')
      .eq('id', target.id)
      .single()
    expect(p).toMatchObject({ is_banned: true, banned_reason: 'Slanje spama kroz objave' })
    expect([401, 403]).toContain((await workspacesAs(target.token)).status)

    const unban = await call(userActionPost, `/api/admin/users/${target.id}/unban`, {
      token: adm.token,
      params: { id: target.id, action: 'unban' },
      body: {},
    })
    expect(unban.status).toBe(200)
    const { data: p2 } = await admin.from('profiles').select('is_banned').eq('id', target.id).single()
    expect(p2!.is_banned).toBe(false)
    const { data: authUser } = await admin.auth.admin.getUserById(target.id)
    expect(authUser.user?.banned_until ?? null).toBeNull()
    expect((await auditRows({ action: 'user.ban', targetId: target.id })).length).toBe(1)
    expect((await auditRows({ action: 'user.unban', targetId: target.id })).length).toBe(1)

    const otherAdmin = await call(userActionPost, `/api/admin/users/${admNoMfa.id}/ban`, {
      token: adm.token,
      params: { id: admNoMfa.id, action: 'ban' },
      body: { reason: 'Pokušaj nad adminom' },
    })
    expect(otherAdmin.status).toBe(403)
    const self = await call(userActionPost, `/api/admin/users/${adm.id}/ban`, {
      token: adm.token,
      params: { id: adm.id, action: 'ban' },
      body: { reason: 'Pokušaj nad sobom' },
    })
    expect(self.status).toBe(400)
  })

  it('odjava sa svih uređaja i ponovno slanje verifikacije', async () => {
    expect((await workspacesAs(victim.token)).status).toBe(200)
    const out = await call<{ sessions: number }>(userActionPost, `/api/admin/users/${victim.id}/logout`, {
      token: adm.token,
      params: { id: victim.id, action: 'logout' },
      body: {},
    })
    expect(out.status).toBe(200)
    expect(out.json.data!.sessions).toBeGreaterThanOrEqual(1)
    // sesija je obrisana: isti pristupni token više ne prolazi
    expect((await workspacesAs(victim.token)).status).toBe(401)

    const confirmed = await call(userActionPost, `/api/admin/users/${target.id}/resend-verification`, {
      token: adm.token,
      params: { id: target.id, action: 'resend-verification' },
      body: {},
    })
    expect(confirmed.status).toBe(409)
    const sent = await call(userActionPost, `/api/admin/users/${unverifiedId}/resend-verification`, {
      token: adm.token,
      params: { id: unverifiedId, action: 'resend-verification' },
      body: {},
    })
    expect(sent.status).toBe(200)
    expect((await auditRows({ action: 'user.resend_verification', targetId: unverifiedId })).length).toBe(1)
  })

  it('brisanje: pogrešan email 400, vlasnik tima 409, ispravno briše nalog i solo prostor; audit ostaje netaknut', async () => {
    const started = await startImpersonation(victim.id)
    expect(started.status).toBe(201)
    const sessionId = started.json.data!.sessionId
    expect(
      (await raw(exitPost, '/api/admin/impersonation/exit', { token: adm.token, body: {} })).status,
    ).toBe(200)

    const wrong = await call(userActionPost, `/api/admin/users/${victim.id}/delete`, {
      token: adm.token,
      params: { id: victim.id, action: 'delete' },
      body: { confirmEmail: 'pogresan@sova.local' },
    })
    expect(wrong.status).toBe(400)

    await admin.from('workspace_members').insert({ workspace_id: wsT, user_id: outsider.id, role: 'editor' })
    const owner = await call(userActionPost, `/api/admin/users/${target.id}/delete`, {
      token: adm.token,
      params: { id: target.id, action: 'delete' },
      body: { confirmEmail: target.email },
    })
    expect(owner.status).toBe(409)
    await admin.from('workspace_members').delete().eq('workspace_id', wsT).eq('user_id', outsider.id)

    const ok = await call<{ workspacesDeleted: number }>(
      userActionPost,
      `/api/admin/users/${victim.id}/delete`,
      {
        token: adm.token,
        params: { id: victim.id, action: 'delete' },
        body: { confirmEmail: victim.email.toUpperCase() },
      },
    )
    expect(ok.status).toBe(200)
    expect(ok.json.data!.workspacesDeleted).toBe(1)
    const { data: gone } = await admin.auth.admin.getUserById(victim.id)
    expect(gone.user ?? null).toBeNull()
    const { data: ws } = await admin.from('workspaces').select('id').eq('id', wsVictim)
    expect(ws).toEqual([])
    expect((await auditRows({ action: 'user.delete', targetId: victim.id })).length).toBe(1)
    // migracija 019: kaskada više ne dira audit (veza sa sesijom ostaje)
    const startRow = (await auditRows({ action: 'impersonation.start', targetId: victim.id }))[0]
    expect(startRow?.impersonation_session_id).toBe(sessionId)

    const adminDelete = await call(userActionPost, `/api/admin/users/${admNoMfa.id}/delete`, {
      token: adm.token,
      params: { id: admNoMfa.id, action: 'delete' },
      body: { confirmEmail: admNoMfa.email },
    })
    expect(adminDelete.status).toBe(403)
  })
})

describe('API: admin platforma', () => {
  it('flag se menja i vraća; nepoznat flag 404', async () => {
    const { data: flag } = await admin.from('feature_flags').select('enabled').eq('key', 'canva').single()
    const before = flag!.enabled
    try {
      const r = await call<{ enabled: boolean }>(flagPatch, '/api/admin/flags/canva', {
        method: 'PATCH',
        token: adm.token,
        params: { key: 'canva' },
        body: { enabled: !before },
      })
      expect(r.status).toBe(200)
      expect(r.json.data!.enabled).toBe(!before)
      const row = (await auditRows({ action: 'flag.update', targetId: 'canva' }))[0]
      expect(row).toMatchObject({
        admin_id: adm.id,
        before: { enabled: before },
        after: { enabled: !before },
      })
    } finally {
      await call(flagPatch, '/api/admin/flags/canva', {
        method: 'PATCH',
        token: adm.token,
        params: { key: 'canva' },
        body: { enabled: before },
      })
    }
    const missing = await call(flagPatch, '/api/admin/flags/nema.takvog', {
      method: 'PATCH',
      token: adm.token,
      params: { key: 'nema.takvog' },
      body: { enabled: true },
    })
    expect(missing.status).toBe(404)
  })

  it('cene tokena: izmena, nepoznata akcija 400, vraćanje', async () => {
    const { data: s } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'token_prices')
      .single()
    const original = s!.value as Record<string, number>
    try {
      const r = await call<{ tokenPrices: Record<string, number> }>(
        settingsPut,
        '/api/admin/settings/token-prices',
        {
          method: 'PUT',
          token: adm.token,
          params: { key: 'token-prices' },
          body: { prices: { hashtags: original.hashtags! + 1 } },
        },
      )
      expect(r.status).toBe(200)
      expect(r.json.data!.tokenPrices.hashtags).toBe(original.hashtags! + 1)
      expect(r.json.data!.tokenPrices.text).toBe(original.text)
      const bad = await call(settingsPut, '/api/admin/settings/token-prices', {
        method: 'PUT',
        token: adm.token,
        params: { key: 'token-prices' },
        body: { prices: { nepostojeca: 1 } },
      })
      expect(bad.status).toBe(400)
    } finally {
      await admin.from('platform_settings').update({ value: original }).eq('key', 'token_prices')
    }
  })

  it('modeli samo sa dozvoljene liste; održavanje uključuje banner', async () => {
    const { data: s } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'allowed_models')
      .single()
    const allowed = (s!.value as { text: string[] }).text
    try {
      const r = await call<{ activeModels: Record<string, string> }>(
        settingsPut,
        '/api/admin/settings/models',
        {
          method: 'PUT',
          token: adm.token,
          params: { key: 'models' },
          body: { models: { text: allowed[1] } },
        },
      )
      expect(r.status).toBe(200)
      expect(r.json.data!.activeModels.text).toBe(allowed[1])
      const bad = await call(settingsPut, '/api/admin/settings/models', {
        method: 'PUT',
        token: adm.token,
        params: { key: 'models' },
        body: { models: { text: 'nepoznat-model-1' } },
      })
      expect(bad.status).toBe(400)
      expect(bad.json.error?.message).toContain('dozvoljenoj listi')
    } finally {
      await call(settingsPut, '/api/admin/settings/models', {
        method: 'PUT',
        token: adm.token,
        params: { key: 'models' },
        body: { models: { text: null } },
      })
    }

    try {
      const m = await call<{ maintenance: { enabled: boolean; message: string } }>(
        settingsPut,
        '/api/admin/settings/maintenance',
        {
          method: 'PUT',
          token: adm.token,
          params: { key: 'maintenance' },
          body: { enabled: true, message: 'Večeras radimo održavanje.' },
        },
      )
      expect(m.json.data!.maintenance).toEqual({ enabled: true, message: 'Večeras radimo održavanje.' })
      expect(await getMaintenance()).toEqual({ enabled: true, message: 'Večeras radimo održavanje.' })
      const bad = await call(settingsPut, '/api/admin/settings/maintenance', {
        method: 'PUT',
        token: adm.token,
        params: { key: 'maintenance' },
        body: { enabled: 'da' },
      })
      expect(bad.status).toBe(400)
    } finally {
      await call(settingsPut, '/api/admin/settings/maintenance', {
        method: 'PUT',
        token: adm.token,
        params: { key: 'maintenance' },
        body: { enabled: false, message: '' },
      })
    }
    expect((await getMaintenance()).enabled).toBe(false)
  })
})

describe('API: admin monitor i troškovi', () => {
  it('monitor vidi neuspelu objavu; ponovni pokušaj je vraća u red, drugi put 409', async () => {
    const m = await getPublishMonitor({ platform: 'facebook', code: 'TEST_FAIL', days: 30 })
    expect(m.failed.map((t) => t.id)).toContain(failedTargetId)
    expect(m.groups.some((g) => g.platform === 'facebook' && g.code === 'TEST_FAIL')).toBe(true)

    const r = await call<{ scheduledAt: string }>(retryPost, '/api/admin/publishing/retry', {
      token: adm.token,
      body: { targetId: failedTargetId },
    })
    expect(r.status).toBe(200)
    const { data: t } = await admin
      .from('post_targets')
      .select('status, last_error_code')
      .eq('id', failedTargetId)
      .single()
    expect(t).toEqual({ status: 'scheduled', last_error_code: null })
    const { data: p } = await admin.from('posts').select('status').eq('id', failedPostId).single()
    expect(p!.status).toBe('scheduled')
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledWith(
      failedTargetId,
      r.json.data!.scheduledAt,
      expect.any(Number),
      expect.any(String),
    )
    expect((await auditRows({ action: 'publish.retry', targetId: failedTargetId })).length).toBe(1)

    const again = await call(retryPost, '/api/admin/publishing/retry', {
      token: adm.token,
      body: { targetId: failedTargetId },
    })
    expect(again.status).toBe(409)
    const missing = await call(retryPost, '/api/admin/publishing/retry', {
      token: adm.token,
      body: { targetId: crypto.randomUUID() },
    })
    expect(missing.status).toBe(404)

    // da ga watchdog lokalnog dev servera ne bi pokupio
    await admin.from('post_targets').update({ status: 'canceled' }).eq('id', failedTargetId)
    await admin.from('posts').update({ status: 'canceled' }).eq('id', failedPostId)
  })

  it('AI troškovi: besplatan prostor sa troškom ima negativnu maržu', async () => {
    const { error } = await admin.from('ai_generations').insert({
      workspace_id: wsT,
      brand_id: brandT,
      user_id: target.id,
      type: 'text',
      status: 'succeeded',
      model: 'gemini-3.8-flash',
      cost_usd: 0.25,
      tokens_charged: 2,
    })
    expect(error).toBeNull()
    const costs = await getAiCosts(30)
    const row = costs.byWorkspace.find((w) => w.workspaceId === wsT)
    expect(row).toMatchObject({
      ownerEmail: target.email,
      generations: 1,
      tokens: 2,
      paid: false,
      revenueUsd: 0,
      negative: true,
    })
    expect(row!.costUsd).toBeCloseTo(0.25, 6)
    expect(row!.marginUsd).toBeCloseTo(-0.25, 6)
    expect(costs.negativeCount).toBeGreaterThanOrEqual(1)
    expect(costs.byModel.some((m) => m.model === 'gemini-3.8-flash')).toBe(true)
  })
})

describe('API: admin audit', () => {
  it('filteri po korisniku, adminu i akciji; CSV izvoz sa BOM-om se i sam beleži', async () => {
    const byTarget = await listAudit({ target: target.email })
    expect(byTarget.total).toBeGreaterThanOrEqual(4)
    expect(byTarget.items.every((r) => r.targetId === target.id)).toBe(true)
    const byAction = await listAudit({ adminEmail: adm.email, action: 'tokens.' })
    expect(byAction.items.length).toBeGreaterThanOrEqual(2)
    expect(byAction.items.every((r) => r.action.startsWith('tokens.') && r.adminEmail === adm.email)).toBe(
      true,
    )

    const res = await raw(auditExportGet, '/api/admin/audit/export', {
      token: adm.token,
      query: { target: target.email },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="sova-audit-\d{8}\.csv"$/)
    // res.text() po Fetch specifikaciji skida BOM, pa se proveravaju bajtovi
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes)
    expect(text.split('\r\n')[0]).toBe(
      'vreme,admin,akcija,tip cilja,cilj,email cilja,pre,posle,ip,user agent,sesija impersonacije,request id',
    )
    expect(text).toContain('tokens.adjust')
    expect((await auditRows({ action: 'audit.export' })).some((r) => r.admin_id === adm.id)).toBe(true)

    const forbidden = await raw(auditExportGet, '/api/admin/audit/export', { token: outsider.token })
    expect([401, 403]).toContain(forbidden.status)
  })
})

describe('API: impersonacija', () => {
  it('provere pre početka: razlog, sopstveni nalog, drugi admin, potvrda za pun režim', async () => {
    resetMemoryRateLimit()
    expect((await startImpersonation(target.id, { reason: 'kratko' })).status).toBe(400)
    expect((await startImpersonation(adm.id)).status).toBe(400)
    expect((await startImpersonation(admNoMfa.id)).status).toBe(403)
    const full = await startImpersonation(target.id, { mode: 'full' })
    expect(full.status).toBe(400)
    expect(full.json.error?.message).toContain('email')
  })

  it('read-only: podaci korisnika kroz RLS, izmene blokirane, svaki zahtev u auditu, izlaz', async () => {
    const s = await startImpersonation(target.id)
    expect(s.status).toBe(201)
    expect(s.json.data!.mode).toBe('read_only')
    expect(s.setCookie).toContain(`${IMP_COOKIE}=`)
    expect(s.setCookie).toContain('HttpOnly')
    expect(s.setCookie).toContain('SameSite=Lax')
    expect(Number(/Max-Age=(\d+)/.exec(s.setCookie)?.[1])).toBeLessThanOrEqual(30 * 60)
    const sessionId = s.json.data!.sessionId
    expect((await auditRows({ action: 'impersonation.start', sessionId })).length).toBe(1)

    // admin nema radnih prostora; tokom impersonacije vidi tačno korisnikove
    expect((await workspacesAs(adm.token)).json.data).toEqual([])
    const asUser = await workspacesAs(adm.token, s.cookie)
    expect(asUser.json.data!.map((w) => w.workspaceId)).toEqual([wsT])
    const logged = await auditRows({ action: 'impersonation.request', sessionId })
    expect(logged[0]!.after).toEqual({ method: 'GET', path: '/api/workspaces' })
    expect(logged[0]!.admin_email).toBe(adm.email)

    const write = await call(workspacePatch, `/api/workspaces/${wsT}`, {
      method: 'PATCH',
      token: adm.token,
      params: { id: wsT },
      headers: { cookie: s.cookie },
      body: { name: 'Pokušaj izmene' },
    })
    expect(write.status).toBe(403)
    expect(write.json.error?.message).toContain('samo za čitanje')

    // admin rute rade sa stvarnim adminom i tokom impersonacije
    const exportDuring = await raw(auditExportGet, '/api/admin/audit/export', {
      token: adm.token,
      cookie: s.cookie,
      query: { action: 'impersonation.' },
    })
    expect(exportDuring.status).toBe(200)

    // cookie ne znači ništa bez admin sesije koja ga je napravila, ni uz lažan potpis
    expect((await workspacesAs(outsider.token, s.cookie)).json.data).toEqual([])
    expect((await workspacesAs(admNoMfa.token, s.cookie)).json.data).toEqual([])
    const forged = `${IMP_COOKIE}=${sessionId}.${'A'.repeat(43)}`
    expect((await workspacesAs(adm.token, forged)).json.data).toEqual([])

    // RLS kao druga linija odbrane: token sa imp.ro=true ne menja ništa ni direktno kroz PostgREST
    const jwt = (readOnly: boolean) =>
      mintImpersonationJwt(
        {
          userId: target.id,
          email: target.email,
          sessionId,
          adminId: adm.id,
          readOnly,
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          supabaseUrl: URL_,
        },
        process.env.SUPABASE_JWT_SECRET!,
      )
    const ro = createClient(URL_, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt(true)}` } },
      auth: { persistSession: false },
    })
    const { data: seen } = await ro.from('workspaces').select('id, name').eq('id', wsT)
    expect(seen).toHaveLength(1)
    const { data: changed } = await ro
      .from('workspaces')
      .update({ name: 'RLS proba' })
      .eq('id', wsT)
      .select('id')
    expect(changed ?? []).toEqual([])
    const full = createClient(URL_, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt(false)}` } },
      auth: { persistSession: false },
    })
    const { data: changedFull } = await full
      .from('workspaces')
      .update({ name: 'Admin test meta' })
      .eq('id', wsT)
      .select('id')
    expect(changedFull).toHaveLength(1)

    const exit = await raw(exitPost, '/api/admin/impersonation/exit', {
      token: adm.token,
      cookie: s.cookie,
      body: {},
    })
    const exitJson = (await exit.json()) as { data: { ended: number; redirect: string } }
    expect(exitJson.data).toEqual({ ended: 1, redirect: `/admin/users/${target.id}` })
    expect(exit.headers.get('set-cookie')).toContain('Max-Age=0')
    const { data: row } = await admin
      .from('impersonation_sessions')
      .select('ended_at, end_reason')
      .eq('id', sessionId)
      .single()
    expect(row!.ended_at).not.toBeNull()
    expect(row!.end_reason).toBe('exit')
    expect((await workspacesAs(adm.token, s.cookie)).json.data).toEqual([])
  })

  it('pun režim: obične izmene prolaze, zabranjene rute ostaju zatvorene; nova sesija zamenjuje staru; istek', async () => {
    resetMemoryRateLimit()
    const first = await startImpersonation(target.id)
    const wrongEmail = await startImpersonation(target.id, { mode: 'full', confirmEmail: 'neko@drugi.rs' })
    expect(wrongEmail.status).toBe(400)
    const s = await startImpersonation(target.id, { mode: 'full', confirmEmail: target.email.toUpperCase() })
    expect(s.status).toBe(201)
    expect(s.json.data!.mode).toBe('full')
    const { data: old } = await admin
      .from('impersonation_sessions')
      .select('end_reason')
      .eq('id', first.json.data!.sessionId)
      .single()
    expect(old!.end_reason).toBe('replaced')
    expect(
      (await auditRows({ action: 'impersonation.full_mode', sessionId: s.json.data!.sessionId })).length,
    ).toBe(1)

    const as = { token: adm.token, headers: { cookie: s.cookie } }
    const rename = await call(workspacePatch, `/api/workspaces/${wsT}`, {
      ...as,
      method: 'PATCH',
      params: { id: wsT },
      body: { name: 'Izmenjeno u punom režimu' },
    })
    expect(rename.status).toBe(200)
    const { data: ws } = await admin.from('workspaces').select('name').eq('id', wsT).single()
    expect(ws!.name).toBe('Izmenjeno u punom režimu')

    const create = await call(workspacesPost, '/api/workspaces', {
      ...as,
      body: { name: 'Novi', type: 'business' },
    })
    expect(create.status).toBe(403)
    expect((create.json.error as { details?: unknown } | undefined)?.details).toEqual({ impersonation: true })
    const del = await call(workspaceDelete, `/api/workspaces/${wsT}`, {
      ...as,
      method: 'DELETE',
      params: { id: wsT },
    })
    expect(del.status).toBe(403)
    const team = await call(membersPatch, `/api/workspaces/${wsT}/members`, {
      ...as,
      method: 'PATCH',
      params: { id: wsT },
      body: { userId: outsider.id, role: 'viewer' },
    })
    expect(team.status).toBe(403)
    expect(team.json.error?.message).toContain('Tim')

    // istek: sesija se zatvara pri sledećem zahtevu i to se beleži
    await admin
      .from('impersonation_sessions')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', s.json.data!.sessionId)
    expect((await workspacesAs(adm.token, s.cookie)).json.data).toEqual([])
    const { data: ended } = await admin
      .from('impersonation_sessions')
      .select('end_reason')
      .eq('id', s.json.data!.sessionId)
      .single()
    expect(ended!.end_reason).toBe('expired')
    expect(
      (await auditRows({ action: 'impersonation.expired', sessionId: s.json.data!.sessionId })).length,
    ).toBe(1)
  })
})
