import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// slanje emaila se samo beleži: proverava se prilog bez Resend-a
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async () => ({ id: null })),
}))

import { PATCH as brandPatch } from '@/app/api/brands/[id]/route'
import { GET as reportsGet, POST as reportsPost } from '@/app/api/reports/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { sendEmail } from '@/lib/email/send'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { monthBounds, monthOf, shiftMonth } from '@/lib/reports/period'
import { zonedToUtc } from '@/lib/zoned-time'
import { listDueMonthlyReports, runMonthlyReports } from '@/services/reports/monthly'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let owner: TestUser
let editor: TestUser
let outsider: TestUser
let wsId = ''
let brandId = ''
let accountId = ''
const TZ = 'Europe/Belgrade'
// prošli mesec po zoni brenda: u njemu su objave iz ovog testa
const current = monthOf(new Date(), TZ)
const month = shiftMonth(current, -1)
const bounds = monthBounds(month, TZ)

interface ReportItem {
  id: string
  month: string
  url: string | null
  status: string
  sentTo: string[] | null
}

async function publishedTarget(text: string, day: string, reach: number, reactions: number) {
  const { data: post, error } = await admin
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
  if (error) throw new Error(error.message)
  const { data: t, error: tErr } = await admin
    .from('post_targets')
    .insert({
      post_id: post.id,
      brand_id: brandId,
      social_account_id: accountId,
      platform: 'facebook',
      status: 'published',
      external_post_id: `rep-${day}-${reach}`,
      published_at: zonedToUtc(`${month}-${day}`, '10:00', TZ),
    })
    .select('id')
    .single()
  if (tErr) throw new Error(tErr.message)
  const { error: sErr } = await admin.from('post_metrics_snapshots').insert({
    target_id: t.id,
    social_account_id: accountId,
    brand_id: brandId,
    horizon: '7d',
    reach,
    impressions: reach * 2,
    reactions,
    comments: 3,
    shares: 1,
    saves: 0,
  })
  if (sErr) throw new Error(sErr.message)
}

async function download(path: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from('exports').download(path)
  return data ? Buffer.from(await data.arrayBuffer()) : null
}

