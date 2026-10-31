import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as regeneratePost } from '@/app/api/approvals/[id]/regenerate/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import type { StepRunner } from '@/services/autopilot/runner'
import { interruptPlan, pendingItems, runPlanItem } from '@/services/plans/runner'
import { pickUnsplashPhotos } from '@/services/visuals/unsplash'

import { enqueueReply, geminiServer, resetGeminiMock, type MockReply } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import {
  pexelsHandlers,
  resetVisualsState,
  unsplashHandlers,
  unsplashPhoto,
  visualsState,
} from './visuals-mock'

/**
 * Plan u koracima (D-122): Netlify prekida svaki zahtev posle 30 sekundi, pa karusel sa fotografijom
 * na svakom slajdu ide kroz korake (tekst, fotografije, slajdovi po tri, nacrt). Koraci se ovde
 * izvršavaju kao u Inngest-u: rezultat svakog prolazi kroz JSON, kao kad ga Inngest zapamti.
 */
let user: TestUser
let wsId = ''
let brandId = ''
let firstPostId = ''

function carouselReply(n: number): MockReply {
  return {
    kind: 'text',
    json: {
      slides: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
        kicker: null,
        title: i === 0 ? 'Noć u Beogradu' : i === n - 1 ? 'Rezervišite sto' : `Razlog ${i}`,
        body: 'Kratko objašnjenje.',
        stat: null,
        items: null,
      })),
      caption: 'Vikend je blizu.\n\nRezervišite na vreme.',
      short_caption: 'Vikend je blizu.',
      hashtags: ['#beograd'],
      first_comment: null,
      visual_query: 'night club',
      alt_text: 'Slajdovi.',
    },
  }
}

/** Koraci kao u Inngest-u: ime se beleži, a rezultat prolazi kroz JSON. */
function recorder(fail?: string): { names: string[]; run: StepRunner } {
  const names: string[] = []
  const run = (async (name: string, fn: () => Promise<unknown>) => {
    names.push(name)
    if (name === fail) throw new Error('Netlify je prekinuo korak')
    return JSON.parse(JSON.stringify((await fn()) ?? null))
  }) as StepRunner
  return { names, run }
}

