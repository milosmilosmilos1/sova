import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueMonthPlan: vi.fn(async () => {}),
  enqueueMonthPlanGenerate: vi.fn(async () => {}),
  enqueueTargetScheduled: vi.fn(async () => {}),
  enqueueTargetUnscheduled: vi.fn(async () => {}),
}))

import { POST as generatePost } from '@/app/api/plans/[id]/generate/route'
import { POST as itemsDeletePost } from '@/app/api/plans/[id]/items/delete/route'
import { GET as planGet } from '@/app/api/plans/[id]/route'
import { POST as plansPost } from '@/app/api/plans/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { storedContent } from '@/lib/schemas/brand-content'
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

/**
 * Vrste sadržaja u mesečnom planu (D-165, faza 2): utisak klijenta, osoba iz tima i rad pre i posle
 * idu samo iz podataka biznisa, sa pravim fotografijama i citatom bez izmena; isključena vrsta se
 * ne predlaže, a obrisana stavka ne pravi objavu.
 */
let user: TestUser
let wsId = ''
let brandId = ''
let planId = ''
const photos = { member: '', before: '', after: '' }
const REVIEW_TEXT =
  'Majstori su došli na vreme, završili kupatilo za dve nedelje i ostavili sve čisto. Preporučujem ih svima!'

interface Item {
  id: string
  format: string
  topic: string
  status: string
  postId: string | null
  error: string | null
  kind: string | null
}
interface Plan {
  id: string
  status: string
  items: Item[]
}

async function image(color: string): Promise<string> {
  const id = crypto.randomUUID()
  const path = `ws/${wsId}/brand/${brandId}/uploads/${id}.png`
  const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: color } })
    .png()
    .toBuffer()
  const up = await admin.storage.from('uploads').upload(path, png, { contentType: 'image/png' })
  if (up.error) throw new Error(up.error.message)
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: wsId,
    brand_id: brandId,
    kind: 'image',
    source: 'upload',
    bucket: 'uploads',
    storage_path: path,
    mime_type: 'image/png',
    size_bytes: png.length,
    width: 200,
    height: 200,
  })
  if (error) throw new Error(error.message)
  return id
}

function designedReply(n: number): MockReply {
  return {
    kind: 'text',
    json: {
      slides: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
        kicker: null,
        // naslov prvog slajda nije iz utiska: kod ga mora zameniti pravim citatom
        title: i === 0 ? 'Najbolji majstori u gradu' : i === n - 1 ? 'Zakažite procenu' : `Posle ${i}`,
        body: 'Kratko objašnjenje.',
        stat: null,
        items: null,
      })),
      caption: 'Hvala na poverenju.\n\nZakažite procenu.',
      short_caption: 'Hvala na poverenju.',
      hashtags: ['#adaptacija'],
      first_comment: null,
      visual_query: 'bathroom renovation',
      alt_text: 'Slajdovi.',
    },
  }
}

const getPlan = async () =>
  (await call<Plan>(planGet, `/api/plans/${planId}`, { token: user.token, params: { id: planId } })).json
    .data!

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('plan-kinds')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Vrste u planu', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const granted = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 200,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  if (granted.error) throw new Error(granted.error.message)
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active' as const,
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  }
  const accounts = await admin.from('social_accounts').insert([
    {
      ...base,
      platform: 'instagram',
      external_id: `ig-kinds-${Date.now()}`,
      name: 'IG',
      account_type: 'instagram_business',
    },
    {
      ...base,
      platform: 'facebook',
      external_id: `fb-kinds-${Date.now()}`,
      name: 'FB',
      account_type: 'facebook_page',
    },
  ])
  if (accounts.error) throw new Error(accounts.error.message)
  photos.member = await image('#2f6f5e')
  photos.before = await image('#8a7f72')
  photos.after = await image('#d9e4ea')
  const at = '2026-11-01T10:00:00.000Z'
  const { data } = await admin.from('brands').select('settings').eq('id', brandId).single()
  const settings = await admin
    .from('brands')
    .update({
      settings: {
        ...((data?.settings as object) ?? {}),
        content: {
          kinds: { interactive: true, humor: false },
          testimonials: [
            {
              id: 'aaaaaaaaa1',
              createdAt: at,
              usedAt: null,
              author: 'Marija P.',
              detail: 'vlasnica stana na Vračaru',
              text: REVIEW_TEXT,
              rating: 5,
              source: 'google',
              date: null,
            },
          ],
          team: [
            {
              id: 'bbbbbbbbb1',
              createdAt: at,
              usedAt: null,
              name: 'Nikola',
              role: 'Keramičar',
              bio: 'Postavlja pločice deset godina.',
              funFact: null,
              photoAssetId: photos.member,
            },
          ],
          pairs: [
            {
              id: 'ccccccccc1',
              createdAt: at,
              usedAt: null,
              title: 'Kupatilo, Vračar',
              note: 'Nove pločice i tuš kabina.',
              beforeAssetId: photos.before,
              afterAssetId: photos.after,
            },
          ],
        },
      },
    })
    .eq('id', brandId)
  if (settings.error) throw new Error(settings.error.message)
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
})

