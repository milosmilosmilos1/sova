import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueFlowRun: vi.fn(async () => {}),
}))

import { DELETE as flowDelete, GET as flowGet, PATCH as flowPatch } from '@/app/api/flows/[id]/route'
import { POST as flowRunPost } from '@/app/api/flows/[id]/run/route'
import { GET as flowsGet, POST as flowsPost } from '@/app/api/flows/route'
import { GET as runGet } from '@/app/api/flows/runs/[runId]/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueFlowRun } from '@/lib/jobs/enqueue'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import type { StepRunner } from '@/services/autopilot/runner'
import { claimDueRuns } from '@/services/flows/flows'
import { resolveDesign } from '@/services/design/brand-design'
import { runFlow } from '@/services/flows/runner'

import { enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers } from './visuals-mock'

/** Tokovi automatizacije (D-108, faza 3). */
let user: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let igId = ''
let fbId = ''
const inline: StepRunner = (_name, fn) => fn()

interface FlowView {
  id: string
  name: string
  format: string
  days: number[]
  timeLocal: string
  effectiveTime: string
  active: boolean
  nextRunAt: string | null
  collaborators: string[]
  lastRun: { status: string; postId: string | null } | null
}

function carouselReply(n: number) {
  return {
    kind: 'text' as const,
    json: {
      slides: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
        kicker: null,
        title: i === 0 ? 'Zašto sajtovi padaju posle migracije' : `Korak ${i}`,
        body: 'Kratko objašnjenje bez žargona.',
        stat: null,
        items: null,
      })),
      caption:
        'Jedna rečenica otkriva zašto sajtovi posle migracije padnu na Google-u.\n\nTri stvari proverite pre selidbe.',
      short_caption: 'Zašto sajtovi padaju posle migracije i šta da proverite.',
      hashtags: ['#seo', '#migracija'],
      first_comment: 'Koju grešku ste već videli?',
      visual_query: 'website migration laptop',
      alt_text: 'Slajdovi o migraciji sajta.',
    },
  }
}

function create(body: Record<string, unknown>, token = user.token) {
  return call<FlowView>(flowsPost, '/api/flows', {
    token,
    body: { brandId, name: 'SEO edukacija', topic: 'Objašnjenje jednog SEO pojma kroz poređenje', ...body },
  })
}

async function runRow(id: string) {
  const { data } = await admin.from('content_flow_runs').select('*').eq('id', id).single()
  return data!
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('flows')
  other = await createTestUser('flows-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Tokovi test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  // dovoljno tokena za više prolaza
  const { error: grantError } = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 200,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  if (grantError) throw new Error(grantError.message)
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active',
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  }
  const { data, error } = await admin
    .from('social_accounts')
    .insert([
      {
        ...base,
        platform: 'instagram',
        external_id: `ig-flow-${Date.now()}`,
        name: 'IG',
        username: 'tangerineseo',
        account_type: 'instagram_business',
      },
      {
        ...base,
        platform: 'facebook',
        external_id: `fb-flow-${Date.now()}`,
        name: 'Strana',
        account_type: 'facebook_page',
      },
    ])
    .select('id, platform')
  if (error) throw new Error(error.message)
  igId = data!.find((a) => a.platform === 'instagram')!.id
  fbId = data!.find((a) => a.platform === 'facebook')!.id
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  resetVisualsState()
  vi.mocked(enqueueFlowRun).mockClear()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(user)
  await deleteTestUser(other)
})