/** Plan u pravljenju sa stavkama u sledećem mesecu, izgled iz dizajna brenda (stil „Magazin”). */
async function newPlan(
  items: Array<{ format: string; status?: string }>,
): Promise<{ planId: string; ids: string[] }> {
  const now = new Date()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0))
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const { data: plan, error } = await admin
    .from('month_plans')
    .insert({
      workspace_id: wsId,
      brand_id: brandId,
      month: day(month),
      period_start: day(month),
      period_end: day(last),
      status: 'generating',
      created_by: user.id,
      settings: {
        kind: 'next',
        look: 'brand',
        perWeek: 3,
        platforms: ['instagram', 'facebook'],
        formats: ['carousel'],
        locale: 'sr-Latn',
        notes: null,
        mode: 'review',
      },
    })
    .select('id')
    .single()
  if (error || !plan) throw new Error(error?.message)
  const { data: rows, error: itemsError } = await admin
    .from('month_plan_items')
    .insert(
      items.map((it, i) => ({
        plan_id: plan.id,
        brand_id: brandId,
        position: i,
        scheduled_for: new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 10 + i, 17),
        ).toISOString(),
        format: it.format,
        platforms: ['instagram', 'facebook'],
        topic: `Tema ${i + 1}: vikend paketi`,
        status: it.status ?? 'planned',
      })),
    )
    .select('id, position')
  if (itemsError || !rows) throw new Error(itemsError?.message)
  return { planId: plan.id, ids: rows.sort((a, b) => a.position - b.position).map((r) => r.id) }
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('plan-steps')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Plan u koracima', type: 'business' },
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
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active' as const,
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  }
  const { error: accountsError } = await admin.from('social_accounts').insert([
    {
      ...base,
      platform: 'instagram',
      external_id: `ig-steps-${Date.now()}`,
      name: 'IG',
      account_type: 'instagram_business',
    },
    {
      ...base,
      platform: 'facebook',
      external_id: `fb-steps-${Date.now()}`,
      name: 'FB',
      account_type: 'facebook_page',
    },
  ])
  if (accountsError) throw new Error(accountsError.message)
  // stil sa fotografijom na svakom slajdu: baš ono što na Netlify-u nije stalo u jedan zahtev
  await admin
    .from('brands')
    .update({ design: { styleId: 'magazine', photoSource: 'stock', slides: 5 } })
    .eq('id', brandId)
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  resetVisualsState()
  resetUnsplashCacheForTests()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('Unsplash limit (D-122)', () => {
  it('uzima samo onoliko fotografija koliko limit još prima; sa potrošenim limitom ne pita Unsplash', async () => {
    // jedna pretraga sa zadatim ostatkom limita; posle nje važi običan lažni Unsplash
    const searchWithRemaining = (remaining: string) =>
      http.get(
        'https://api.unsplash.com/search/photos',
        () => {
          visualsState.unsplashSearches++
          return HttpResponse.json(
            { total: 4, total_pages: 1, results: ['a1', 'b2', 'c3', 'd4'].map((id) => unsplashPhoto(id)) },
            { headers: { 'x-ratelimit-remaining': remaining } },
          )
        },
        { once: true },
      )
    const ctx = { workspaceId: wsId, brandId, uploadedBy: null, crop: 'square' as const }
    geminiServer.use(searchWithRemaining('2'))
    const two = await pickUnsplashPhotos({ ...ctx, query: 'night club', count: 4 })
    expect(two).toHaveLength(2)
    expect(visualsState.unsplashDownloads).toHaveLength(2)

    resetUnsplashCacheForTests()
    geminiServer.use(searchWithRemaining('1'))
    // upit od jedne reči: jedna pretraga, bez kraćih oblika upita
    expect(await pickUnsplashPhotos({ ...ctx, query: 'club', count: 4 })).toHaveLength(1)
    const searches = visualsState.unsplashSearches
    // ostao je jedan zahtev: ni pretraga ni preuzimanje ne staju, izbor odmah ide dalje (na Pexels)
    expect(await pickUnsplashPhotos({ ...ctx, query: 'night club bar', count: 4 })).toEqual([])
    expect(visualsState.unsplashSearches).toBe(searches)
  })
})

