import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueStrategyJob: vi.fn(async () => {}),
    enqueueTargetScheduled: vi.fn(async () => {}),
    enqueueTargetUnscheduled: vi.fn(async () => {}),
    enqueueHistoryImport: vi.fn(async () => {}),
  }
})

import { GET as calendarGet } from '@/app/api/calendar/route'
import { DELETE as campaignDelete } from '@/app/api/campaigns/[id]/route'
import { POST as campaignsPost } from '@/app/api/campaigns/route'
import { DELETE as pillarDelete, PATCH as pillarPatch } from '@/app/api/pillars/[id]/route'
import { GET as pillarsGet, POST as pillarsPost } from '@/app/api/pillars/route'
import { POST as calendarPost } from '@/app/api/strategies/[id]/generate-calendar/route'
import { GET as strategyGet, PATCH as strategyPatch } from '@/app/api/strategies/[id]/route'
import { POST as generatePost } from '@/app/api/strategies/generate/route'
import { GET as strategiesGet } from '@/app/api/strategies/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueStrategyJob } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { runStrategyGeneration } from '@/services/strategy/strategy'

import { enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let owner: TestUser
let viewerUser: TestUser
let wsId = ''
let brandId = ''
let strategyV1 = ''
let strategyV2 = ''

const PERIOD_START = '2027-01-04' // ponedeljak; Božić 7.1.2027 je neradan praznik u periodu

const fixture = {
  summary: 'Fokus na upite iz Beograda kroz edukaciju i jasnu ponudu.',
  goals: [
    { goal: 'Više upita', kpi: 'upiti nedeljno', target: '8' },
    { goal: 'Doseg', kpi: 'reach', target: '+15 %' },
  ],
  network_mix: [
    { platform: 'instagram', per_week: 3, formats: ['karusel', 'reel'], role: 'brend i edukacija' },
    { platform: 'facebook', per_week: 2, formats: ['objava sa fotografijom'], role: 'lokalna zajednica' },
    { platform: 'linkedin', per_week: 1, formats: [], role: 'nije tražen' },
  ],
  pillars: [
    { name: 'Edukacija', description: 'Saveti i odgovori', share_percent: 40 },
    { name: 'Ponuda', description: 'Akcije i paketi', share_percent: 35 },
    { name: 'Iza kulisa', description: 'Tim i proces', share_percent: 30 },
  ],
  weekly_themes: [
    { week: 1, theme: 'Priprema za zimu', angle: 'saveti', pillar: 'Edukacija', campaign: '' },
    { week: 2, theme: 'Ponuda meseca', angle: 'popust', pillar: 'Ponuda', campaign: 'Zimska akcija' },
    { week: 3, theme: 'Tim', angle: 'ljudi', pillar: 'Iza kulisa', campaign: '' },
  ],
  hashtag_strategy: {
    core: ['#Sova', 'sova test'],
    niche: ['#klima'],
    local: ['#beograd'],
    avoid: ['#follow4follow'],
  },
  best_times: [
    { platform: 'instagram', weekday: 2, hour: 18 },
    { platform: 'facebook', weekday: 9, hour: 12 },
  ],
  campaigns: [
    {
      name: 'Zimska akcija',
      goal: 'prodaja',
      starts_on: '2027-01-11',
      ends_on: '2027-01-24',
      key_message: '-20 % na servis',
      offer: '-20 % na servis',
      cta: 'Zakažite',
    },
  ],
  assumptions: ['Nema istorije objava, vremena su pretpostavke.'],
}

interface StrategyView {
  id: string
  status: string
  version: number
  weeks: number
  summary: string | null
  usesAssumptions: boolean
  approvedBy: string | null
  goals: unknown[]
  networkMix: Record<string, { per_week: number }>
  weeklyThemes: Array<{ week: number; theme: string; pillar: string }>
  hashtagStrategy: { core: string[] }
  bestTimes: Record<string, Array<{ weekday: number; hour: number; source: string }>>
  pillars: Array<{ id: string; name: string; sharePercent: number | null; strategyId: string | null }>
  campaigns: Array<{ id: string; name: string; startsOn: string | null }>
  plannedPosts: number
}

/** stanje tokena kao korisnik (RPC računa pristup iz auth.uid(), pa service role vraća null) */
async function balance(): Promise<number> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${owner.token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  const { data, error } = await client.rpc('workspace_token_balance', { p_workspace_id: wsId })
  if (error || !data) throw new Error(`balance: ${error?.message ?? 'null'}`)
  return (data as { available: number }).available
}

async function generate(body: Record<string, unknown>, token = owner.token) {
  return call<{ generationId: string; tokensReserved: number; platforms: string[]; periodEnd: string }>(
    generatePost,
    '/api/strategies/generate',
    { token, body, headers: { 'idempotency-key': crypto.randomUUID() } },
  )
}

async function detail(id: string): Promise<StrategyView> {
  const r = await call<StrategyView>(strategyGet, `/api/strategies/${id}`, {
    token: owner.token,
    params: { id },
  })
  if (r.status !== 200) throw new Error(JSON.stringify(r.json.error))
  return r.json.data!
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  owner = await createTestUser('strat-owner')
  viewerUser = await createTestUser('strat-viewer')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Strategija test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: viewerUser.id, role: 'viewer', all_brands: true })
  const { error } = await admin.from('social_accounts').insert([
    {
      brand_id: brandId,
      workspace_id: wsId,
      platform: 'facebook',
      external_id: 'page-s1',
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
      external_id: 'ig-s1',
      external_parent_id: 'page-s1',
      name: 'IG',
      account_type: 'instagram_business',
      status: 'active',
      capabilities: { publish: true },
      metadata: {},
      assisted_only: false,
    },
  ])
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetGeminiMock()
  resetMemoryRateLimit()
  vi.mocked(enqueueStrategyJob).mockClear()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(viewerUser)
  await deleteTestUser(owner)
})