describe('Tokovi: pravljenje i izmena', () => {
  it('pravi tok sa podrazumevanim rasporedom (pon, sre, pet u 10:00) i računa sledeći termin', async () => {
    const r = await create({})
    expect(r.status).toBe(201)
    expect(r.json.data).toMatchObject({
      format: 'carousel',
      days: [1, 3, 5],
      timeLocal: '10:00',
      active: true,
    })
    expect(new Date(r.json.data!.nextRunAt!).getTime()).toBeGreaterThan(Date.now())
    const list = await call<{ flows: FlowView[] }>(flowsGet, '/api/flows', {
      token: user.token,
      query: { brandId },
    })
    expect(list.json.data!.flows.map((f) => f.id)).toContain(r.json.data!.id)
  })

  it('provere: bez dana, bez naloga kad nije „sve mreže”, karusel ispod 3 slajda, tuđ nalog; tuđ brend 404', async () => {
    expect((await create({ days: [] })).status).toBe(400)
    expect((await create({ autoAccounts: false, accountIds: [] })).status).toBe(400)
    expect((await create({ slides: 2 })).status).toBe(400)
    expect((await create({ collaborators: ['jedan', 'dva', 'tri', 'cetiri'] })).status).toBe(400)
    const foreign = await create({
      autoAccounts: false,
      accountIds: ['8a4c2f8e-0000-4000-8000-000000000000'],
    })
    expect(foreign.status).toBe(400)
    expect((await create({}, other.token)).status).toBe(404)
  })

  it('pauza briše termin, ponovo uključen tok dobija termin; „Sova bira vreme” daje stabilan sat; brisanje', async () => {
    const f = (await create({ name: 'Pauza' })).json.data!
    const paused = await call<FlowView>(flowPatch, `/api/flows/${f.id}`, {
      token: user.token,
      params: { id: f.id },
      body: { active: false },
    })
    expect(paused.json.data).toMatchObject({ active: false, nextRunAt: null })
    const auto = await call<FlowView>(flowPatch, `/api/flows/${f.id}`, {
      token: user.token,
      params: { id: f.id },
      body: { active: true, autoTime: true, days: [0, 6] },
    })
    expect(auto.json.data!.nextRunAt).not.toBeNull()
    expect(auto.json.data!.effectiveTime).toMatch(/^([01]\d|2[0-1]):(00|15|30|45)$/)
    const del = await call(flowDelete, `/api/flows/${f.id}`, { token: user.token, params: { id: f.id } })
    expect(del.status).toBe(200)
    expect(
      (await call(flowGet, `/api/flows/${f.id}`, { token: user.token, params: { id: f.id } })).status,
    ).toBe(404)
  })
})