beforeAll(async () => {
  owner = await createTestUser('rep-owner')
  editor = await createTestUser('rep-editor')
  outsider = await createTestUser('rep-outsider')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Izveštaji test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin.from('brands').update({ timezone: TZ }).eq('id', brandId)
  await admin.from('workspace_members').insert({ workspace_id: wsId, user_id: editor.id, role: 'editor' })
  const e = encryptSecret('page-token-rep', `social:${brandId}:facebook:page-rep`)
  const { data: acc, error } = await admin
    .from('social_accounts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      platform: 'facebook',
      external_id: 'page-rep',
      name: 'Strana izveštaja',
      account_type: 'facebook_page',
      status: 'active',
      capabilities: { publish: true },
      metadata: {},
      assisted_only: false,
      access_token_enc: toPgBytea(e.ciphertext),
      key_version: e.keyVersion,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  accountId = acc.id
  await publishedTarget(
    'Savet za održavanje klime pre grejne sezone, čišćenje filtera i provera.',
    '05',
    1200,
    80,
  )
  await publishedTarget(
    'Ponuda: servis klime sa popustom do kraja meseca za stalne klijente.',
    '18',
    3400,
    150,
  )
  await admin.from('insights').insert({
    brand_id: brandId,
    period_start: bounds.periodStart,
    period_end: `${month}-07`,
    items: [
      {
        claim: 'Ponude imaju veći doseg od saveta.',
        recommendation: 'Uz svaki savet dodajte kratak poziv na servis.',
        evidenceTargetIds: [],
        confidence: 0.7,
        suggestionKind: '',
        suggestionTitle: '',
        suggestionBody: '',
      },
    ],
  })
})

afterEach(() => {
  resetMemoryRateLimit()
  vi.mocked(sendEmail).mockClear()
})

afterAll(async () => {
  const { data } = await admin.from('reports').select('storage_path').eq('brand_id', brandId)
  const paths = (data ?? []).map((r) => r.storage_path).filter((p): p is string => Boolean(p))
  if (paths.length) await admin.storage.from('exports').remove(paths)
  await deleteTestUser(owner)
  await deleteTestUser(editor)
  await deleteTestUser(outsider)
})

describe('Mesečni PDF izveštaj (D-094)', () => {
  it('pravi PDF za prošli mesec; isti mesec ponovo zamenjuje fajl; lista daje link', async () => {
    const r = await call<ReportItem>(reportsPost, '/api/reports', {
      token: owner.token,
      body: { brandId, month },
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ month, status: 'ready', sentTo: null })
    expect(r.json.data!.url).toContain('download=')
    const { data: row } = await admin.from('reports').select('*').eq('id', r.json.data!.id).single()
    expect(row).toMatchObject({ period_start: bounds.periodStart, period_end: bounds.periodEnd })
    const first = row!.storage_path!
    expect((await download(first))!.subarray(0, 5).toString()).toBe('%PDF-')

    const again = await call<ReportItem>(reportsPost, '/api/reports', {
      token: editor.token,
      body: { brandId, month },
    })
    expect(again.json.data!.id).toBe(r.json.data!.id)
    const { data: row2 } = await admin
      .from('reports')
      .select('storage_path')
      .eq('id', r.json.data!.id)
      .single()
    expect(row2!.storage_path).not.toBe(first)
    expect(await download(first)).toBeNull()

    const list = await call<ReportItem[]>(reportsGet, '/api/reports', {
      token: owner.token,
      query: { brandId },
    })
    expect(list.status).toBe(200)
    expect(list.json.data!.map((x) => x.month)).toEqual([month])
    expect(list.json.data![0]!.url).toBeTruthy()
  })

  it('budući mesec i mesec stariji od godinu dana se odbijaju, tuđi brend je 404', async () => {
    const future = await call(reportsPost, '/api/reports', {
      token: owner.token,
      body: { brandId, month: shiftMonth(current, 1) },
    })
    expect(future.status).toBe(400)
    const old = await call(reportsPost, '/api/reports', {
      token: owner.token,
      body: { brandId, month: shiftMonth(current, -12) },
    })
    expect(old.status).toBe(400)
    expect(
      (await call(reportsPost, '/api/reports', { token: owner.token, body: { brandId, month: '2026-13' } }))
        .status,
    ).toBe(400)
    const foreign = await call(reportsPost, '/api/reports', {
      token: outsider.token,
      body: { brandId, month },
    })
    expect(foreign.status).toBe(404)
    expect(
      (await call(reportsGet, '/api/reports', { token: outsider.token, query: { brandId } })).status,
    ).toBe(404)
  })

  it('adrese klijenta: vlasnik ih menja (bez duplikata), urednik dobija 403, neispravne se odbijaju', async () => {
    const patch = (token: string, reportEmails: unknown) =>
      call<{ report_emails: string[] }>(brandPatch, `/api/brands/${brandId}`, {
        method: 'PATCH',
        token,
        params: { id: brandId },
        body: { reportEmails },
      })
    const ok = await patch(owner.token, ['klijent@firma.rs', 'KLIJENT@firma.rs', 'direktor@firma.rs'])
    expect(ok.status).toBe(200)
    expect(ok.json.data!.report_emails).toEqual(['klijent@firma.rs', 'direktor@firma.rs'])
    expect((await patch(editor.token, ['drugi@firma.rs'])).status).toBe(403)
    expect((await patch(owner.token, ['nije-adresa'])).status).toBe(400)
    expect(
      (await patch(owner.token, ['a@x.rs', 'b@x.rs', 'c@x.rs', 'd@x.rs', 'e@x.rs', 'f@x.rs'])).status,
    ).toBe(400)
  })

  it('mesečni posao šalje izveštaj jednom: obaveštenje vlasniku, PDF klijentu u prilogu', async () => {
    await admin
      .from('brands')
      .update({ report_emails: ['klijent@firma.rs'] })
      .eq('id', brandId)
    const firstOfMonth = (time: string) => new Date(zonedToUtc(`${current}-01`, time, TZ))
    // pre 06:00 po zoni brenda nije na redu, u 08:00 jeste
    expect(await listDueMonthlyReports(firstOfMonth('03:00'), { brandId })).toEqual([])
    expect(await listDueMonthlyReports(firstOfMonth('08:00'), { brandId })).toEqual([{ brandId, month }])
    // mesec bez objava se preskače
    expect(
      await listDueMonthlyReports(new Date(zonedToUtc(`${shiftMonth(current, 2)}-01`, '08:00', TZ)), {
        brandId,
      }),
    ).toEqual([])

    const run = await runMonthlyReports(firstOfMonth('08:00'), { brandId })
    expect(run).toEqual({ due: 1, sent: 1, failed: 0 })
    const { data: row } = await admin
      .from('reports')
      .select('status, sent_to')
      .eq('brand_id', brandId)
      .eq('period_start', bounds.periodStart)
      .single()
    expect(row).toEqual({ status: 'sent', sent_to: ['klijent@firma.rs'] })

    const clientMails = vi.mocked(sendEmail).mock.calls.filter(([m]) => m.tags?.type === 'monthly_report')
    expect(clientMails).toHaveLength(1)
    const mail = clientMails[0]![0]
    expect(mail.to).toBe('klijent@firma.rs')
    expect(mail.attachments![0]!.filename).toBe(`izvestaj-izvestaji-test-${month}.pdf`)
    expect(mail.attachments![0]!.content.subarray(0, 5).toString()).toBe('%PDF-')
    const { data: notes } = await admin
      .from('notifications')
      .select('title, body')
      .eq('user_id', owner.id)
      .eq('type', 'report_ready')
    expect(notes).toHaveLength(1)
    expect(notes![0]!.body).toContain('poslat klijentu na 1 adresu')

    // drugi prolaz ne šalje ponovo
    vi.mocked(sendEmail).mockClear()
    expect(await runMonthlyReports(firstOfMonth('09:00'), { brandId })).toEqual({
      due: 0,
      sent: 0,
      failed: 0,
    })
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  })
})
