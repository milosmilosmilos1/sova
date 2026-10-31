import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueMonthPlan: vi.fn(async () => {}),
  enqueueMonthPlanGenerate: vi.fn(async () => {}),
  enqueueTargetScheduled: vi.fn(async () => {}),
  enqueueTargetUnscheduled: vi.fn(async () => {}),
}))

import { POST as galleryDeletePost } from '@/app/api/gallery/delete/route'
import { POST as generatePost } from '@/app/api/plans/[id]/generate/route'
import { POST as itemsDeletePost } from '@/app/api/plans/[id]/items/delete/route'
import { PATCH as itemPatch } from '@/app/api/plans/[id]/items/[itemId]/route'
import { GET as planGet } from '@/app/api/plans/[id]/route'
import { GET as plansGet, POST as plansPost } from '@/app/api/plans/route'
import { POST as postsBulkPost } from '@/app/api/posts/bulk/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { finishPlan, pendingItems, runPlanItem, runPlanning } from '@/services/plans/runner'

import {
  calls,
  defaultTextOutput,
  enqueueReply,
  geminiServer,
  resetGeminiMock,
  type MockReply,
} from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, unsplashHandlers } from './visuals-mock'

/** Mesečni plan na klik i označavanje u listama (D-119). */
let user: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let planId = ''

interface Item {
  id: string
  scheduledFor: string
  date: string
  time: string
  format: string
  platforms: string[]
  topic: string
  status: string
  postId: string | null
}
interface Plan {
  id: string
  status: string
  periodStart: string
  periodEnd: string
  items: Item[]
  counts: Record<string, number>
}

function carouselReply(n: number): MockReply {
  return {
    kind: 'text',
    json: {
      slides: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
        kicker: null,
        title: i === 0 ? 'Leto bez znoja' : i === n - 1 ? 'Zakažite servis' : `Savet ${i}`,
        body: 'Kratko objašnjenje.',
        stat: null,
        items: null,
      })),
      caption: 'Leto je blizu.\n\nOčistite klimu na vreme.',
      short_caption: 'Leto je blizu.',
      hashtags: ['#klima'],
      first_comment: null,
      visual_query: 'air conditioner',
      alt_text: 'Slajdovi.',
    },
  }
}

/** Gemini za plan: tema za svaki termin iz podešavanja plana. */
async function planReply(id: string): Promise<MockReply> {
  const { data } = await admin.from('month_plans').select('settings').eq('id', id).single()
  const slots = (data!.settings as { slots: unknown[] }).slots
  return {
    kind: 'text',
    json: {
      items: slots.map((_, i) => ({
        slot: i,
        topic: `Tema broj ${i + 1} za klima servis`,
        brief: 'Šta objava kaže i za koga.',
        goal: i % 4 === 0 ? 'sales' : 'education',
        pillar: 'Edukacija',
        cta: null,
      })),
    },
  }
}

/** Gemini za plan od više meseci: jedan odgovor po mesecu, termini se broje u okviru meseca (D-120). */
async function planRepliesByMonth(id: string): Promise<MockReply[]> {
  const { data } = await admin.from('month_plans').select('settings').eq('id', id).single()
  const slots = (data!.settings as { slots: Array<{ date: string }> }).slots
  const months = [...new Set(slots.map((s) => s.date.slice(0, 7)))]
  return months.map((m) => ({
    kind: 'text',
    json: {
      items: slots
        .filter((s) => s.date.startsWith(m))
        .map((_, i) => ({
          slot: i,
          topic: `Tema ${m} broj ${i + 1}`,
          brief: 'Šta objava kaže i za koga.',
          goal: 'education',
          pillar: 'Edukacija',
          cta: null,
        })),
    },
  }))
}

const MONTH_NAMES = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
]
let twoMonthPlanId = ''

