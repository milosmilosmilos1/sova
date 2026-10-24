import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return {
    ...mod,
    enqueueBrandAnalysis: vi.fn(async () => {}),
    sendBrandAnalysisCanceled: vi.fn(async () => {}),
  }
})

import { GET as analysisGet, DELETE as analysisDelete } from '@/app/api/brands/[id]/analysis/[crawlId]/route'
import { POST as analyzePost } from '@/app/api/brands/[id]/analyze/route'
import { POST as restorePost } from '@/app/api/brands/[id]/profile/restore/route'
import { GET as profileGet, PATCH as profilePatch } from '@/app/api/brands/[id]/profile/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import type { BrandProfile } from '@/lib/brand/profile-schema'
import { setCrawlDepsForTests } from '@/lib/crawler/deps'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { safeFetch } from '@/lib/ssrf'
import { runAnalysisPipeline } from '@/services/brand-brain/pipeline'
import { runSiteCheck } from '@/services/brand-brain/site-check'

import {
  BLOCKED_ORIGIN,
  embedHandler,
  FIXTURE_ORIGIN,
  fixtureHandlers,
  fixtureState,
  photoStyleReply,
  profileReply,
} from './fixture-site'
import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let user: TestUser
let wsId = ''
let brandId = ''

interface ProfileView {
  exists: boolean
  version: number | null
  lockedFields: string[]
  profile: BrandProfile
  versions: Array<{ version: number; isCurrent: boolean; generatedBy: string }>
  knowledgeChunks: number
  logoUrl: string | null
}
interface CrawlView {
  id: string
  status: string
  pagesFound: number
  pagesFetched: number
  errorCode: string | null
  errorMessage: string | null
  profileVersion: number | null
  progress: { summary?: { notes?: string[]; generatedBy?: string } } | null
  pages: Array<{ url: string; type: string }>
}

async function balance(): Promise<number> {
  const r = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
    token: user.token,
    query: { workspaceId: wsId },
  })
  return r.json.data!.balance.available
}

async function startAnalysis(body: Record<string, unknown> = {}, key = crypto.randomUUID()) {
  return call<{ crawlId: string; generationId: string; tokensCharged: number; firstAnalysis: boolean }>(
    analyzePost,
    `/api/brands/${brandId}/analyze`,
    {
      token: user.token,
      params: { id: brandId },
      body,
      headers: { 'idempotency-key': key },
    },
  )
}

async function runPipeline(crawlId: string) {
  const { data: crawl } = await admin
    .from('website_crawls')
    .select('ai_generation_id, created_by')
    .eq('id', crawlId)
    .single()
  return runAnalysisPipeline(
    {
      brandId,
      crawlId,
      workspaceId: wsId,
      requestedBy: crawl!.created_by,
      generationId: crawl!.ai_generation_id,
    },
    async (_name, fn) => fn(),
  )
}

async function crawlView(crawlId: string): Promise<CrawlView> {
  const r = await call<CrawlView>(analysisGet, `/api/brands/${brandId}/analysis/${crawlId}`, {
    token: user.token,
    params: { id: brandId, crawlId },
  })
  return r.json.data!
}

async function profileView(): Promise<ProfileView> {
  const r = await call<ProfileView>(profileGet, `/api/brands/${brandId}/profile`, {
    token: user.token,
    params: { id: brandId },
  })
  return r.json.data!
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(embedHandler, ...fixtureHandlers)
  setCrawlDepsForTests({
    fetch: (input, options) =>
      safeFetch(input, { ...options, resolve: async () => ['93.184.216.34'], fetchImpl: fetch }),
    now: Date.now,
  })
  user = await createTestUser('bb')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Brand Brain test', type: 'business', websiteUrl: 'fixture-site.test' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
})

afterAll(async () => {
  setCrawlDepsForTests(null)
  geminiServer.close()
  await deleteTestUser(user)
})