describe('plan u koracima (D-122)', () => {
  it('karusel sa fotografijom na svakom slajdu: tekst, fotografije, slajdovi po tri, nacrt', async () => {
    const { ids } = await newPlan([{ format: 'carousel' }])
    enqueueReply(carouselReply(5))
    const rec = recorder()
    expect(await runPlanItem(ids[0]!, rec.run)).toBe('done')
    expect(rec.names).toEqual(['start', 'photos', 'slides-0', 'slides-3', 'save'])

    const { data: item } = await admin
      .from('month_plan_items')
      .select('status, post_id')
      .eq('id', ids[0]!)
      .single()
    expect(item!.status).toBe('done')
    firstPostId = item!.post_id!
    const { data: post } = await admin
      .from('posts')
      .select('status, design, post_media(sort_order, media_asset_id)')
      .eq('id', firstPostId)
      .single()
    expect(post!.status).toBe('in_review')
    const design = post!.design as { styleId: string; copy: { photoAssetIds: string[] } }
    expect(design.styleId).toBe('magazine')
    expect(new Set(design.copy.photoAssetIds).size).toBe(5)
    const media = (post!.post_media as Array<{ sort_order: number; media_asset_id: string }>).sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    expect(media).toHaveLength(5)
    const { data: slides } = await admin
      .from('media_assets')
      .select('id, source_data')
      .in(
        'id',
        media.map((m) => m.media_asset_id),
      )
    const byId = new Map(
      (slides ?? []).map((s) => [s.id, s.source_data as { index: number; photoAssetId: string }]),
    )
    // slajdovi su redom, a svaki ima svoju fotografiju iz koraka „fotografije”
    expect(media.map((m) => byId.get(m.media_asset_id)!.index)).toEqual([0, 1, 2, 3, 4])
    expect(media.map((m) => byId.get(m.media_asset_id)!.photoAssetId)).toEqual(design.copy.photoAssetIds)
  })

  it('korak koji ne uspe ostavlja stavku u neuspelima bez ostataka, a sledeća se pravi normalno', async () => {
    const { ids } = await newPlan([{ format: 'carousel' }, { format: 'carousel' }])
    enqueueReply(carouselReply(5))
    const failing = recorder('slides-3')
    expect(await runPlanItem(ids[0]!, failing.run)).toBe('failed')
    expect(failing.names).toEqual(['start', 'photos', 'slides-0', 'slides-3', 'failed'])
    const { data: failed } = await admin
      .from('month_plan_items')
      .select('status, post_id, error')
      .eq('id', ids[0]!)
      .single()
    expect(failed).toMatchObject({ status: 'failed', post_id: null })
    expect(failed!.error).toContain('Slajdovi nisu napravljeni')
    // prva tri slajda su bila sačuvana pre pada: ne ostaju u biblioteci
    const { data: leftovers } = await admin
      .from('media_assets')
      .select('id, deleted_at')
      .eq('source', 'template')
      .eq('source_data->>itemId', ids[0]!)
    expect(leftovers).toHaveLength(3)
    expect(leftovers!.every((a) => a.deleted_at)).toBe(true)

    enqueueReply(carouselReply(5))
    expect(await runPlanItem(ids[1]!, recorder().run)).toBe('done')
  })

  it('pad posla usred stavke: stavka ide u neuspele, a nastavak uzima samo neurađene', async () => {
    const { planId, ids } = await newPlan([
      { format: 'carousel', status: 'generating' },
      { format: 'image' },
      { format: 'carousel', status: 'failed' },
    ])
    expect(await interruptPlan(planId)).toBe(1)
    const { data: stuck } = await admin
      .from('month_plan_items')
      .select('status, error')
      .eq('id', ids[0]!)
      .single()
    expect(stuck!.status).toBe('failed')
    expect(stuck!.error).toContain('predugo')
    expect(await pendingItems(planId, { onlyPlanned: true })).toEqual([ids[1]])
    expect(await pendingItems(planId)).toEqual(ids)
    // plan koji više nije u pravljenju se ne nastavlja
    await admin.from('month_plans').update({ status: 'ready' }).eq('id', planId)
    expect(await interruptPlan(planId)).toBe(0)
  })

  it('„Generiši ponovo” piše nov tekst i crta nove slajdove sa istim fotografijama', async () => {
    const { data: before } = await admin
      .from('posts')
      .select('version, design')
      .eq('id', firstPostId)
      .single()
    const oldPhotos = (before!.design as { copy: { photoAssetIds: string[] } }).copy.photoAssetIds
    enqueueReply(carouselReply(5))
    const r = await call<{ media: Array<{ mediaAssetId: string }> }>(
      regeneratePost,
      `/api/approvals/${firstPostId}/regenerate`,
      { token: user.token, params: { id: firstPostId }, body: { version: before!.version } },
    )
    expect(r.status).toBe(200)
    expect(r.json.data!.media).toHaveLength(5)
    // bez novog izbora: ni pretrage ni preuzimanja sa Unsplash-a
    expect(visualsState.unsplashSearches).toBe(0)
    expect(visualsState.unsplashDownloads).toEqual([])
    const { data: after } = await admin.from('posts').select('design').eq('id', firstPostId).single()
    expect((after!.design as { copy: { photoAssetIds: string[] } }).copy.photoAssetIds).toEqual(oldPhotos)
    const { data: slides } = await admin
      .from('media_assets')
      .select('source_data')
      .in(
        'id',
        r.json.data!.media.map((m) => m.mediaAssetId),
      )
    expect(
      new Set((slides ?? []).map((s) => (s.source_data as { photoAssetId: string }).photoAssetId)),
    ).toEqual(new Set(oldPhotos))
  })
})
