/* eslint-disable no-console -- živi testovi namerno ispisuju odgovore modela za ručni pregled */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// poslove koje u radu pokreće Inngest test poziva direktno
vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueImageJob: vi.fn(async () => {}),
    enqueueBrandAnalysis: vi.fn(async () => {}),
    sendBrandAnalysisCanceled: vi.fn(async () => {}),
    enqueueStrategyJob: vi.fn(async () => {}),
  }
})

import type { ZodType } from 'zod'

import { POST as fromPromptPost } from '@/app/api/ai/image/from-prompt/route'
import { POST as textPost } from '@/app/api/ai/text/route'
import { POST as analyzePost } from '@/app/api/brands/[id]/analyze/route'
import { GET as profileGet } from '@/app/api/brands/[id]/profile/route'
import { POST as strategyGeneratePost } from '@/app/api/strategies/generate/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import { aiProfileOutputSchema, brandProfileJsonSchema } from '@/lib/ai/prompts/brand-profile'
import { insightsJsonSchema, insightsOutputSchema } from '@/lib/ai/prompts/insights'
import { photoStyleJsonSchema, photoStyleOutputSchema } from '@/lib/ai/prompts/photo-style'
import { postTextJsonSchema, postTextOutputSchema } from '@/lib/ai/prompts/post-text'
import { strategyJsonSchema, strategyOutputSchema } from '@/lib/ai/prompts/strategy'
import { rankJsonSchema, rankOutputSchema } from '@/lib/ai/prompts/unsplash-rank'
import { runImageGeneration } from '@/services/ai/image'
import { runAnalysisPipeline } from '@/services/brand-brain/pipeline'
import { runStrategyGeneration } from '@/services/strategy/strategy'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from '../integration/helpers'

/**
 * Živi testovi sa pravim Gemini-jem (npm run test:live): pravi API mora da prihvati svaku JSON šemu
 * koju Sova šalje, a odgovor mora da prođe Zod šemu. Mock to ne može da proveri.
 */
const SCHEMAS: Array<[string, () => Record<string, unknown>, ZodType]> = [
  ['tekst objave', postTextJsonSchema, postTextOutputSchema],
  ['profil brenda', brandProfileJsonSchema, aiProfileOutputSchema],
  ['stil fotografija', photoStyleJsonSchema, photoStyleOutputSchema],
  ['strategija', strategyJsonSchema, strategyOutputSchema],
  ['uvidi', insightsJsonSchema, insightsOutputSchema],
  ['rangiranje fotografija', rankJsonSchema, rankOutputSchema],
]

const CYRILLIC = /[Ѐ-ӿ]/

let user: TestUser
let wsId = ''
let brandId = ''

function nextMonday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  user = await createTestUser('live-ai')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Živi AI test', type: 'business', websiteUrl: 'tangerineseo.rs' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterAll(async () => {
  await deleteTestUser(user)
})

describe('Gemini prihvata svaku JSON šemu izlaza i odgovor prolazi Zod', () => {
  // isti lanac kao u aplikaciji: 503 „high demand” ide na ponovni pokušaj i fallback, a 400 (šema
  // odbijena) pada odmah
  it.each(SCHEMAS)('%s', async (name, jsonSchema, zodSchema) => {
    const { result: r } = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: 'Popunjavaš JSON strukturu realističnim primerom. Piši na srpskom jeziku, latinicom.',
          prompt:
            'Primer za firmu „Klima servis Beograd”: servis, čišćenje i ugradnja klima uređaja, dolazak na adresu.',
          jsonSchema: jsonSchema(),
          maxOutputTokens: 16_384,
          timeoutMs: 120_000,
        }),
      { label: `live-${name}` },
    )
    const parsed = zodSchema.safeParse(r.json)
    if (!parsed.success) console.log(name, JSON.stringify(parsed.error.issues.slice(0, 8), null, 2))
    console.log(`${name}: ${r.model}, ${r.durationMs} ms, ${JSON.stringify(r.usage)}`)
    expect(parsed.success).toBe(true)
  })
})