describe('Strategija: generisanje', () => {
  it('202 sa rezervacijom 20 tokena; posao pravi strategiju v1 sa stubovima, kampanjom i pretpostavkama', async () => {
    const before = await balance()
    const r = await generate({ brandId, periodStart: PERIOD_START, weeks: 4, goals: ['Više upita'] })
    expect(r.status).toBe(202)
    expect(r.json.data!.tokensReserved).toBe(20)
    expect(r.json.data!.platforms.sort()).toEqual(['facebook', 'instagram'])
    expect(r.json.data!.periodEnd).toBe('2027-01-31')
    expect(vi.mocked(enqueueStrategyJob)).toHaveBeenCalledTimes(1)
    expect(await balance()).toBe(before - 20)

    enqueueReply({ kind: 'text', json: fixture })
    const run = await runStrategyGeneration(r.json.data!.generationId)
    expect(run.status).toBe('succeeded')
    strategyV1 = run.strategyId!

    const list = await call<{
      strategies: Array<{ id: string; status: string; version: number; weeks: number }>
    }>(strategiesGet, '/api/strategies', { token: owner.token, query: { brandId } })
    expect(list.json.data!.strategies).toHaveLength(1)
    expect(list.json.data!.strategies[0]).toMatchObject({
      id: strategyV1,
      status: 'draft',
      version: 1,
      weeks: 4,
    })

    const s = await detail(strategyV1)
    expect(s.summary).toBe(fixture.summary)
    expect(s.goals).toHaveLength(2)
    expect(Object.keys(s.networkMix).sort()).toEqual(['facebook', 'instagram']) // linkedin odbačen
    expect(s.networkMix.instagram!.per_week).toBe(3)
    expect(s.pillars.filter((p) => p.strategyId === strategyV1)).toHaveLength(3)
    expect(s.pillars.reduce((n, p) => n + (p.sharePercent ?? 0), 0)).toBe(100)
    expect(s.weeklyThemes.map((t) => t.week)).toEqual([1, 2, 3, 4]) // nedostajuća 4. tema je popunjena
    expect(s.hashtagStrategy.core).toEqual(['#sova', '#sovatest'])
    expect(s.bestTimes.instagram![0]).toMatchObject({ weekday: 2, hour: 18, source: 'assumption' })
    expect(s.bestTimes.facebook!.length).toBe(3) // nevažeći predlog (weekday 9) → tabela pretpostavki
    expect(s.usesAssumptions).toBe(true)
    expect(s.campaigns.find((c) => c.name === 'Zimska akcija')?.startsOn).toBe('2027-01-11')
    expect(s.plannedPosts).toBe(0)
  })

  it('posmatrač ne može da generiše; nedostatak Idempotency-Key je greška', async () => {
    const r = await generate({ brandId, periodStart: PERIOD_START, weeks: 4 }, viewerUser.token)
    expect(r.status).toBe(403)
    const noKey = await call(generatePost, '/api/strategies/generate', {
      token: owner.token,
      body: { brandId, periodStart: PERIOD_START, weeks: 4 },
    })
    expect(noKey.status).toBe(400)
  })

  it('druga strategija za isti period je v2; aktiviranje v2 arhivira v1', async () => {
    const r = await generate({ brandId, periodStart: PERIOD_START, weeks: 4 })
    expect(r.status).toBe(202)
    enqueueReply({ kind: 'text', json: { ...fixture, summary: 'Druga verzija.' } })
    const run = await runStrategyGeneration(r.json.data!.generationId)
    expect(run.status).toBe('succeeded')
    strategyV2 = run.strategyId!
    const v2 = await detail(strategyV2)
    expect(v2.version).toBe(2)
    // postojeći stubovi sa istim imenom se vezuju, ne dupliraju
    const pillars = await call<{ pillars: Array<{ name: string }> }>(pillarsGet, '/api/pillars', {
      token: owner.token,
      query: { brandId },
    })
    expect(pillars.json.data!.pillars.filter((p) => p.name === 'Edukacija')).toHaveLength(1)

    const act1 = await call<StrategyView>(strategyPatch, `/api/strategies/${strategyV1}`, {
      token: owner.token,
      method: 'PATCH',
      params: { id: strategyV1 },
      body: { status: 'active' },
    })
    expect(act1.json.data!.status).toBe('active')
    expect(act1.json.data!.approvedBy).toBe(owner.id)
    const act2 = await call<StrategyView>(strategyPatch, `/api/strategies/${strategyV2}`, {
      token: owner.token,
      method: 'PATCH',
      params: { id: strategyV2 },
      body: { status: 'active' },
    })
    expect(act2.json.data!.status).toBe('active')
    expect((await detail(strategyV1)).status).toBe('archived')
  })
})

