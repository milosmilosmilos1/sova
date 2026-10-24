import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueTargetScheduled: vi.fn(async () => {}),
    enqueueTargetUnscheduled: vi.fn(async () => {}),
    enqueueHistoryImport: vi.fn(async () => {}),
    enqueueAutopilotWeek: vi.fn(async () => {}),
    enqueueStrategyJob: vi.fn(async () => {}),
  }
})

import { POST as pausePost } from '@/app/api/autopilot/[brandId]/pause/route'
import { POST as resumePost } from '@/app/api/autopilot/[brandId]/resume/route'
import { GET as autopilotGet, PATCH as autopilotPatch } from '@/app/api/autopilot/[brandId]/route'
import { POST as runPost } from '@/app/api/autopilot/[brandId]/run/route'
import { POST as acceptPost } from '@/app/api/suggestions/[id]/accept/route'
import { POST as dismissPost } from '@/app/api/suggestions/[id]/dismiss/route'
import { GET as suggestionsGet } from '@/app/api/suggestions/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { nextWeekRange } from '@/lib/autopilot/rules'
import { setFeatureFlagForTests } from '@/lib/flags'
import { enqueueAutopilotWeek, enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { addDays } from '@/lib/strategy/plan'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { runAutopilotDeadlines } from '@/services/autopilot/deadlines'
import { runMonthlyForBrand, runWeeklyForBrand, type StepRunner } from '@/services/autopilot/runner'
import { checkOutlier, expireSuggestions, holidaySuggestions } from '@/services/autopilot/triggers'

import { enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let owner: TestUser
let editor: TestUser
let wsId = ''
let brandId = ''
let fbId = ''
let igId = ''
let strategyId = ''
let holidayName = ''
const inline: StepRunner = (_name, fn) => fn()
const week0 = addDays(nextWeekRange(new Date(), 'Europe/Belgrade').start, 7)

interface View {
  level: number
  tokenBudget: number | null
  approvalDeadlineHours: number
  unapprovedAction: string
  level3AccountIds: string[]
  level3ConfirmedAt: string | null
  paused: boolean
  usage: { used: number; budget: number | null; state: string }
  activeStrategy: { id: string } | null
  runs: Array<{ kind: string; status: string; periodStart: string }>
}

function rw(): string {
  const letters = 'abcdefghijklmnoprstuvz'
  return Array.from({ length: 7 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
}
function uniqueReply(extra = '') {
  const words = Array.from({ length: 14 }, rw).join(' ')
  return {
    kind: 'text' as const,
    json: {
      image_description: null,
      variants: [
        {
          platform: 'facebook',
          hook: `Saveti za dom ${extra}`.trim(),
          body: `Ove nedelje: ${words}.`,
          cta: 'Zakažite termin porukom.',
          hashtags: ['#sova'],
          alt_text: 'Ilustracija saveta.',
          first_comment: null,
        },
      ],
    },
  }
}

async function patch(body: Record<string, unknown>, token = owner.token) {
  return call<View>(autopilotPatch, `/api/autopilot/${brandId}`, {
    token,
    method: 'PATCH',
    params: { brandId },
    body,
  })
}

async function view(): Promise<View> {
  const r = await call<View>(autopilotGet, `/api/autopilot/${brandId}`, {
    token: owner.token,
    params: { brandId },
  })
  return r.json.data!
}

async function autopilotPost(status: 'in_review' | 'approved', minutesAhead: number, title: string) {
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      title,
      master_text: `${title}: tekst Autopilot objave za proveru rokova.`,
      status,
      source: 'autopilot',
      scheduled_for: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  await admin
    .from('post_targets')
    .insert({ post_id: post!.id, brand_id: brandId, social_account_id: fbId, platform: 'facebook' })
  return post!.id
}

async function postRow(id: string) {
  const { data } = await admin.from('posts').select('*').eq('id', id).single()
  return data!
}

const strategyFixture = {
  summary: 'Fokus na savete i ponudu.',
  goals: [{ goal: 'Više upita', kpi: 'upiti nedeljno', target: '8' }],
  network_mix: [
    { platform: 'facebook', per_week: 2, formats: ['objava'], role: 'zajednica' },
    { platform: 'instagram', per_week: 1, formats: ['karusel'], role: 'brend' },
  ],
  pillars: [
    { name: 'Edukacija', description: 'Saveti', share_percent: 60 },
    { name: 'Ponuda', description: 'Akcije', share_percent: 40 },
  ],
  weekly_themes: [{ week: 1, theme: 'Saveti', angle: 'kratko', pillar: 'Edukacija', campaign: '' }],
  hashtag_strategy: { core: ['#sova'], niche: [], local: [], avoid: [] },
  best_times: [],
  campaigns: [],
  assumptions: ['Nema istorije.'],
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  configureFontLoader({ remote: false })
  owner = await createTestUser('ap-owner')
  editor = await createTestUser('ap-editor')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Autopilot test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: editor.id, role: 'editor', all_brands: true })
  await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 300,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  const { data: accounts, error } = await admin
    .from('social_accounts')
    .insert([
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: `page-ap-${Date.now()}`,
        name: 'Strana',
        account_type: 'facebook_page',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: false,
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: `ig-ap-${Date.now()}`,
        name: 'IG',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: false,
      },
    ])
    .select('id, platform')
  if (error) throw new Error(error.message)
  fbId = accounts!.find((a) => a.platform === 'facebook')!.id
  igId = accounts!.find((a) => a.platform === 'instagram')!.id
})

