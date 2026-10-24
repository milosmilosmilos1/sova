// Testovi baze: RLS izolacija (korisnik A naspram B), RPC za tokene, trigeri.
// Pokretanje: npm run test:db (traži pokrenut lokalni Supabase i .env.local).
// Čita .env.local ručno da ne zavisi od Next-a.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
    }
  } catch {
    // env iz procesa (CI)
  }
}
loadEnv()

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Nedostaju NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE u .env.local')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

let passed = 0
let failed = 0
const failures = []
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed++
    failures.push({ name, err })
    console.log(`  FAIL ${name}\n       ${err?.message ?? err}`)
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
function expectError(result, pattern, msg) {
  assert(result.error, msg ?? `očekivana greška ${pattern}`)
  if (pattern)
    assert(
      String(result.error.message).includes(pattern) ||
        String(result.error.details ?? '').includes(pattern) ||
        String(result.error.hint ?? '').includes(pattern),
      `${msg ?? 'greška'}: dobijeno "${result.error.message}"`,
    )
}

const stamp = Date.now()
const users = {}

async function makeUser(tag) {
  const email = `test-${tag}-${stamp}@sova.local`
  const password = `Lozinka-${stamp}-${tag}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signErr } = await client.auth.signInWithPassword({ email, password })
  if (signErr) throw signErr
  return { id: data.user.id, email, client }
}

async function cleanup() {
  for (const u of Object.values(users)) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
}

const TABLES_WITH_WORKSPACE = [
  'workspaces',
  'workspace_members',
  'ai_generations',
  'media_assets',
  'posts',
  'token_grants',
  'token_ledger',
  'token_reservations',
  'subscriptions',
  'invitations',
  'notifications',
]
const TABLES_WITH_BRAND = [
  'brands',
  'brand_profiles',
  'website_crawls',
  'website_pages',
  'competitors',
  'social_accounts_public',
  'historical_posts',
  'strategies',
  'content_pillars',
  'campaigns',
  'post_targets',
  'post_comments',
  'approvals',
  'publish_attempts',
  'queue_slots',
  'suggestions',
  'post_metrics_snapshots',
  'account_metrics_daily',
  'insights',
  'reports',
  'brand_site_checks',
]

async function main() {
  console.log('Pravim test korisnike A i B…')
  users.a = await makeUser('a')
  users.b = await makeUser('b')
  const A = users.a.client
  const B = users.b.client

  let wsA, brandA, wsB, brandB

  await test('create_workspace pravi workspace, owner-a, brend i 50 signup tokena', async () => {
    const { data, error } = await A.rpc('create_workspace', {
      p_name: 'Radionica A',
      p_type: 'business',
      p_brand_name: 'Brend A',
      p_website_url: 'https://tangerineseo.rs',
    })
    assert(!error, error?.message)
    wsA = data.workspace_id
    brandA = data.brand_id
    const { data: bal, error: e2 } = await A.rpc('workspace_token_balance', { p_workspace_id: wsA })
    assert(!e2, e2?.message)
    assert(bal.available === 50 && bal.total === 50, `stanje ${JSON.stringify(bal)}`)
  })

  await test('drugi workspace istog korisnika NE dobija nove signup tokene', async () => {
    const { data, error } = await A.rpc('create_workspace', { p_name: 'Radionica A2' })
    assert(!error, error?.message)
    const { data: bal } = await A.rpc('workspace_token_balance', { p_workspace_id: data.workspace_id })
    assert(bal.total === 0, `očekivano 0, dobijeno ${bal.total}`)
  })

  await test('B pravi svoj workspace', async () => {
    const { data, error } = await B.rpc('create_workspace', { p_name: 'Radionica B', p_type: 'agency' })
    assert(!error, error?.message)
    wsB = data.workspace_id
    brandB = data.brand_id
  })

  // Podaci B-a preko service role-a, da A ima šta da pokuša da vidi
  await test('service role puni B-ove tabele probnim redovima', async () => {
    const ins = async (table, row) => {
      const { error } = await admin.from(table).insert(row)
      assert(!error, `${table}: ${error?.message}`)
    }
    await ins('posts', {
      brand_id: brandB,
      workspace_id: wsB,
      master_text: 'B-ova objava',
      created_by: users.b.id,
    })
    await ins('media_assets', {
      workspace_id: wsB,
      brand_id: brandB,
      kind: 'image',
      source: 'upload',
      bucket: 'uploads',
      storage_path: `ws/${wsB}/brand/${brandB}/uploads/x.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 10,
    })
    await ins('social_accounts', {
      brand_id: brandB,
      workspace_id: wsB,
      platform: 'facebook',
      external_id: 'page-1',
      name: 'B stranica',
      account_type: 'page',
      access_token_enc: Buffer.from('tajna').toString('base64'),
    })
    await ins('ai_generations', {
      workspace_id: wsB,
      brand_id: brandB,
      user_id: users.b.id,
      type: 'text',
      status: 'succeeded',
      input: { prompt: 'tajni prompt' },
    })
    await ins('notifications', {
      user_id: users.b.id,
      workspace_id: wsB,
      type: 'test',
      title: 'B obaveštenje',
    })
    await ins('website_crawls', { brand_id: brandB, url: 'https://b.example' })
  })

  await test('A ne vidi nijedan B-ov red ni u jednoj tabeli', async () => {
    const leaks = []
    for (const table of TABLES_WITH_WORKSPACE) {
      const col = table === 'workspaces' ? 'id' : 'workspace_id'
      const { data, error } = await A.from(table).select(col).eq(col, wsB)
      if (error && !/permission denied/i.test(error.message)) throw new Error(`${table}: ${error.message}`)
      if (data && data.length) leaks.push(table)
    }
    for (const table of TABLES_WITH_BRAND) {
      const col = table === 'brands' ? 'id' : 'brand_id'
      const { data, error } = await A.from(table).select(col).eq(col, brandB)
      if (error && !/permission denied/i.test(error.message)) throw new Error(`${table}: ${error.message}`)
      if (data && data.length) leaks.push(table)
    }
    assert(leaks.length === 0, `curenje u: ${leaks.join(', ')}`)
  })

  await test('A vidi svoj workspace, brend i člana', async () => {
    const { data: ws } = await A.from('workspaces').select('id').eq('id', wsA)
    const { data: br } = await A.from('brands').select('id').eq('id', brandA)
    const { data: me } = await A.from('workspace_members').select('role').eq('workspace_id', wsA)
    assert(ws?.length === 1 && br?.length === 1 && me?.[0]?.role === 'owner', 'A ne vidi svoje podatke')
  })

  await test('A ne može da menja ni briše B-ove redove', async () => {
    const upd = await A.from('posts').update({ master_text: 'hak' }).eq('brand_id', brandB).select()
    assert(!upd.error && upd.data.length === 0, `update prošao: ${JSON.stringify(upd)}`)
    const del = await A.from('brands').delete().eq('id', brandB).select()
    assert((del.data ?? []).length === 0, 'delete prošao')
    const { data: still } = await admin.from('posts').select('master_text').eq('brand_id', brandB)
    assert(still[0].master_text === 'B-ova objava', 'B-ov tekst promenjen')
  })

  await test('A ne može da ubaci objavu u B-ov brend', async () => {
    const r = await A.from('posts').insert({
      brand_id: brandB,
      workspace_id: wsB,
      master_text: 'upad',
      created_by: users.a.id,
    })
    expectError(r, null, 'insert u tuđ brend je prošao')
  })

  await test('authenticated ne može da pozove reserve_tokens, grant_tokens, confirm_reservation', async () => {
    const r1 = await A.rpc('reserve_tokens', {
      p_workspace_id: wsA,
      p_brand_id: brandA,
      p_user_id: users.a.id,
      p_amount: 1,
      p_generation_id: null,
    })
    expectError(r1, 'permission denied')
    const r2 = await A.rpc('grant_tokens', {
      p_workspace_id: wsA,
      p_source: 'admin',
      p_amount: 1000,
      p_reference_type: 'x',
      p_reference: 'y',
    })
    expectError(r2, 'permission denied')
    const r3 = await A.rpc('confirm_reservation', {
      p_reservation_id: '00000000-0000-0000-0000-000000000000',
    })
    expectError(r3, 'permission denied')
  })

  await test('token kolone nisu čitljive, view social_accounts_public radi', async () => {
    await admin.from('social_accounts').insert({
      brand_id: brandA,
      workspace_id: wsA,
      platform: 'instagram',
      external_id: 'ig-1',
      name: 'A IG',
      account_type: 'business',
      access_token_enc: Buffer.from('tajna').toString('base64'),
    })
    const bad = await A.from('social_accounts').select('*').eq('brand_id', brandA)
    expectError(bad, 'permission denied', 'select * na social_accounts mora pasti')
    const bad2 = await A.from('social_accounts').select('access_token_enc').eq('brand_id', brandA)
    expectError(bad2, 'permission denied')
    const ok = await A.from('social_accounts_public').select('id, name, platform').eq('brand_id', brandA)
    assert(!ok.error && ok.data.length === 1 && ok.data[0].name === 'A IG', `view: ${ok.error?.message}`)
  })

  await test('uloge: viewer ne može insert, approver ne može update teksta, editor može', async () => {
    const roles = {}
    for (const role of ['viewer', 'approver', 'editor']) {
      const u = await makeUser(role)
      users[role] = u
      const { error } = await admin
        .from('workspace_members')
        .insert({ workspace_id: wsA, user_id: u.id, role })
      assert(!error, error?.message)
      roles[role] = u
    }
    const v = await roles.viewer.client
      .from('posts')
      .insert({ brand_id: brandA, workspace_id: wsA, master_text: 'viewer', created_by: roles.viewer.id })
    expectError(v, null, 'viewer insert prošao')
    const e = await roles.editor.client
      .from('posts')
      .insert({ brand_id: brandA, workspace_id: wsA, master_text: 'editor', created_by: roles.editor.id })
      .select('id')
      .single()
    assert(!e.error, `editor insert: ${e.error?.message}`)
    const ap = await roles.approver.client
      .from('posts')
      .update({ master_text: 'approver menja' })
      .eq('id', e.data.id)
      .select()
    assert(!ap.error && ap.data.length === 0, 'approver update prošao')
    const vr = await roles.viewer.client.from('posts').select('id').eq('id', e.data.id)
    assert(vr.data?.length === 1, 'viewer treba da vidi objavu')
  })

  await test('član bez all_brands i bez member_brand_access ne vidi brend', async () => {
    const u = await makeUser('limited')
    users.limited = u
    const { error } = await admin
      .from('workspace_members')
      .insert({ workspace_id: wsA, user_id: u.id, role: 'editor', all_brands: false })
    assert(!error, error?.message)
    const { data: none } = await u.client.from('brands').select('id').eq('id', brandA)
    assert(none.length === 0, 'ograničen član vidi brend bez dodele')
    await admin.from('member_brand_access').insert({ workspace_id: wsA, user_id: u.id, brand_id: brandA })
    const { data: some } = await u.client.from('brands').select('id').eq('id', brandA)
    assert(some.length === 1, 'posle dodele treba da vidi brend')
  })

  await test('dve paralelne rezervacije od 30 nad 50 tokena: tačno jedna prolazi', async () => {
    const r = (amount) =>
      admin.rpc('reserve_tokens', {
        p_workspace_id: wsA,
        p_brand_id: brandA,
        p_user_id: users.a.id,
        p_amount: amount,
        p_generation_id: null,
      })
    const [x, y] = await Promise.all([r(30), r(30)])
    const okCount = [x, y].filter((q) => !q.error).length
    const insufficient = [x, y].filter((q) => q.error && /INSUFFICIENT_TOKENS/.test(q.error.message)).length
    assert(
      okCount === 1 && insufficient === 1,
      `ok=${okCount} insufficient=${insufficient} ${x.error?.message ?? ''} ${y.error?.message ?? ''}`,
    )
    const { data: bal } = await A.rpc('workspace_token_balance', { p_workspace_id: wsA })
    assert(bal.available === 20 && bal.reserved === 30, `stanje ${JSON.stringify(bal)}`)
    // oslobodi radi sledećih testova
    const ok = [x, y].find((q) => !q.error)
    await admin.rpc('release_reservation', { p_reservation_id: ok.data, p_reason: 'test' })
    const { data: bal2 } = await A.rpc('workspace_token_balance', { p_workspace_id: wsA })
    assert(bal2.available === 50, `posle release ${JSON.stringify(bal2)}`)
  })

  await test('confirm_reservation dvaput → jedan ledger red; stanje tačno', async () => {
    const { data: gen } = await admin
      .from('ai_generations')
      .insert({ workspace_id: wsA, brand_id: brandA, user_id: users.a.id, type: 'text', status: 'running' })
      .select('id')
      .single()
    const { data: resId, error } = await admin.rpc('reserve_tokens', {
      p_workspace_id: wsA,
      p_brand_id: brandA,
      p_user_id: users.a.id,
      p_amount: 8,
      p_generation_id: gen.id,
    })
    assert(!error, error?.message)
    const c1 = await admin.rpc('confirm_reservation', { p_reservation_id: resId })
    const c2 = await admin.rpc('confirm_reservation', { p_reservation_id: resId })
    assert(
      !c1.error && !c2.error && c1.data === c2.data,
      `ledger id ${c1.data} vs ${c2.data} ${c1.error?.message ?? ''}`,
    )
    const { count } = await admin
      .from('token_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('reservation_id', resId)
    assert(count === 1, `ledger redova ${count}`)
    const { data: bal } = await A.rpc('workspace_token_balance', { p_workspace_id: wsA })
    assert(bal.total === 42 && bal.available === 42, `stanje ${JSON.stringify(bal)}`)
    const { data: g } = await admin
      .from('ai_generations')
      .select('status, tokens_charged')
      .eq('id', gen.id)
      .single()
    assert(g.status === 'succeeded' && g.tokens_charged === 8, `generacija ${JSON.stringify(g)}`)
  })

  await test('grant_tokens sa istim (source, reference) dvaput → jedan grant', async () => {
    const g1 = await admin.rpc('grant_tokens', {
      p_workspace_id: wsA,
      p_source: 'subscription',
      p_amount: 500,
      p_reference_type: 'invoice',
      p_reference: `in_${stamp}`,
    })
    const g2 = await admin.rpc('grant_tokens', {
      p_workspace_id: wsA,
      p_source: 'subscription',
      p_amount: 500,
      p_reference_type: 'invoice',
      p_reference: `in_${stamp}`,
    })
    assert(
      !g1.error && !g2.error && g1.data === g2.data,
      `${g1.error?.message ?? ''} ${g2.error?.message ?? ''}`,
    )
    const { data: bal } = await A.rpc('workspace_token_balance', { p_workspace_id: wsA })
    assert(bal.total === 542, `stanje ${JSON.stringify(bal)}`)
  })

  await test('tokeni se troše prvo iz granta koji najranije ističe', async () => {
    await admin.rpc('grant_tokens', {
      p_workspace_id: wsA,
      p_source: 'topup',
      p_amount: 100,
      p_reference_type: 'checkout',
      p_reference: `cs_${stamp}`,
      p_expires_at: null,
    })
    // subscription grant (ne ističe u testu) vs signup (ne ističe): dodaj grant koji ističe sutra
    await admin.rpc('grant_tokens', {
      p_workspace_id: wsA,
      p_source: 'admin',
      p_amount: 10,
      p_reference_type: 'admin',
      p_reference: `exp_${stamp}`,
      p_expires_at: new Date(Date.now() + 86400000).toISOString(),
    })
    const { data: resId } = await admin.rpc('reserve_tokens', {
      p_workspace_id: wsA,
      p_brand_id: brandA,
      p_user_id: users.a.id,
      p_amount: 4,
      p_generation_id: null,
    })
    await admin.rpc('confirm_reservation', { p_reservation_id: resId })
    const { data: res } = await admin
      .from('token_reservations')
      .select('allocations')
      .eq('id', resId)
      .single()
    const { data: expGrant } = await admin
      .from('token_grants')
      .select('id, remaining')
      .eq('reference', `exp_${stamp}`)
      .single()
    assert(
      res.allocations[0].grant_id === expGrant.id && expGrant.remaining === 6,
      `alokacija ${JSON.stringify(res.allocations)} remaining ${expGrant.remaining}`,
    )
  })

  await test('token_ledger je append-only (update i delete padaju) i za service role', async () => {
    const { data: row } = await admin
      .from('token_ledger')
      .select('id')
      .eq('workspace_id', wsA)
      .limit(1)
      .single()
    const u = await admin.from('token_ledger').update({ delta: 0 }).eq('id', row.id)
    expectError(u, 'APPEND_ONLY')
    const d = await admin.from('token_ledger').delete().eq('id', row.id)
    expectError(d, 'APPEND_ONLY')
  })

  await test('posts: direktan prelaz draft → published pada; draft → in_review → approved prolazi', async () => {
    const { data: p } = await admin
      .from('posts')
      .insert({ brand_id: brandA, workspace_id: wsA, master_text: 'tok', created_by: users.a.id })
      .select('id, version')
      .single()
    const bad = await A.from('posts').update({ status: 'published' }).eq('id', p.id)
    expectError(bad, 'INVALID_TRANSITION')
    const v1 = await admin.rpc('transition_post', {
      p_post_id: p.id,
      p_to: 'in_review',
      p_expected_version: p.version,
      p_actor: users.a.id,
    })
    assert(!v1.error && v1.data === 2, `in_review: ${v1.error?.message}`)
    const stale = await admin.rpc('transition_post', {
      p_post_id: p.id,
      p_to: 'approved',
      p_expected_version: 1,
      p_actor: users.a.id,
    })
    expectError(stale, 'CONFLICT')
    const v2 = await admin.rpc('decide_post', {
      p_post_id: p.id,
      p_decision: 'approved',
      p_comment: 'ok',
      p_post_version: 2,
      p_actor: users.a.id,
    })
    assert(!v2.error && v2.data === 3, `approve: ${v2.error?.message}`)
    const { data: versions } = await admin.from('post_versions').select('version').eq('post_id', p.id)
    assert(versions.length === 2, `verzija ${versions.length}`)
  })

  await test('poslednji owner ne može da napusti workspace', async () => {
    const r = await A.from('workspace_members').delete().eq('workspace_id', wsA).eq('user_id', users.a.id)
    expectError(r, 'LAST_OWNER')
  })

  await test('korisnik ne može sam sebi da promeni platform_role ni is_banned', async () => {
    const r = await A.from('profiles').update({ platform_role: 'platform_admin' }).eq('id', users.a.id)
    expectError(r, null)
    const { data: me } = await A.from('profiles').select('platform_role').eq('id', users.a.id).single()
    assert(me.platform_role === 'user', 'uloga promenjena')
  })

  await test('teammate vidi profil kolege, ali ne i tuđeg korisnika', async () => {
    const { data: mate } = await users.editor.client.from('profiles').select('id').eq('id', users.a.id)
    assert(mate.length === 1, 'editor ne vidi profil owner-a')
    const { data: stranger } = await B.from('profiles').select('id').eq('id', users.a.id)
    assert(stranger.length === 0, 'B vidi A-ov profil')
  })

  await test('storage: upload u tuđ workspace odbijen, u svoj dozvoljen', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
    const bad = await A.storage
      .from('uploads')
      .upload(`ws/${wsB}/brand/${brandB}/uploads/${stamp}.jpg`, bytes, { contentType: 'image/jpeg' })
    assert(bad.error, 'upload u tuđ workspace prošao')
    const ok = await A.storage
      .from('uploads')
      .upload(`ws/${wsA}/brand/${brandA}/uploads/${stamp}.jpg`, bytes, { contentType: 'image/jpeg' })
    assert(!ok.error, `upload u svoj: ${ok.error?.message}`)
    const bView = await B.storage.from('uploads').download(`ws/${wsA}/brand/${brandA}/uploads/${stamp}.jpg`)
    assert(bView.error, 'B može da preuzme A-ov fajl')
  })

  await test('brisanje korisnika iz auth.users prolazi uprkos append-only trigerima (kaskada)', async () => {
    const u = await makeUser('todelete')
    const { data } = await u.client.rpc('create_workspace', { p_name: 'Za brisanje' })
    assert(data?.workspace_id, 'workspace nije napravljen')
    const { error } = await admin.auth.admin.deleteUser(u.id)
    assert(!error, `brisanje: ${error?.message}`)
    const { data: ws } = await admin.from('workspaces').select('id').eq('id', data.workspace_id)
    assert(ws.length === 0, 'workspace ostao posle brisanja korisnika')
    const { data: ledger } = await admin
      .from('token_ledger')
      .select('id')
      .eq('workspace_id', data.workspace_id)
    assert(ledger.length === 0, 'ledger ostao posle kaskade')
  })

  // admin bez prijave (samo kroz allowlist), da ne troši limit prijava lokalnog Auth-a
  const dbAdminEmail = `test-admin-${stamp}@sova.local`
  let dbAdmin = null
  await test('admin_adjust_tokens: jedan audit zapis u istoj transakciji; prijavljen korisnik ne može da je pozove', async () => {
    await admin.from('platform_admin_allowlist').insert({ email: dbAdminEmail, note: 'test baze' })
    const { data, error } = await admin.auth.admin.createUser({
      email: dbAdminEmail,
      password: `Lozinka-${stamp}-adm!`,
      email_confirm: true,
    })
    assert(!error, `admin: ${error?.message}`)
    dbAdmin = data.user
    const { data: prof } = await admin.from('profiles').select('platform_role').eq('id', dbAdmin.id).single()
    assert(prof.platform_role === 'platform_admin', 'allowlist nije dodelio admin ulogu')

    const { data: ledgerId, error: rpcErr } = await admin.rpc('admin_adjust_tokens', {
      p_workspace_id: wsA,
      p_delta: 3,
      p_reason: 'Provera audit zapisa',
      p_admin_id: dbAdmin.id,
      p_audit: {
        admin_email: dbAdminEmail,
        target_user_id: users.a.id,
        ip: 'nije-ip',
        user_agent: 'test-db',
      },
    })
    assert(!rpcErr, `rpc: ${rpcErr?.message}`)
    const { data: rows } = await admin
      .from('admin_audit_log')
      .select('admin_email, target_type, target_id, ip, user_agent, after')
      .eq('action', 'tokens.adjust')
      .eq('after->>ledgerId', String(ledgerId))
    assert(rows.length === 1, `audit zapisa: ${rows.length}`)
    const r = rows[0]
    assert(
      r.admin_email === dbAdminEmail &&
        r.target_type === 'user' &&
        r.target_id === users.a.id &&
        r.ip === null &&
        r.user_agent === 'test-db',
      `audit zapis: ${JSON.stringify(r)}`,
    )
    assert(
      r.after.delta === 3 && r.after.reason === 'Provera audit zapisa',
      `after: ${JSON.stringify(r.after)}`,
    )

    const denied = await A.rpc('admin_adjust_tokens', {
      p_workspace_id: wsA,
      p_delta: 1000,
      p_reason: 'Pokušaj korisnika',
      p_admin_id: dbAdmin.id,
    })
    assert(denied.error, 'prijavljen korisnik je pozvao admin_adjust_tokens')
  })

  await test('admin_audit_log: append-only, bez stranih ključeva; brisanje admina i impersoniranog korisnika ne menja zapis', async () => {
    assert(dbAdmin, 'nema admina iz prethodnog testa')
    const { data: t, error: tErr } = await admin.auth.admin.createUser({
      email: `test-imp-${stamp}@sova.local`,
      password: `Lozinka-${stamp}-imp!`,
      email_confirm: true,
    })
    assert(!tErr, `korisnik: ${tErr?.message}`)
    try {
      const { data: s, error: sErr } = await admin
        .from('impersonation_sessions')
        .insert({ admin_id: dbAdmin.id, user_id: t.user.id, reason: 'Provera brisanja u testu baze' })
        .select('id')
        .single()
      assert(!sErr, `sesija: ${sErr?.message}`)
      const { data: row, error: lErr } = await admin
        .from('admin_audit_log')
        .insert({
          admin_id: dbAdmin.id,
          admin_email: dbAdminEmail,
          action: 'impersonation.start',
          target_type: 'user',
          target_id: t.user.id,
          impersonation_session_id: s.id,
        })
        .select('id')
        .single()
      assert(!lErr, `audit: ${lErr?.message}`)
      expectError(
        await admin.from('admin_audit_log').update({ action: 'izmena' }).eq('id', row.id),
        'APPEND_ONLY',
      )
      expectError(await admin.from('admin_audit_log').delete().eq('id', row.id), 'APPEND_ONLY')

      const delUser = await admin.auth.admin.deleteUser(t.user.id)
      assert(!delUser.error, `brisanje korisnika: ${delUser.error?.message}`)
      const delAdmin = await admin.auth.admin.deleteUser(dbAdmin.id)
      assert(!delAdmin.error, `brisanje admina: ${delAdmin.error?.message}`)
      const { data: after } = await admin
        .from('admin_audit_log')
        .select('admin_id, admin_email, impersonation_session_id')
        .eq('id', row.id)
        .single()
      assert(
        after.impersonation_session_id === s.id &&
          after.admin_id === dbAdmin.id &&
          after.admin_email === dbAdminEmail,
        `zapis izmenjen: ${JSON.stringify(after)}`,
      )
    } finally {
      await admin.auth.admin.deleteUser(t.user.id).catch(() => {})
      await admin.auth.admin.deleteUser(dbAdmin.id).catch(() => {})
      await admin.from('platform_admin_allowlist').delete().eq('email', dbAdminEmail)
    }
  })

  await test('seed: planovi, podešavanja i flagovi postoje; anon vidi cenovnik', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data: plans, error } = await anon.from('plans').select('code').order('sort_order')
    assert(!error && plans.map((p) => p.code).includes('monthly'), `plans: ${error?.message}`)
    const { data: pub } = await anon.from('platform_settings_public').select('key')
    assert(
      pub.some((s) => s.key === 'token_prices'),
      'token_prices nisu javni',
    )
    const hidden = await anon.from('platform_settings').select('key').eq('key', 'model_prices')
    assert(!hidden.error && hidden.data.length === 0, 'model_prices su vidljivi anonimno')
    const { data: flags } = await A.from('feature_flags').select('key, enabled')
    assert(flags.length > 10, 'flagovi nisu seedovani')
  })

  await cleanup()
  console.log(`\n${passed} prošlo, ${failed} palo`)
  if (failed) process.exit(1)
}

main().catch(async (err) => {
  console.error(err)
  await cleanup()
  process.exit(1)
})