describe('Strategija: kalendar nacrta', () => {
  it('pravi nedelje × per_week nacrta sa stubom, terminom i targetima; ponovni poziv ne duplira', async () => {
    const r = await call<{
      created: number
      skipped: { past: number; duplicate: number; noAccount: number }
    }>(calendarPost, `/api/strategies/${strategyV2}/generate-calendar`, {
      token: owner.token,
      params: { id: strategyV2 },
      body: {},
    })
    expect(r.status).toBe(201)
    expect(r.json.data!.created).toBe(4 * (3 + 2))
    expect(r.json.data!.skipped).toEqual({ past: 0, duplicate: 0, noAccount: 0 })

    const { data: posts } = await admin
      .from('posts')
      .select('id, status, source, pillar_id, campaign_id, scheduled_for, title, master_text')
      .eq('strategy_id', strategyV2)
    expect(posts).toHaveLength(20)
    expect(
      posts!.every((p) => p.status === 'draft' && p.source === 'ai' && p.pillar_id && p.scheduled_for),
    ).toBe(true)
    expect(posts!.every((p) => p.scheduled_for! >= '2027-01-04' && p.scheduled_for! < '2027-02-01')).toBe(
      true,
    )
    expect(posts!.some((p) => p.campaign_id)).toBe(true) // nedelja 2 je vezana za kampanju
    expect(posts!.some((p) => p.scheduled_for!.startsWith('2027-01-07'))).toBe(false) // Božić preskočen
    expect(posts![0]!.master_text).toContain('Tema nedelje')
    const { count: targets } = await admin
      .from('post_targets')
      .select('id', { count: 'exact', head: true })
      .in(
        'post_id',
        posts!.map((p) => p.id),
      )
    expect(targets).toBe(20)
    expect((await detail(strategyV2)).plannedPosts).toBe(20)

    const again = await call<{ created: number; skipped: { duplicate: number } }>(
      calendarPost,
      `/api/strategies/${strategyV2}/generate-calendar`,
      { token: owner.token, params: { id: strategyV2 }, body: {} },
    )
    expect(again.json.data!.created).toBe(0)
    expect(again.json.data!.skipped.duplicate).toBe(20)

    const cal = await call<{ items: Array<{ status: string; targets: unknown[] }> }>(
      calendarGet,
      '/api/calendar',
      {
        token: owner.token,
        query: { brandId, from: '2027-01-04T00:00:00Z', to: '2027-01-10T23:59:59Z' },
      },
    )
    expect(cal.status).toBe(200)
    expect(cal.json.data!.items.length).toBe(5)
    expect(cal.json.data!.items.every((i) => i.status === 'draft')).toBe(true)
  })
})