afterEach(() => {
  resetGeminiMock()
  resetMemoryRateLimit()
  vi.mocked(enqueueTargetScheduled).mockClear()
  vi.mocked(enqueueTargetUnscheduled).mockClear()
  vi.mocked(enqueueAutopilotWeek).mockClear()
})

afterAll(async () => {
  setFeatureFlagForTests('autopilot_level3', null)
  if (holidayName) await admin.from('holidays').delete().eq('name', holidayName)
  geminiServer.close()
  await deleteTestUser(editor)
  await deleteTestUser(owner)
})

describe('Autopilot: podešavanja', () => {
  it('podrazumevano nivo 1, bez limita, rok 24 h, preskoči; urednik ne menja', async () => {
    const v = await view()
    expect(v).toMatchObject({
      level: 1,
      tokenBudget: null,
      approvalDeadlineHours: 24,
      unapprovedAction: 'skip',
      paused: false,
    })
    expect(v.usage).toMatchObject({ used: 0, state: 'unlimited' })
    const r = await patch({ level: 2 }, editor.token)
    expect(r.status).toBe(403)
  })

  it('nivo 3: bez flaga 403, pogrešna potvrda 400, bez naloga 400, ispravno čuva naloge i vreme potvrde', async () => {
    setFeatureFlagForTests('autopilot_level3', false)
    expect((await patch({ level: 3, confirm: 'Moj brend', level3AccountIds: [fbId] })).status).toBe(403)
    setFeatureFlagForTests('autopilot_level3', true)
    const { data: b } = await admin.from('brands').select('name').eq('id', brandId).single()
    expect((await patch({ level: 3, confirm: 'pogrešno', level3AccountIds: [fbId] })).status).toBe(400)
    expect((await patch({ level: 3, confirm: b!.name, level3AccountIds: [] })).status).toBe(400)
    const ok = await patch({ level: 3, confirm: b!.name, level3AccountIds: [fbId] })
    expect(ok.status).toBe(200)
    expect(ok.json.data).toMatchObject({ level: 3, level3AccountIds: [fbId] })
    expect(ok.json.data!.level3ConfirmedAt).not.toBeNull()
    const back = await patch({ level: 1, approvalDeadlineHours: 12, unapprovedAction: 'publish' })
    expect(back.json.data).toMatchObject({
      level: 1,
      level3AccountIds: [],
      level3ConfirmedAt: null,
      approvalDeadlineHours: 12,
      unapprovedAction: 'publish',
    })
  })

  it('ručni prolaz šalje događaj za narednu nedelju (202)', async () => {
    const r = await call<{ queued: boolean; weekStart: string }>(runPost, `/api/autopilot/${brandId}/run`, {
      token: owner.token,
      params: { brandId },
      body: {},
    })
    expect(r.status).toBe(202)
    expect(vi.mocked(enqueueAutopilotWeek)).toHaveBeenCalledWith(brandId, r.json.data!.weekStart, owner.id)
  })
})