describe('Pravi tokovi sa Gemini-jem', () => {
  it('Studio: tekst za tri mreže, latinicom, 2 tokena', async () => {
    const r = await call<{
      tokensCharged: number
      model: string
      output: {
        variants: Array<{ platform: string; hook: string; body: string; cta: string; hashtags: string[] }>
      }
    }>(textPost, '/api/ai/text', {
      token: user.token,
      body: {
        brandId,
        platforms: ['instagram', 'facebook', 'linkedin'],
        topic: 'Popust 20 % na servis klime do kraja meseca, dolazak na adresu u Beogradu',
        goal: 'sales',
      },
      headers: { 'idempotency-key': crypto.randomUUID() },
    })
    if (r.status !== 200) console.log(JSON.stringify(r.json.error))
    expect(r.status).toBe(200)
    const out = r.json.data!
    console.log(`studio: ${out.model}`, JSON.stringify(out.output.variants, null, 2))
    expect(out.tokensCharged).toBe(2)
    expect(out.output.variants.map((v) => v.platform).sort()).toEqual(['facebook', 'instagram', 'linkedin'])
    // od oktobra do januara tekst ne sme da priča o vrućinama (upit nosi datum objave)
    const coldMonths = [9, 10, 11, 0].includes(new Date().getMonth())
    for (const v of out.output.variants) {
      const text = `${v.hook}\n${v.body}\n${v.cta}`
      expect(text.length).toBeGreaterThan(60)
      expect(CYRILLIC.test(text)).toBe(false)
      if (coldMonths) expect(text).not.toMatch(/vrućin/i)
    }
  })

  it('slika iz opisa: generacija uspe i fajl je u skladištu', async () => {
    const r = await call<{ generationId: string }>(fromPromptPost, '/api/ai/image/from-prompt', {
      token: user.token,
      body: { brandId, prompt: 'Čista klima u svetlom dnevnom boravku, prirodno svetlo', aspectRatio: '4:5' },
      headers: { 'idempotency-key': crypto.randomUUID() },
    })
    expect(r.status).toBe(202)
    const id = r.json.data!.generationId
    expect((await runImageGeneration(id)).status).toBe('succeeded')
    const { data: gen } = await admin
      .from('ai_generations')
      .select('model, status, duration_ms, cost_usd, output_asset_id')
      .eq('id', id)
      .single()
    console.log('slika:', JSON.stringify(gen))
    expect(gen!.status).toBe('succeeded')
    expect(gen!.output_asset_id).toBeTruthy()
  })

  it('Brand Brain nad pravim sajtom: crawl, AI profil, znanje za RAG', async () => {
    const start = await call<{ crawlId: string }>(analyzePost, `/api/brands/${brandId}/analyze`, {
      token: user.token,
      params: { id: brandId },
      body: {},
      headers: { 'idempotency-key': crypto.randomUUID() },
    })
    expect(start.status).toBe(202)
    const crawlId = start.json.data!.crawlId
    const { data: crawl } = await admin
      .from('website_crawls')
      .select('ai_generation_id, created_by')
      .eq('id', crawlId)
      .single()
    const result = await runAnalysisPipeline(
      {
        brandId,
        crawlId,
        workspaceId: wsId,
        requestedBy: crawl!.created_by,
        generationId: crawl!.ai_generation_id,
      },
      async (_name, fn) => fn(),
    )
    expect(result.status).toBe('succeeded')
    const p = await call<{
      knowledgeChunks: number
      profile: {
        meta: { generated_by: string }
        identity: { name: { value: string }; description: { value: string } }
        offer: { services: { value: unknown[] } }
      }
    }>(profileGet, `/api/brands/${brandId}/profile`, { token: user.token, params: { id: brandId } })
    const profile = p.json.data!.profile
    console.log('profil:', JSON.stringify(profile).slice(0, 1500))
    expect(profile.meta.generated_by).toBe('ai')
    expect(profile.identity.name.value).toBeTruthy()
    expect(profile.offer.services.value.length).toBeGreaterThan(0)
    expect(p.json.data!.knowledgeChunks).toBeGreaterThan(0)
  })

  it('strategija za 4 nedelje: sažetak, stubovi i teme', async () => {
    const { error } = await admin.from('social_accounts').insert([
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: 'live-page-1',
        name: 'Strana',
        account_type: 'facebook_page',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: true,
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: 'live-ig-1',
        external_parent_id: 'live-page-1',
        name: 'IG',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        assisted_only: true,
      },
    ])
    if (error) throw new Error(error.message)
    const r = await call<{ generationId: string }>(strategyGeneratePost, '/api/strategies/generate', {
      token: user.token,
      body: { brandId, periodStart: nextMonday(), weeks: 4, goals: ['Više upita za servis'] },
      headers: { 'idempotency-key': crypto.randomUUID() },
    })
    if (r.status !== 202) console.log(JSON.stringify(r.json.error))
    expect(r.status).toBe(202)
    const run = await runStrategyGeneration(r.json.data!.generationId)
    expect(run.status).toBe('succeeded')
    const { data: s } = await admin
      .from('strategies')
      .select('summary, weekly_themes, network_mix')
      .eq('id', run.strategyId!)
      .single()
    console.log('strategija:', JSON.stringify(s).slice(0, 1500))
    expect(s!.summary).toBeTruthy()
    expect((s!.weekly_themes as unknown[]).length).toBeGreaterThanOrEqual(4)
  })
})