describe('Stubovi i kampanje', () => {
  it('stub: dodavanje, dupli naziv 409, izmena udela, brisanje', async () => {
    const created = await call<{ id: string; color: string | null }>(pillarsPost, '/api/pillars', {
      token: owner.token,
      body: { brandId, name: 'Recenzije', sharePercent: 10 },
    })
    expect(created.status).toBe(201)
    expect(created.json.data!.color).toMatch(/^#/)
    const dup = await call(pillarsPost, '/api/pillars', {
      token: owner.token,
      body: { brandId, name: 'recenzije' },
    })
    expect(dup.status).toBe(409)
    const id = created.json.data!.id
    const patched = await call<{ sharePercent: number }>(pillarPatch, `/api/pillars/${id}`, {
      token: owner.token,
      method: 'PATCH',
      params: { id },
      body: { sharePercent: 15 },
    })
    expect(patched.json.data!.sharePercent).toBe(15)
    const forbidden = await call(pillarDelete, `/api/pillars/${id}`, {
      token: viewerUser.token,
      method: 'DELETE',
      params: { id },
    })
    expect(forbidden.status).toBe(403)
    const del = await call(pillarDelete, `/api/pillars/${id}`, {
      token: owner.token,
      method: 'DELETE',
      params: { id },
    })
    expect(del.status).toBe(200)
  })

  it('kampanja: kraj pre početka je 400; dodavanje i brisanje', async () => {
    const bad = await call(campaignsPost, '/api/campaigns', {
      token: owner.token,
      body: { brandId, name: 'Loša', startsOn: '2027-02-10', endsOn: '2027-02-01' },
    })
    expect(bad.status).toBe(400)
    const ok = await call<{ id: string }>(campaignsPost, '/api/campaigns', {
      token: owner.token,
      body: {
        brandId,
        name: 'Prolećna akcija',
        startsOn: '2027-03-01',
        endsOn: '2027-03-15',
        cta: 'Zakažite',
      },
    })
    expect(ok.status).toBe(201)
    const id = ok.json.data!.id
    const del = await call(campaignDelete, `/api/campaigns/${id}`, {
      token: owner.token,
      method: 'DELETE',
      params: { id },
    })
    expect(del.status).toBe(200)
  })
})