describe('Tokovi: prolaz', () => {
  it('„Generiši odmah” upisuje prolaz i šalje ga u red; drugi klik vraća isti prolaz', async () => {
    const f = (await create({ name: 'Ručno', photoSource: 'none' })).json.data!
    const r = await call<{ id: string; status: string }>(flowRunPost, `/api/flows/${f.id}/run`, {
      token: user.token,
      params: { id: f.id },
    })
    expect(r.status).toBe(202)
    expect(r.json.data!.status).toBe('queued')
    expect(vi.mocked(enqueueFlowRun)).toHaveBeenCalledWith(r.json.data!.id, wsId)
    const again = await call<{ id: string }>(flowRunPost, `/api/flows/${f.id}/run`, {
      token: user.token,
      params: { id: f.id },
    })
    expect(again.json.data!.id).toBe(r.json.data!.id)
    const view = await call<{ status: string; step: string | null }>(
      runGet,
      `/api/flows/runs/${r.json.data!.id}`,
      {
        token: user.token,
        params: { runId: r.json.data!.id },
      },
    )
    expect(view.json.data).toMatchObject({ status: 'queued', step: null })
  })

  it('prolaz pravi nacrt na odobravanju: 4 slajda u temi brenda, opisi po mreži, saradnici na Instagramu, 2 tokena', async () => {
    const f = (
      await create({
        name: 'Karusel',
        slides: 4,
        styleId: 'bold',
        photoSource: 'none',
        collaborators: ['@Partner.One'],
      })
    ).json.data!
    const started = await call<{ id: string }>(flowRunPost, `/api/flows/${f.id}/run`, {
      token: user.token,
      params: { id: f.id },
    })
    enqueueReply(carouselReply(4))
    const result = await runFlow(started.json.data!.id, inline)
    expect(result.status).toBe('succeeded')
    const run = await runRow(started.json.data!.id)
    expect(run).toMatchObject({ status: 'succeeded', step: 'done', tokens: 2 })
    const { data: post } = await admin
      .from('posts')
      .select(
        'status, source, flow_id, master_text, title, post_targets(platform, text_content, options), post_media(sort_order, media_assets(source, width, height, source_data))',
      )
      .eq('id', run.post_id!)
      .single()
    expect(post).toMatchObject({
      status: 'in_review',
      source: 'autopilot',
      flow_id: f.id,
      title: 'Zašto sajtovi padaju posle migracije',
    })
    expect(post!.master_text).toContain('#seo #migracija')
    const media = post!.post_media as unknown as Array<{
      media_assets: { source: string; width: number; height: number; source_data: { styleId: string } }
    }>
    expect(media).toHaveLength(4)
    // stil toka iz ranijih verzija (bold) se ne koristi: sve objave su u temi brenda (D-125)
    const { data: brandRow } = await admin.from('brands').select('*').eq('id', brandId).single()
    const theme = await resolveDesign(brandRow!)
    expect(theme.styleId).not.toBe('bold')
    expect(
      media.every(
        (m) => m.media_assets.source === 'template' && m.media_assets.source_data.styleId === theme.styleId,
      ),
    ).toBe(true)
    const targets = post!.post_targets as unknown as Array<{
      platform: string
      options: Record<string, unknown>
    }>
    expect(targets.map((t) => t.platform).sort()).toEqual(['facebook', 'instagram'])
    expect(targets.find((t) => t.platform === 'instagram')!.options).toMatchObject({
      collaborators: ['partner.one'],
    })
    expect(targets.find((t) => t.platform === 'facebook')!.options).not.toHaveProperty('collaborators')
    const { count } = await admin
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', run.post_id!)
    expect(count).toBe(1)
    const flow = await call<FlowView>(flowGet, `/api/flows/${f.id}`, {
      token: user.token,
      params: { id: f.id },
    })
    expect(flow.json.data!.lastRun).toMatchObject({ status: 'succeeded', postId: run.post_id })
  })

  it('priča ide samo na mreže koje je primaju, sa oznakom story; tok samo za LinkedIn bez naloga pada uz obaveštenje', async () => {
    const story = (await create({ name: 'Priča', format: 'story', photoSource: 'none' })).json.data!
    const s = await call<{ id: string }>(flowRunPost, `/api/flows/${story.id}/run`, {
      token: user.token,
      params: { id: story.id },
    })
    enqueueReply(carouselReply(1))
    expect((await runFlow(s.json.data!.id, inline)).status).toBe('succeeded')
    const { data: targets } = await admin
      .from('post_targets')
      .select('platform, options')
      .eq('post_id', (await runRow(s.json.data!.id)).post_id!)
    expect(targets!.every((t) => (t.options as { format?: string }).format === 'story')).toBe(true)

    // samo izabrani Facebook nalog, ali priča na Facebook-u prolazi; zatim nalog koji ne postoji u brendu ne može
    const single = (
      await create({
        name: 'Samo FB',
        format: 'single',
        autoAccounts: false,
        accountIds: [fbId],
        photoSource: 'none',
      })
    ).json.data!
    const r = await call<{ id: string }>(flowRunPost, `/api/flows/${single.id}/run`, {
      token: user.token,
      params: { id: single.id },
    })
    enqueueReply(carouselReply(1))
    expect((await runFlow(r.json.data!.id, inline)).status).toBe('succeeded')
    const { data: fbTargets } = await admin
      .from('post_targets')
      .select('social_account_id')
      .eq('post_id', (await runRow(r.json.data!.id)).post_id!)
    expect(fbTargets!.map((t) => t.social_account_id)).toEqual([fbId])

    await admin.from('social_accounts').update({ status: 'needs_reauth' }).in('id', [igId, fbId])
    const none = (await create({ name: 'Bez mreže', photoSource: 'none' })).json.data!
    const n = await call<{ id: string }>(flowRunPost, `/api/flows/${none.id}/run`, {
      token: user.token,
      params: { id: none.id },
    })
    const failed = await runFlow(n.json.data!.id, inline)
    expect(failed.status).toBe('failed')
    expect((await runRow(n.json.data!.id)).error).toContain('Nema povezane mreže')
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'flow_failed')
    expect(count).toBeGreaterThanOrEqual(1)
    await admin.from('social_accounts').update({ status: 'active' }).in('id', [igId, fbId])
  })

  it('cron upisuje prolaz kad dođe termin, jednom po terminu, i pomera sledeći termin; pauziran brend se preskače', async () => {
    const f = (await create({ name: 'Cron', photoSource: 'none' })).json.data!
    const past = new Date(Date.now() - 60_000).toISOString()
    await admin.from('content_flows').update({ next_run_at: past }).eq('id', f.id)
    const first = await claimDueRuns(new Date())
    const mine = first.filter((c) => c.workspaceId === wsId)
    expect(mine).toHaveLength(1)
    const { data: flow } = await admin.from('content_flows').select('next_run_at').eq('id', f.id).single()
    expect(new Date(flow!.next_run_at!).getTime()).toBeGreaterThan(Date.now())
    expect((await claimDueRuns(new Date())).filter((c) => c.workspaceId === wsId)).toHaveLength(0)
    // isti termin ponovo (npr. ponovljen cron) ne pravi drugi prolaz
    await admin.from('content_flows').update({ next_run_at: past }).eq('id', f.id)
    expect((await claimDueRuns(new Date())).filter((c) => c.workspaceId === wsId)).toHaveLength(0)

    await admin.from('brands').update({ status: 'paused' }).eq('id', brandId)
    await admin
      .from('content_flows')
      .update({ next_run_at: new Date(Date.now() - 30_000).toISOString() })
      .eq('id', f.id)
    expect((await claimDueRuns(new Date())).filter((c) => c.workspaceId === wsId)).toHaveLength(0)
    await admin.from('brands').update({ status: 'active' }).eq('id', brandId)
  })
})