describe('Inbox predloga', () => {
  it('lista sa brojevima, prihvatanje bloga pravi nacrt sa linkom, profil vodi na Brand Brain, odbacivanje', async () => {
    const { data: rows } = await admin
      .from('suggestions')
      .insert([
        {
          brand_id: brandId,
          source: 'blog',
          kind: 'new_blog_post',
          title: 'Nov tekst na blogu: Kako očistiti klimu',
          body: 'Napravite objavu iz novog teksta.',
          payload: { url: 'https://fixture-site.test/blog/klima', title: 'Kako očistiti klimu' },
          score: 70,
        },
        {
          brand_id: brandId,
          source: 'site_change',
          kind: 'profile_update',
          title: 'Osvežite profil',
          body: 'Nove stranice.',
          payload: {},
          score: 60,
        },
        {
          brand_id: brandId,
          source: 'holiday',
          kind: 'post_idea',
          title: 'Praznik',
          body: 'Čestitka.',
          payload: {},
          score: 50,
        },
      ])
      .select('id, kind')
    const blog = rows!.find((r) => r.kind === 'new_blog_post')!.id
    const profile = rows!.find((r) => r.kind === 'profile_update')!.id
    const holiday = rows!.find((r) => r.kind === 'post_idea')!.id

    const list = await call<{ items: Array<{ id: string }>; counts: Record<string, number> }>(
      suggestionsGet,
      '/api/suggestions',
      {
        token: owner.token,
        query: { brandId },
      },
    )
    expect(list.json.data!.counts.new).toBe(3)
    expect(list.json.data!.items[0]!.id).toBe(blog) // najveća ocena prva

    const acc = await call<{ postId: string; redirect: string; suggestion: { status: string } }>(
      acceptPost,
      `/api/suggestions/${blog}/accept`,
      {
        token: editor.token,
        params: { id: blog },
        body: {},
      },
    )
    expect(acc.status).toBe(200)
    expect(acc.json.data!.redirect).toBe(`/app/posts/${acc.json.data!.postId}`)
    const post = await postRow(acc.json.data!.postId)
    expect(post).toMatchObject({
      source: 'suggestion',
      status: 'draft',
      suggestion_id: blog,
      link_url: 'https://fixture-site.test/blog/klima',
    })
    expect(post.master_text).toContain('Kako očistiti klimu')
    expect(
      (
        await call(acceptPost, `/api/suggestions/${blog}/accept`, {
          token: owner.token,
          params: { id: blog },
          body: {},
        })
      ).status,
    ).toBe(409)

    const prof = await call<{ postId: string | null; redirect: string }>(
      acceptPost,
      `/api/suggestions/${profile}/accept`,
      {
        token: owner.token,
        params: { id: profile },
        body: {},
      },
    )
    expect(prof.json.data).toMatchObject({ postId: null, redirect: '/app/brand' })
    const dis = await call<{ status: string }>(dismissPost, `/api/suggestions/${holiday}/dismiss`, {
      token: owner.token,
      params: { id: holiday },
    })
    expect(dis.json.data!.status).toBe('dismissed')
    const after = await call<{ counts: Record<string, number> }>(suggestionsGet, '/api/suggestions', {
      token: owner.token,
      query: { brandId, status: 'all' },
    })
    expect(after.json.data!.counts).toMatchObject({ new: 0, accepted: 2, dismissed: 1 })
  })
})

describe('Autopilot: mesečni prolaz', () => {
  it('nivo 1: predlog strategije u Inbox-u; drugi prolaz za isti period se preskače', async () => {
    const r = await runMonthlyForBrand(brandId, new Date('2027-06-25T10:00:00Z'))
    expect(r).toMatchObject({ status: 'succeeded', periodStart: '2027-07-05', suggested: true })
    const { data: s } = await admin
      .from('suggestions')
      .select('kind, status, payload')
      .eq('brand_id', brandId)
      .eq('kind', 'strategy_proposal')
    expect(s).toHaveLength(1)
    expect((await runMonthlyForBrand(brandId, new Date('2027-06-26T10:00:00Z'))).status).toBe('skipped')
  })

  it('nivo 2: Autopilot pravi i aktivira strategiju (20 tokena iz budžeta Autopilota)', async () => {
    await patch({ level: 2 })
    enqueueReply({ kind: 'text', json: strategyFixture })
    const r = await runMonthlyForBrand(brandId, new Date('2027-08-25T10:00:00Z'))
    expect(r.status).toBe('succeeded')
    expect(r.periodStart).toBe('2027-09-06')
    const { data: st } = await admin
      .from('strategies')
      .select('status, period_start, approved_by')
      .eq('id', r.strategyId!)
      .single()
    expect(st).toMatchObject({ status: 'active', period_start: '2027-09-06', approved_by: null })
    expect((await view()).usage.used).toBe(20)
  })
})