describe('Brand Brain', () => {
  it('bez Idempotency-Key vraća 400; profil pre analize ne postoji', async () => {
    const r = await call(analyzePost, `/api/brands/${brandId}/analyze`, {
      token: user.token,
      params: { id: brandId },
      body: {},
    })
    expect(r.status).toBe(400)
    const p = await profileView()
    expect(p.exists).toBe(false)
    expect(p.profile.identity.name.value).toBe('Brand Brain test')
  })

  it('prva analiza je besplatna: 202, isti ključ ponavlja odgovor, pipeline pravi profil, logo, znanje', async () => {
    expect(await balance()).toBe(50)
    const key = crypto.randomUUID()
    const first = await startAnalysis({}, key)
    expect(first.status).toBe(202)
    expect(first.json.data).toMatchObject({ tokensCharged: 0, firstAnalysis: true })
    const replay = await startAnalysis({}, key)
    expect(replay.json.data!.crawlId).toBe(first.json.data!.crawlId)
    const crawlId = first.json.data!.crawlId
    expect((await crawlView(crawlId)).status).toBe('queued')

    // druga analiza dok prva traje → 409
    const conflict = await startAnalysis({})
    expect(conflict.status).toBe(409)

    enqueueReply({ kind: 'text', json: photoStyleReply }, { kind: 'text', json: profileReply() })
    const result = await runPipeline(crawlId)
    expect(result.status).toBe('succeeded')

    const view = await crawlView(crawlId)
    expect(view.status).toBe('succeeded')
    expect(view.pagesFetched).toBeGreaterThanOrEqual(7)
    expect(view.pages.some((p) => p.url.includes('politika-privatnosti'))).toBe(false) // robots Disallow
    expect(view.pages.map((p) => p.type)).toEqual(
      expect.arrayContaining(['home', 'services', 'about', 'pricing', 'contact', 'blog_post']),
    )
    expect(view.profileVersion).toBe(1)
    expect(calls.map((c) => c.model).length).toBe(2)

    const p = await profileView()
    expect(p.exists).toBe(true)
    expect(p.version).toBe(1)
    expect(p.profile.meta.generated_by).toBe('ai')
    expect(p.profile.identity.name.value).toBe('Fixture Studio')
    expect(p.profile.offer.services.value).toHaveLength(4)
    expect(p.profile.voice.forbidden_words.value).toContain('najjeftinije')
    expect(p.profile.social.value).toMatchObject({
      facebook: 'https://www.facebook.com/fixturestudio',
      linkedin: 'https://www.linkedin.com/company/fixture-studio',
    })
    expect(p.profile.contact.email.value).toBe('info@fixture-site.test')
    expect(p.profile.visual.colors.value.primary).toBe('#ff6600')
    expect(p.profile.visual.fonts.value.body).toBe('Poppins')
    expect(p.profile.visual.fonts.value.headings).toBe('Playfair Display')
    expect(p.profile.visual.photo_style.value?.has_people).toBe(true)
    expect(p.profile.visual.logo.value.asset_id).toBeTruthy()
    expect(p.logoUrl).toMatch(/^http/)
    expect(p.profile.content.has_blog.value).toBe(true)
    expect(p.profile.content.recent_posts.value.length).toBeGreaterThanOrEqual(2)
    expect(p.knowledgeChunks).toBeGreaterThan(0)
    expect(await balance()).toBe(50)

    const { data: brand } = await admin
      .from('brands')
      .select('logo_asset_id, sitemap_hash, feed_hash, website_url')
      .eq('id', brandId)
      .single()
    expect(brand!.logo_asset_id).toBe(p.profile.visual.logo.value.asset_id)
    expect(brand!.sitemap_hash).toBeTruthy()
    expect(brand!.website_url).toBe(`${FIXTURE_ORIGIN}/`)
  })

  it('ručna izmena pravi novu verziju i zaključava polja; neispravna vrednost daje 400', async () => {
    const bad = await call(profilePatch, `/api/brands/${brandId}/profile`, {
      method: 'PATCH',
      token: user.token,
      params: { id: brandId },
      body: { changes: [{ path: 'voice.address', value: 'mi' }] },
    })
    expect(bad.status).toBe(400)
    expect(bad.json.error?.fields?.['voice.address']).toBeTruthy()
    const sys = await call(profilePatch, `/api/brands/${brandId}/profile`, {
      method: 'PATCH',
      token: user.token,
      params: { id: brandId },
      body: {
        changes: [{ path: 'visual.logo', value: { asset_id: null, source_url: null, mime_type: null } }],
      },
    })
    expect(sys.status).toBe(400)

    const ok = await call<ProfileView>(profilePatch, `/api/brands/${brandId}/profile`, {
      method: 'PATCH',
      token: user.token,
      params: { id: brandId },
      body: {
        changes: [
          { path: 'identity.description', value: 'Ručno napisan opis koji analiza ne sme da pregazi.' },
          { path: 'voice.address', value: 'ti' },
        ],
      },
    })
    expect(ok.status).toBe(200)
    expect(ok.json.data!.version).toBe(2)
    expect(ok.json.data!.lockedFields).toEqual(['identity.description', 'voice.address'])
    expect(ok.json.data!.profile.identity.description.confidence).toBe(1)
    expect(ok.json.data!.profile.meta.generated_by).toBe('manual')
    expect(ok.json.data!.versions.map((v) => v.isCurrent)).toEqual([true, false])
  })

  it('druga analiza košta tokene i čuva zaključana polja', async () => {
    fixtureState.orgName = 'Fixture Studio Promenjeno'
    const r = await startAnalysis({})
    expect(r.status).toBe(202)
    expect(r.json.data).toMatchObject({ tokensCharged: 10, firstAnalysis: false })
    expect(await balance()).toBe(40) // rezervisano
    enqueueReply(
      { kind: 'text', json: photoStyleReply },
      {
        kind: 'text',
        json: profileReply({ name: 'Fixture Studio Promenjeno', description: 'AI pokušava nov opis.' }),
      },
    )
    const result = await runPipeline(r.json.data!.crawlId)
    expect(result.status).toBe('succeeded')
    const p = await profileView()
    expect(p.version).toBe(3)
    expect(p.profile.identity.name.value).toBe('Fixture Studio Promenjeno')
    expect(p.profile.identity.description.value).toBe('Ručno napisan opis koji analiza ne sme da pregazi.')
    expect(p.profile.voice.address.value).toBe('ti')
    expect(p.lockedFields).toEqual(['identity.description', 'voice.address'])
    expect(await balance()).toBe(40)
    const { data: gen } = await admin
      .from('ai_generations')
      .select('status, tokens_charged, cost_usd, type')
      .eq('id', r.json.data!.generationId)
      .single()
    expect(gen).toMatchObject({ status: 'succeeded', tokens_charged: 10, type: 'brand_profile' })
    expect(Number(gen!.cost_usd)).toBeGreaterThan(0)
  })

  it('vraćanje starije verzije pravi novu verziju sa starim sadržajem', async () => {
    const r = await call<ProfileView>(restorePost, `/api/brands/${brandId}/profile/restore`, {
      token: user.token,
      params: { id: brandId },
      body: { version: 1 },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.version).toBe(4)
    expect(r.json.data!.profile.identity.name.value).toBe('Fixture Studio')
    const again = await call(restorePost, `/api/brands/${brandId}/profile/restore`, {
      token: user.token,
      params: { id: brandId },
      body: { version: 4 },
    })
    expect(again.status).toBe(409)
  })

  it('otkazivanje vraća tokene, a pipeline posle toga ne radi ništa', async () => {
    const r = await startAnalysis({})
    expect(r.status).toBe(202)
    expect(await balance()).toBe(30)
    const cancel = await call<CrawlView>(
      analysisDelete,
      `/api/brands/${brandId}/analysis/${r.json.data!.crawlId}`,
      {
        method: 'DELETE',
        token: user.token,
        params: { id: brandId, crawlId: r.json.data!.crawlId },
      },
    )
    expect(cancel.status).toBe(200)
    expect(cancel.json.data!.status).toBe('canceled')
    expect(await balance()).toBe(40)
    expect((await runPipeline(r.json.data!.crawlId)).status).toBe('skipped')
    expect(calls).toHaveLength(0)
  })

  it('sajt koji robots.txt zabranjuje → failed sa jasnom porukom, tokeni vraćeni', async () => {
    const r = await startAnalysis({ websiteUrl: BLOCKED_ORIGIN })
    expect(r.status).toBe(202)
    expect(await balance()).toBe(30)
    expect((await runPipeline(r.json.data!.crawlId)).status).toBe('failed')
    const view = await crawlView(r.json.data!.crawlId)
    expect(view.status).toBe('failed')
    expect(view.errorCode).toBe('ROBOTS_BLOCKED')
    expect(view.errorMessage).toMatch(/robots\.txt/)
    expect(await balance()).toBe(40)
    expect(calls).toHaveLength(0)
    // vraćamo sajt na fixture da ostali testovi rade
    await admin
      .from('brands')
      .update({ website_url: `${FIXTURE_ORIGIN}/` })
      .eq('id', brandId)
  })

  it('bez AI ključa profil je heuristički, besplatan i označen kao partial', async () => {
    const saved = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    const { env } = await import('@/lib/env')
    const savedEnv = env.GEMINI_API_KEY
    ;(env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined
    try {
      const r = await startAnalysis({})
      expect(r.status).toBe(202)
      expect((await runPipeline(r.json.data!.crawlId)).status).toBe('partial')
      const view = await crawlView(r.json.data!.crawlId)
      expect(view.progress?.summary?.generatedBy).toBe('heuristic')
      expect(view.progress?.summary?.notes?.join(' ')).toMatch(/ključ/)
      const p = await profileView()
      expect(p.profile.meta.generated_by).toBe('heuristic')
      expect(p.profile.identity.name.value).toBe('Fixture Studio Promenjeno') // iz JSON-LD
      // vraćena v1 nema zaključana polja, pa opis dolazi iz heuristike (meta opis)
      expect(p.profile.identity.description.value).toContain('agencija za SEO')
      expect(p.lockedFields).toEqual([])
      expect(await balance()).toBe(40) // nije naplaćeno
      expect(calls).toHaveLength(0)
    } finally {
      process.env.GEMINI_API_KEY = saved
      ;(env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = savedEnv
    }
  })

  it('nedeljna provera pronalazi novu objavu i pravi predlog', async () => {
    fixtureState.extraPosts.push({ slug: 'nov-tekst-o-reels', title: 'Nov tekst o Reels formatu' })
    const r = await runSiteCheck(brandId)
    expect(r.checked).toBe(true)
    expect(r.newPosts).toBeGreaterThanOrEqual(1)
    const { data: sugg } = await admin
      .from('suggestions')
      .select('kind, title, payload, source')
      .eq('brand_id', brandId)
    expect(
      sugg!.some(
        (s) => s.kind === 'new_blog_post' && (s.payload as { url: string }).url.includes('nov-tekst-o-reels'),
      ),
    ).toBe(true)
    const { data: checks } = await admin.from('brand_site_checks').select('new_urls').eq('brand_id', brandId)
    expect(checks!.length).toBeGreaterThanOrEqual(1)
    // ponovljena provera ne duplira predlog
    const again = await runSiteCheck(brandId)
    expect(again.newUrls).toBe(0)
    const { count } = await admin
      .from('suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('kind', 'new_blog_post')
    expect(count).toBe(1)
  })
})