/** Pravljenje svih nacrta onako kako ga radi pozadinski posao. */
async function generateAll(id: string): Promise<{ done: number; failed: number }> {
  const ids = await pendingItems(id)
  const { data: items } = await admin.from('month_plan_items').select('id, format').in('id', ids)
  const byId = new Map((items ?? []).map((i) => [i.id, i.format]))
  for (const itemId of ids) {
    const format = byId.get(itemId)
    enqueueReply(
      format === 'text'
        ? { kind: 'text', json: defaultTextOutput }
        : carouselReply(format === 'carousel' ? 5 : 1),
    )
    await runPlanItem(itemId)
  }
  return finishPlan(id)
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('plans')
  other = await createTestUser('plans-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Plan test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const { error } = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 300,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
  await deleteTestUser(other)
})

describe('mesečni plan', () => {
  it('bez povezane mreže plan se ne pravi; strana nudi mesece i cene', async () => {
    const page = await call<{
      plan: null
      options: { months: Array<{ kind: string }>; prices: { plan: number; post: number } }
    }>(plansGet, '/api/plans', { token: user.token, query: { brandId } })
    expect(page.json.data!.plan).toBeNull()
    expect(page.json.data!.options.prices).toEqual({ plan: 3, post: 2 })
    expect(page.json.data!.options.months.map((m) => m.kind)).toContain('next')
    const r = await call(plansPost, '/api/plans', { token: user.token, body: { brandId, kind: 'next' } })
    expect(r.status).toBe(400)

    const base = {
      brand_id: brandId,
      workspace_id: wsId,
      status: 'active' as const,
      capabilities: { publish: true },
      metadata: {},
      assisted_only: false,
    }
    const { error } = await admin.from('social_accounts').insert([
      {
        ...base,
        platform: 'instagram',
        external_id: `ig-plan-${Date.now()}`,
        name: 'IG',
        account_type: 'instagram_business',
      },
      {
        ...base,
        platform: 'facebook',
        external_id: `fb-plan-${Date.now()}`,
        name: 'FB',
        account_type: 'facebook_page',
      },
    ])
    if (error) throw new Error(error.message)
  })

  it('plan za sledeći mesec: termini odmah, teme iz jednog poziva, 3 tokena', async () => {
    const r = await call<Plan>(plansPost, '/api/plans', {
      token: user.token,
      body: { brandId, kind: 'next', perWeek: 3, formats: ['carousel', 'image', 'text'] },
    })
    expect(r.status).toBe(202)
    expect(r.json.data).toMatchObject({ status: 'planning', items: [] })
    planId = r.json.data!.id
    enqueueReply(await planReply(planId))
    expect(await runPlanning(planId)).toBe('ready')
    const plan = (
      await call<Plan>(planGet, `/api/plans/${planId}`, { token: user.token, params: { id: planId } })
    ).json.data!
    expect(plan.status).toBe('ready')
    expect(plan.items.length).toBeGreaterThanOrEqual(12)
    expect(new Set(plan.items.map((i) => i.format))).toEqual(new Set(['carousel', 'image', 'text']))
    // tekst ide samo na Facebook, slika i karusel na obe mreže
    expect(plan.items.find((i) => i.format === 'text')!.platforms).toEqual(['facebook'])
    expect(plan.items.find((i) => i.format === 'carousel')!.platforms.sort()).toEqual([
      'facebook',
      'instagram',
    ])
    expect(plan.items.every((i) => i.date >= plan.periodStart && i.date <= plan.periodEnd)).toBe(true)
    const { data: row } = await admin.from('month_plans').select('tokens_charged').eq('id', planId).single()
    expect(row!.tokens_charged).toBe(3)
    expect(
      (await call(planGet, `/api/plans/${planId}`, { token: other.token, params: { id: planId } })).status,
    ).toBe(404)
  })

  it('izmena stavke (tema, vrsta, termin) i brisanje označenih; datum van meseca se odbija', async () => {
    const plan = (
      await call<Plan>(planGet, `/api/plans/${planId}`, { token: user.token, params: { id: planId } })
    ).json.data!
    const first = plan.items[0]!
    const edited = await call<Plan>(itemPatch, `/api/plans/${planId}/items/${first.id}`, {
      token: user.token,
      method: 'PATCH',
      params: { id: planId, itemId: first.id },
      body: { topic: 'Moja tema za prvi dan', format: 'text', date: plan.periodStart, time: '09:30' },
    })
    expect(edited.status).toBe(200)
    expect(edited.json.data!.items.find((i) => i.id === first.id)).toMatchObject({
      topic: 'Moja tema za prvi dan',
      format: 'text',
      platforms: ['facebook'],
      time: '09:30',
    })
    const outside = await call(itemPatch, `/api/plans/${planId}/items/${first.id}`, {
      token: user.token,
      method: 'PATCH',
      params: { id: planId, itemId: first.id },
      body: { date: '2020-01-01' },
    })
    expect(outside.status).toBe(400)
    // ostaju četiri objave: dovoljno za proveru, a pravljenje traje kratko
    const drop = plan.items.slice(4).map((i) => i.id)
    const removed = await call<Plan>(itemsDeletePost, `/api/plans/${planId}/items/delete`, {
      token: user.token,
      params: { id: planId },
      body: { ids: drop },
    })
    expect(removed.json.data!.items).toHaveLength(4)
  })

  it('„Generiši sve”: svaka stavka postaje nacrt na odobravanju sa terminom iz plana, jedno obaveštenje', async () => {
    const started = await call<Plan>(generatePost, `/api/plans/${planId}/generate`, {
      token: user.token,
      params: { id: planId },
      body: { mode: 'review' },
    })
    expect(started.status).toBe(202)
    expect(started.json.data!.status).toBe('generating')
    expect(await generateAll(planId)).toEqual({ done: 4, failed: 0 })
    const plan = (
      await call<Plan>(planGet, `/api/plans/${planId}`, { token: user.token, params: { id: planId } })
    ).json.data!
    expect(plan.status).toBe('done')
    expect(plan.counts.done).toBe(4)
    const ids = plan.items.map((i) => i.postId!)
    const { data: posts } = await admin
      .from('posts')
      .select('id, status, scheduled_for, design, post_targets(platform), post_media(id)')
      .in('id', ids)
    expect(posts!.every((p) => p.status === 'in_review')).toBe(true)
    // jedna tema za sve objave (D-125): isti stil, boje i font u svakom dizajniranom nacrtu
    const designed = posts!
      .map((p) => p.design as { styleId?: string; colors?: { background: string }; fonts?: object } | null)
      .filter((d): d is { styleId: string; colors?: { background: string }; fonts?: object } =>
        Boolean(d?.styleId),
      )
    expect(designed.length).toBeGreaterThanOrEqual(2)
    expect(new Set(designed.map((d) => d.styleId)).size).toBe(1)
    expect(new Set(designed.map((d) => JSON.stringify([d.colors, d.fonts]))).size).toBe(1)
    expect(designed.every((d) => d.colors?.background && d.fonts)).toBe(true)
    for (const item of plan.items) {
      const post = posts!.find((p) => p.id === item.postId)!
      expect(Date.parse(post.scheduled_for!)).toBe(Date.parse(item.scheduledFor))
      expect((post.post_targets as Array<{ platform: string }>).map((t) => t.platform).sort()).toEqual(
        [...item.platforms].sort(),
      )
      if (item.format !== 'text') expect((post.post_media as unknown[]).length).toBeGreaterThan(0)
    }
    const { data: notes } = await admin
      .from('notifications')
      .select('title')
      .eq('user_id', user.id)
      .eq('type', 'month_plan_ready')
    expect(notes).toHaveLength(1)
    expect(notes![0]!.title).toContain('4')
    const { data: row } = await admin.from('month_plans').select('tokens_charged').eq('id', planId).single()
    expect(row!.tokens_charged).toBe(3 + 4 * 2)
  })

  it('zakaži odmah: nacrti preskaču odobravanje i dobijaju termin', async () => {
    const r = await call<Plan>(plansPost, '/api/plans', {
      token: user.token,
      body: { brandId, kind: 'next', perWeek: 3, formats: ['image'], platforms: ['instagram'] },
    })
    const second = r.json.data!.id
    enqueueReply(await planReply(second))
    await runPlanning(second)
    const plan = (
      await call<Plan>(planGet, `/api/plans/${second}`, { token: user.token, params: { id: second } })
    ).json.data!
    await call(itemsDeletePost, `/api/plans/${second}/items/delete`, {
      token: user.token,
      params: { id: second },
      body: { ids: plan.items.slice(2).map((i) => i.id) },
    })
    const started = await call(generatePost, `/api/plans/${second}/generate`, {
      token: user.token,
      params: { id: second },
      body: { mode: 'schedule' },
    })
    expect(started.status).toBe(202)
    await generateAll(second)
    const done = (
      await call<Plan>(planGet, `/api/plans/${second}`, { token: user.token, params: { id: second } })
    ).json.data!
    const { data: posts } = await admin
      .from('posts')
      .select('status')
      .in(
        'id',
        done.items.map((i) => i.postId!),
      )
    expect(posts!.map((p) => p.status)).toEqual(['scheduled', 'scheduled'])
    // prethodni plan za isti mesec ostaje jer iz njega već postoje nacrti
    const { data: kept } = await admin.from('month_plans').select('id').eq('id', planId)
    expect(kept).toHaveLength(1)
  })

  it('plan za dva meseca: teme mesec po mesec, drugi mesec zna teme prvog, 3 tokena po mesecu (D-120)', async () => {
    const r = await call<Plan>(plansPost, '/api/plans', {
      token: user.token,
      body: { brandId, kind: 'next', months: 2, perWeek: 3, formats: ['carousel', 'text'] },
    })
    expect(r.status).toBe(202)
    twoMonthPlanId = r.json.data!.id
    const { periodStart, periodEnd } = r.json.data!
    expect(periodStart.slice(8)).toBe('01')
    expect(periodEnd.slice(0, 7)).not.toBe(periodStart.slice(0, 7))
    const replies = await planRepliesByMonth(twoMonthPlanId)
    expect(replies).toHaveLength(2)
    enqueueReply(...replies)
    expect(await runPlanning(twoMonthPlanId)).toBe('ready')
    const plan = (
      await call<Plan>(planGet, `/api/plans/${twoMonthPlanId}`, {
        token: user.token,
        params: { id: twoMonthPlanId },
      })
    ).json.data!
    expect(new Set(plan.items.map((i) => i.date.slice(0, 7)))).toEqual(
      new Set([periodStart.slice(0, 7), periodEnd.slice(0, 7)]),
    )
    const later = calls.filter((c) => JSON.stringify(c.body).includes('TEME VEĆ U OVOM PLANU'))
    expect(later).toHaveLength(1)
    expect(JSON.stringify(later[0]!.body)).toContain(plan.items[0]!.topic)
    const { data: row } = await admin
      .from('month_plans')
      .select('tokens_charged, error, settings')
      .eq('id', twoMonthPlanId)
      .single()
    expect(row).toMatchObject({ tokens_charged: 6, error: null, settings: { months: 2 } })
  })

  it('mesec koji ne uspe ne ruši plan: drugi mesec je spreman, a greška kaže koji mesec fali', async () => {
    const r = await call<Plan>(plansPost, '/api/plans', {
      token: user.token,
      body: { brandId, kind: 'next', months: 2, perWeek: 3, formats: ['text'] },
    })
    const id = r.json.data!.id
    const [first] = await planRepliesByMonth(id)
    enqueueReply(first!, { kind: 'status', status: 400 })
    expect(await runPlanning(id)).toBe('ready')
    const { data: row } = await admin
      .from('month_plans')
      .select('status, error, tokens_charged, period_start, period_end')
      .eq('id', id)
      .single()
    const [y, m] = row!.period_end.split('-').map(Number) as [number, number]
    expect(row!.error).toContain(`${MONTH_NAMES[m - 1]} ${y}.:`)
    expect(row!.tokens_charged).toBe(3)
    const { data: items } = await admin.from('month_plan_items').select('scheduled_for').eq('plan_id', id)
    expect(items!.length).toBeGreaterThan(0)
    // prethodni plan za iste dane bez nacrta je zamenjen novim
    const { data: replaced } = await admin.from('month_plans').select('id').eq('id', twoMonthPlanId)
    expect(replaced).toHaveLength(0)
    expect(
      (
        await call(plansPost, '/api/plans', {
          token: user.token,
          body: { brandId, kind: 'next', months: 4 },
        })
      ).status,
    ).toBe(400)
  })
})