describe('Autopilot: nedeljni prolaz', () => {
  beforeAll(async () => {
    await patch({ level: 1 })
    const themes = Array.from({ length: 6 }, (_, i) => ({
      week: i + 1,
      theme: `Tema ${['jedan', 'dva', 'tri', 'četiri', 'pet', 'šest'][i]}`,
      angle: 'saveti',
      pillar: 'Edukacija',
      campaign: '',
    }))
    const { data, error } = await admin
      .from('strategies')
      .insert({
        brand_id: brandId,
        period_start: week0,
        period_end: addDays(week0, 6 * 7 - 1),
        version: 1,
        status: 'active',
        summary: 'Test strategija',
        network_mix: {
          facebook: { per_week: 2, formats: [], role: '' },
          instagram: { per_week: 1, formats: [], role: '' },
        },
        best_times: {
          facebook: [
            { weekday: 2, hour: 12, minute: 0, source: 'assumption' },
            { weekday: 4, hour: 12, minute: 0, source: 'assumption' },
          ],
          instagram: [{ weekday: 6, hour: 11, minute: 0, source: 'assumption' }],
        },
        weekly_themes: themes,
        hashtag_strategy: { core: [], niche: [], local: [], avoid: [] },
        goals: [],
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    strategyId = data!.id
  })

  it('nivo 1: tri nacrta (2 FB + 1 IG sa vizualom) prolaze kontrolu i idu na odobrenje; isti prolaz se ne ponavlja', async () => {
    enqueueReply(uniqueReply(), uniqueReply(), uniqueReply())
    const before = (await view()).usage.used
    const r = await runWeeklyForBrand({ brandId, weekStart: week0 }, inline)
    expect(r).toMatchObject({
      status: 'succeeded',
      planned: 3,
      submitted: 3,
      scheduled: 0,
      returned: 0,
      budgetStopped: false,
    })
    expect(r.tokens).toBe(2 + 2 + 4)
    const { data: posts } = await admin
      .from('posts')
      .select(
        'id, status, source, qa_report, strategy_id, pillar_id, master_text, post_targets(platform), post_media(id)',
      )
      .eq('strategy_id', strategyId)
    expect(posts).toHaveLength(3)
    expect(posts!.every((p) => p.status === 'in_review' && p.source === 'autopilot')).toBe(true)
    expect(posts!.every((p) => (p.qa_report as { passed: boolean }).passed)).toBe(true)
    const ig = posts!.find(
      (p) => (p.post_targets as Array<{ platform: string }>)[0]!.platform === 'instagram',
    )!
    expect((ig.post_media as unknown[]).length).toBe(1)
    expect(ig.master_text).toContain('#sova')
    const { count: approvals } = await admin
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .in(
        'post_id',
        posts!.map((p) => p.id),
      )
    expect(approvals).toBe(3)
    expect((await view()).usage.used).toBe(before + 8)
    const { data: report } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', owner.id)
      .eq('type', 'autopilot_weekly_report')
    expect(report!.length).toBe(1)

    const again = await runWeeklyForBrand({ brandId, weekStart: week0 }, inline)
    expect(again.status).toBe('skipped')
    expect(again.reason).toContain('već urađen')
  })

  it('kontrola kvaliteta: zabranjena reč vraća nacrt na doradu uz obaveštenje', async () => {
    const { data: b } = await admin.from('brands').select('settings').eq('id', brandId).single()
    await admin
      .from('brands')
      .update({
        settings: { ...((b!.settings as Record<string, unknown>) ?? {}), forbidden_words: ['najjeftiniji'] },
      })
      .eq('id', brandId)
    enqueueReply(uniqueReply('najjeftiniji u gradu'), uniqueReply(), uniqueReply())
    const r = await runWeeklyForBrand({ brandId, weekStart: addDays(week0, 7) }, inline)
    expect(r).toMatchObject({ planned: 3, submitted: 2, returned: 1 })
    const { data: returned } = await admin
      .from('posts')
      .select('status, qa_report')
      .eq('strategy_id', strategyId)
      .eq('status', 'draft')
      .eq('source', 'autopilot')
    expect(returned).toHaveLength(1)
    const qa = returned![0]!.qa_report as { passed: boolean; checks: Array<{ name: string; ok: boolean }> }
    expect(qa.passed).toBe(false)
    expect(qa.checks.find((c) => c.name === 'forbidden')?.ok).toBe(false)
    const { data: notes } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', owner.id)
      .eq('type', 'autopilot_returned')
    expect(notes!.length).toBe(1)
  })

  it('nivo 3: nalog sa liste se zakazuje bez odobrenja, ostali idu na odobrenje', async () => {
    setFeatureFlagForTests('autopilot_level3', true)
    const { data: b } = await admin.from('brands').select('name').eq('id', brandId).single()
    expect((await patch({ level: 3, confirm: b!.name, level3AccountIds: [fbId] })).status).toBe(200)
    enqueueReply(uniqueReply(), uniqueReply(), uniqueReply())
    const r = await runWeeklyForBrand({ brandId, weekStart: addDays(week0, 14) }, inline)
    expect(r).toMatchObject({ planned: 3, scheduled: 2, submitted: 1 })
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(enqueueTargetScheduled).mock.calls.every((c) => c[3] === fbId)).toBe(true)
  })

  it('budžet: posle limita prolaz staje (delimično) i vlasnik dobija obaveštenje', async () => {
    const used = (await view()).usage.used
    await patch({ tokenBudget: used + 2 })
    enqueueReply(uniqueReply(), uniqueReply(), uniqueReply())
    const r = await runWeeklyForBrand({ brandId, weekStart: addDays(week0, 21) }, inline)
    expect(r.status).toBe('partial')
    expect(r.budgetStopped).toBe(true)
    const v = await view()
    expect(v.usage.state).toBe('stopped')
    const { data: notes } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', owner.id)
      .eq('type', 'autopilot_budget_stopped')
    expect(notes!.length).toBe(1)
    await patch({ tokenBudget: null, level: 2, unapprovedAction: 'publish', approvalDeadlineHours: 24 })
  })
})

describe('Autopilot: rokovi za odobrenje', () => {
  let approvedId = ''
  let publishId = ''

  it('nivo 2 + objavi: neodobrena posle roka se odobrava i zakazuje; odobrena se zakazuje za svoj termin', async () => {
    publishId = await autopilotPost('in_review', 120, 'Rok objavi')
    approvedId = await autopilotPost('approved', 181, 'Odobrena')
    const s = await runAutopilotDeadlines()
    expect(s.published).toBeGreaterThanOrEqual(1)
    expect(s.scheduled).toBeGreaterThanOrEqual(1)
    expect((await postRow(publishId)).status).toBe('scheduled')
    expect((await postRow(approvedId)).status).toBe('scheduled')
    const { data: appr } = await admin
      .from('approvals')
      .select('decision, approver_id')
      .eq('post_id', publishId)
    expect(appr).toEqual([expect.objectContaining({ decision: 'approved', approver_id: null })])
    const { data: targets } = await admin.from('post_targets').select('status').eq('post_id', publishId)
    expect(targets![0]!.status).toBe('scheduled')
  })

  it('nivo 2 + preskoči: neodobrena posle roka se otkazuje', async () => {
    await patch({ unapprovedAction: 'skip' })
    const id = await autopilotPost('in_review', 125, 'Rok preskoči')
    await runAutopilotDeadlines()
    expect((await postRow(id)).status).toBe('canceled')
    const { data: targets } = await admin.from('post_targets').select('status').eq('post_id', id)
    expect(targets![0]!.status).toBe('canceled')
  })

  it('nivo 1: podsetnik jednom, a posle termina objava se vraća u nacrt', async () => {
    await patch({ level: 1 })
    const id = await autopilotPost('in_review', 130, 'Rok nivo jedan')
    const first = await runAutopilotDeadlines()
    expect(first.reminded).toBeGreaterThanOrEqual(1)
    await runAutopilotDeadlines()
    const { data: reminders } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', owner.id)
      .eq('type', 'autopilot_deadline')
      .contains('data', { postId: id, kind: 'remind' })
    expect(reminders).toHaveLength(1)
    await admin
      .from('posts')
      .update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', id)
    const s = await runAutopilotDeadlines()
    expect(s.expired).toBeGreaterThanOrEqual(1)
    expect((await postRow(id)).status).toBe('draft')
  })

  it('„Pauziraj sve” pauzira zakazane i zaustavlja prolaz; „Nastavi” vraća objave u red', async () => {
    const paused = await call<{ paused: number }>(pausePost, `/api/autopilot/${brandId}/pause`, {
      token: editor.token,
      params: { brandId },
      body: {},
    })
    expect(paused.status).toBe(200)
    expect(paused.json.data!.paused).toBeGreaterThanOrEqual(2)
    expect((await postRow(approvedId)).status).toBe('paused')
    expect(vi.mocked(enqueueTargetUnscheduled)).toHaveBeenCalled()
    expect((await view()).paused).toBe(true)
    const skipped = await runWeeklyForBrand({ brandId, weekStart: addDays(week0, 28) }, inline)
    expect(skipped).toMatchObject({ status: 'skipped', reason: 'Brend je pauziran.' })

    expect(
      (
        await call(resumePost, `/api/autopilot/${brandId}/resume`, {
          token: editor.token,
          params: { brandId },
          body: {},
        })
      ).status,
    ).toBe(403)
    const resumed = await call<{ resumed: number }>(resumePost, `/api/autopilot/${brandId}/resume`, {
      token: owner.token,
      params: { brandId },
      body: {},
    })
    expect(resumed.json.data!.resumed).toBeGreaterThanOrEqual(2)
    expect((await postRow(approvedId)).status).toBe('scheduled')
    expect((await postRow(publishId)).status).toBe('scheduled')
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalled()
    expect((await view()).paused).toBe(false)
  })
})

describe('Okidači i održavanje Inbox-a', () => {
  it('praznik u narednih 7 dana pravi predlog jednom; istekli predlozi se gase', async () => {
    holidayName = `Test praznik ${rw()}`
    const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    await admin.from('holidays').insert({ country: 'GLOBAL', date, name: holidayName, kind: 'commercial' })
    expect(await holidaySuggestions()).toBeGreaterThanOrEqual(1)
    await holidaySuggestions()
    const { data: s } = await admin
      .from('suggestions')
      .select('kind, source')
      .eq('brand_id', brandId)
      .eq('source', 'holiday')
      .contains('payload', { name: holidayName })
    expect(s).toEqual([{ kind: 'post_idea', source: 'holiday' }])

    const { data: old } = await admin
      .from('suggestions')
      .insert({
        brand_id: brandId,
        source: 'manual',
        kind: 'post_idea',
        title: 'Stari',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .select('id')
      .single()
    expect(await expireSuggestions()).toBeGreaterThanOrEqual(1)
    const { data: row } = await admin.from('suggestions').select('status').eq('id', old!.id).single()
    expect(row!.status).toBe('expired')
  })

  it('objava sa dvostrukim angažovanjem od proseka daje predlog „ponovi format” (jednom)', async () => {
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const { data: post } = await admin
        .from('posts')
        .insert({
          brand_id: brandId,
          workspace_id: wsId,
          master_text: `Objavljena ${i}`,
          status: 'published',
        })
        .select('id')
        .single()
      const { data: t } = await admin
        .from('post_targets')
        .insert({
          post_id: post!.id,
          brand_id: brandId,
          social_account_id: igId,
          platform: 'instagram',
          status: 'published',
          external_post_id: `ig-out-${i}-${rw()}`,
          published_at: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
        })
        .select('id')
        .single()
      await admin.from('post_metrics_snapshots').insert({
        target_id: t!.id,
        social_account_id: igId,
        brand_id: brandId,
        horizon: '24h',
        reach: 100,
        reactions: i === 0 ? 50 : 10,
        comments: 0,
        shares: 0,
        saves: 0,
      })
      ids.push(t!.id)
    }
    expect(await checkOutlier(ids[1]!)).toBe(false)
    expect(await checkOutlier(ids[0]!)).toBe(true)
    expect(await checkOutlier(ids[0]!)).toBe(false)
    const { data: s } = await admin
      .from('suggestions')
      .select('kind, source, evidence')
      .eq('brand_id', brandId)
      .eq('kind', 'repeat_format')
    expect(s).toHaveLength(1)
    expect(s![0]).toMatchObject({
      source: 'analytics',
      evidence: expect.objectContaining({ targetIds: [ids[0]] }),
    })
  })
})