describe('vrste sadržaja u mesečnom planu', () => {
  it('termini dobijaju utisak, osobu, pre i posle i pitanje; isključen humor se ne prihvata', async () => {
    const r = await call<Plan>(plansPost, '/api/plans', {
      token: user.token,
      body: { brandId, kind: 'next', perWeek: 3, formats: ['carousel', 'image', 'text'] },
    })
    expect(r.status).toBe(202)
    planId = r.json.data!.id
    const { data } = await admin.from('month_plans').select('settings').eq('id', planId).single()
    const slots = (data!.settings as { slots: unknown[] }).slots
    enqueueReply({
      kind: 'text',
      json: {
        items: slots.map((_, i) => ({
          slot: i,
          topic: `Tema broj ${i + 1} za adaptacije`,
          brief: 'Šta objava kaže i za koga.',
          goal: 'education',
          pillar: 'Edukacija',
          cta: null,
          // humor je isključen: predlog modela se ne prihvata
          kind: 'humor',
        })),
      },
    })
    expect(await runPlanning(planId)).toBe('ready')

    const prompt = calls.map((c) => JSON.stringify(c.body)).find((p) => p.includes('TERMINI'))!
    expect(prompt).toContain('UTISCI KLIJENATA ZA OVAJ MESEC')
    expect(prompt).toContain(REVIEW_TEXT)
    expect(prompt).toContain('VRSTA: utisak klijenta [U1]')
    expect(prompt).toContain('VRSTA: osoba iz tima [T1]')
    expect(prompt).toContain('VRSTA: pre i posle [P1]')
    expect(prompt).toContain('Bez humora i šala.')

    const plan = await getPlan()
    const kinds = plan.items.filter((i) => i.kind)
    expect(kinds.map((i) => i.kind).sort()).toEqual(['before_after', 'interactive', 'review', 'team'])
    expect(plan.items.find((i) => i.kind === 'before_after')!.format).toBe('carousel')

    const { data: stored } = await admin.from('month_plans').select('settings').eq('id', planId).single()
    const refs = (stored!.settings as { slots: Array<{ kind?: string; ref?: string | null }> }).slots
      .filter((s) => s.kind)
      .map((s) => [s.kind, s.ref])
      .sort()
    expect(refs).toEqual([
      ['before_after', 'ccccccccc1'],
      ['interactive', null],
      ['review', 'aaaaaaaaa1'],
      ['team', 'bbbbbbbbb1'],
    ])
    // sledeći plan prvo uzima druge stavke
    const { data: brand } = await admin.from('brands').select('settings').eq('id', brandId).single()
    const content = storedContent(brand!.settings)
    expect(content.testimonials[0]!.usedAt).not.toBeNull()
    expect(content.team[0]!.usedAt).not.toBeNull()
    expect(content.pairs[0]!.usedAt).not.toBeNull()
  })

  it('nacrti: citat bez izmena, prave fotografije osobe i radova, bez fotografija sa strane', async () => {
    const plan = await getPlan()
    // ostaju četiri stavke sa vrstom i jedna obična čiji utisak „nestaje”
    const regular = plan.items.find((i) => !i.kind && i.format !== 'text')!
    const keep = new Set([...plan.items.filter((i) => i.kind).map((i) => i.id), regular.id])
    await call(itemsDeletePost, `/api/plans/${planId}/items/delete`, {
      token: user.token,
      params: { id: planId },
      body: { ids: plan.items.filter((i) => !keep.has(i.id)).map((i) => i.id) },
    })
    // obična stavka dobija utisak koji je u međuvremenu obrisan
    const { data: row } = await admin
      .from('month_plan_items')
      .select('position')
      .eq('id', regular.id)
      .single()
    const { data: stored } = await admin.from('month_plans').select('settings').eq('id', planId).single()
    const settings = stored!.settings as { slots: Array<Record<string, unknown>> }
    settings.slots[row!.position] = { ...settings.slots[row!.position], kind: 'review', ref: 'zzzzzzzzzz' }
    await admin
      .from('month_plans')
      .update({ settings: settings as never })
      .eq('id', planId)

    const started = await call<Plan>(generatePost, `/api/plans/${planId}/generate`, {
      token: user.token,
      params: { id: planId },
      body: { mode: 'review' },
    })
    expect(started.status).toBe(202)
    const formats = new Map(plan.items.map((i) => [i.id, i]))
    for (const itemId of await pendingItems(planId)) {
      const item = formats.get(itemId)!
      // stavka sa obrisanim utiskom staje pre poziva modela, pa ne dobija odgovor
      if (itemId !== regular.id)
        enqueueReply(
          item.format === 'text'
            ? { kind: 'text', json: defaultTextOutput }
            : designedReply(item.kind === 'before_after' ? 3 : item.format === 'carousel' ? 5 : 1),
        )
      await runPlanItem(itemId)
    }
    expect(await finishPlan(planId)).toEqual({ done: 4, failed: 1 })

    const done = await getPlan()
    const failed = done.items.find((i) => i.id === regular.id)!
    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('obrisan u Vrstama objava')

    const byKind = new Map(done.items.filter((i) => i.kind).map((i) => [i.kind!, i]))
    const { data: posts } = await admin
      .from('posts')
      .select('id, master_text, design, post_targets(platform, text_content)')
      .in(
        'id',
        [...byKind.values()].map((i) => i.postId!),
      )
    const post = (kind: string) => posts!.find((p) => p.id === byKind.get(kind)!.postId)!
    type Design = {
      photoSource?: string
      styleId?: string
      copy?: { slides: Array<{ title: string; body?: string }>; photoAssetIds: string[] }
    }

    // utisak: ceo tekst tačno kako je unet, sa imenom; na slajdu doslovan izvod, bez fotografija
    const review = post('review')
    expect(
      review.master_text.startsWith(`„${REVIEW_TEXT}”\n— Marija P., vlasnica stana na Vračaru · ★★★★★`),
    ).toBe(true)
    const reviewDesign = review.design as Design | null
    if (reviewDesign?.copy) {
      expect(reviewDesign.copy.slides[0]!.title).toBe(
        '„Majstori su došli na vreme, završili kupatilo za dve nedelje i ostavili sve čisto. Preporučujem ih svima!”',
      )
      expect(reviewDesign.copy.slides[0]!.body).toBe('— Marija P., vlasnica stana na Vračaru')
      expect(reviewDesign.photoSource).toBe('none')
      expect(reviewDesign.copy.photoAssetIds).toEqual([])
    }

    // osoba iz tima: samo njena fotografija
    const team = post('team').design as Design | null
    if (team?.copy) expect(team.copy.photoAssetIds).toEqual([photos.member])

    // pre i posle: tri slajda, prvo fotografija pre, pa posle
    const pair = post('before_after').design as Design
    expect(pair.copy!.slides).toHaveLength(3)
    expect(pair.copy!.photoAssetIds).toEqual([photos.before, photos.after])
    expect(pair.photoSource).toBe('none')

    // pitanje za publiku: uputstvo po vrsti stiglo je do modela
    const prompts = calls.map((c) => JSON.stringify(c.body))
    expect(prompts.some((p) => p.includes('VRSTA OBJAVE: pitanje za publiku'))).toBe(true)
    expect(prompts.some((p) => p.includes('VRSTA OBJAVE: predstavljanje osobe iz tima'))).toBe(true)
  })
})