describe('označavanje u listama', () => {
  it('brisanje više objava: nacrt na odobravanju se briše, objavljena ostaje uz poruku; preskakanje otkazuje', async () => {
    const { data: posts } = await admin
      .from('posts')
      .insert([
        { brand_id: brandId, workspace_id: wsId, master_text: 'Prvi', status: 'draft', created_by: user.id },
        { brand_id: brandId, workspace_id: wsId, master_text: 'Drugi', status: 'draft', created_by: user.id },
        {
          brand_id: brandId,
          workspace_id: wsId,
          master_text: 'Objavljen',
          status: 'published',
          created_by: user.id,
        },
      ])
      .select('id, master_text')
    const id = (text: string) => posts!.find((p) => p.master_text === text)!.id
    const r = await call<{ done: string[]; failed: Array<{ id: string; message: string }> }>(
      postsBulkPost,
      '/api/posts/bulk',
      {
        token: user.token,
        body: { ids: [id('Prvi'), id('Objavljen')], action: 'delete' },
      },
    )
    expect(r.json.data!.done).toEqual([id('Prvi')])
    expect(r.json.data!.failed[0]).toMatchObject({ id: id('Objavljen') })
    expect(r.json.data!.failed[0]!.message).toContain('Objavljena')
    const { data: deleted } = await admin.from('posts').select('deleted_at').eq('id', id('Prvi')).single()
    expect(deleted!.deleted_at).not.toBeNull()
    const skip = await call<{ done: string[] }>(postsBulkPost, '/api/posts/bulk', {
      token: user.token,
      body: { ids: [id('Drugi')], action: 'skip' },
    })
    expect(skip.json.data!.done).toEqual([id('Drugi')])
    const { data: skipped } = await admin.from('posts').select('status').eq('id', id('Drugi')).single()
    expect(skipped!.status).toBe('canceled')
    expect(
      (
        await call(postsBulkPost, '/api/posts/bulk', {
          token: other.token,
          body: { ids: [id('Drugi')], action: 'delete' },
        })
      ).json.data,
    ).toMatchObject({ done: [] })
  })

  it('brisanje više fotografija iz galerije; tuđa fotografija se ne dira', async () => {
    const asset = (brand: string, ws: string) => ({
      workspace_id: ws,
      brand_id: brand,
      kind: 'image' as const,
      source: 'upload' as const,
      bucket: 'uploads',
      storage_path: `ws/${ws}/brand/${brand}/uploads/${crypto.randomUUID()}.png`,
      mime_type: 'image/png',
      size_bytes: 10,
    })
    const { data: mine } = await admin
      .from('media_assets')
      .insert([asset(brandId, wsId), asset(brandId, wsId)])
      .select('id')
    const ws2 = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
      token: other.token,
      body: { name: 'Tuđi', type: 'business' },
    })
    const { data: theirs } = await admin
      .from('media_assets')
      .insert(asset(ws2.json.data!.brandId, ws2.json.data!.workspaceId))
      .select('id')
      .single()
    const r = await call<{ done: string[]; failed: Array<{ id: string }> }>(
      galleryDeletePost,
      '/api/gallery/delete',
      {
        token: user.token,
        body: { brandId, ids: [...mine!.map((m) => m.id), theirs!.id] },
      },
    )
    expect(r.json.data!.done.sort()).toEqual(mine!.map((m) => m.id).sort())
    expect(r.json.data!.failed.map((f) => f.id)).toEqual([theirs!.id])
    const { data: still } = await admin
      .from('media_assets')
      .select('deleted_at')
      .eq('id', theirs!.id)
      .single()
    expect(still!.deleted_at).toBeNull()
    await admin.from('workspaces').delete().eq('id', ws2.json.data!.workspaceId)
  })
})
