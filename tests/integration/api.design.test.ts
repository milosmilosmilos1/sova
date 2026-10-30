import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as composePost } from '@/app/api/ai/compose/route'
import { GET as designGet, PATCH as designPatch } from '@/app/api/brands/[id]/design/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { GET as previewGet } from '@/app/api/visuals/preview/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetPexelsCacheForTests } from '@/integrations/pexels/client'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { clearPreviewCacheForTests } from '@/services/design/preview'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/** Stilovi objava i dizajn brenda (D-108). */
let user: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

interface DesignView {
  styleId: string
  size: string
  photoSource: string
  slides: number
  colors: { primary: string; secondary: string; background: string; text: string; muted: string }
  handle: string | null
  saved: { colors: boolean; handle: boolean }
}

function carouselReply(n: number, extra: Record<string, unknown> = {}) {
  const slides = Array.from({ length: n }, (_, i) => ({
    kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
    kicker: i === 0 ? 'Vodič' : null,
    title:
      i === 0 ? 'Tri greške koje koštaju klijente' : i === n - 1 ? 'Pišite nam u poruke' : `Greška broj ${i}`,
    body: 'Kratko objašnjenje u jednoj ili dve rečenice.',
    stat: null,
    items: null,
  }))
  return {
    kind: 'text' as const,
    json: {
      slides,
      caption: 'Prvi red je hook.\n\nZatim kratko objašnjenje i poziv na akciju.',
      short_caption: 'Tri greške koje koštaju klijente, i kako da ih izbegnete.',
      hashtags: ['#seo', '#marketing', 'sajt'],
      first_comment: null,
      visual_query: 'laptop office desk',
      alt_text: 'Slajdovi sa savetima.',
      ...extra,
    },
  }
}

let seq = 0
function compose(body: Record<string, unknown>) {
  return call<{
    postId: string
    format: string
    media: Array<{ id: string; kind: string }>
    variants: Array<{ platform: string; text: string }>
    notes: string[]
    tokensCharged: number
    styleId: string
    slides: Array<{ kind: string; title: string }>
  }>(composePost, '/api/ai/compose', {
    token: user.token,
    body: { brandId, platforms: ['instagram'], topic: 'Greške na sajtu koje koštaju klijente', ...body },
    headers: { 'idempotency-key': `design-${Date.now()}-${seq++}` },
  })
}

async function preview(query: Record<string, string>, token = user.token) {
  const { NextRequest } = await import('next/server')
  const url = new URL('/api/visuals/preview', APP)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = await previewGet(
    new NextRequest(url, { headers: { authorization: `Bearer ${token}`, origin: APP } }),
    {
      params: Promise.resolve({}),
    },
  )
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    bytes: Buffer.from(await res.arrayBuffer()),
  }
}

async function mediaOf(postId: string) {
  const { data } = await admin
    .from('post_media')
    .select('sort_order, media_assets(source, width, height, source_data)')
    .eq('post_id', postId)
    .order('sort_order')
  return (data ?? []).map(
    (r) =>
      r.media_assets as unknown as {
        source: string
        width: number
        height: number
        source_data: Record<string, unknown>
      },
  )
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('design')
  other = await createTestUser('design-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Dizajn test', type: 'business', websiteUrl: 'tangerineseo.rs' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const { error } = await admin.from('social_accounts').insert({
    brand_id: brandId,
    workspace_id: wsId,
    platform: 'instagram',
    external_id: `ig-design-${Date.now()}`,
    name: 'IG',
    username: 'tangerineseo',
    account_type: 'instagram_business',
    status: 'active',
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  })
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  resetVisualsState()
  resetUnsplashCacheForTests()
  resetPexelsCacheForTests()
  clearPreviewCacheForTests()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(user)
  await deleteTestUser(other)
})

describe('Dizajn brenda (GET/PATCH /api/brands/[id]/design)', () => {
  it('podrazumevano: stil „headline”, 4:5, besplatne fotografije, 5 slajdova, nalog sa Instagrama', async () => {
    const r = await call<DesignView>(designGet, `/api/brands/${brandId}/design`, {
      token: user.token,
      params: { id: brandId },
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      styleId: 'headline',
      size: 'portrait',
      photoSource: 'stock',
      slides: 5,
      handle: '@tangerineseo',
      saved: { colors: false, handle: false },
    })
    expect(r.json.data!.colors.primary).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('čuva stil, boje i nalog; loša boja i loš nalog daju 400; tuđ brend 404; reset vraća podrazumevano', async () => {
    const bad = await call(designPatch, `/api/brands/${brandId}/design`, {
      token: user.token,
      params: { id: brandId },
      body: {
        colors: {
          primary: 'narandžasta',
          secondary: '#2B59C3',
          background: '#FFFFFF',
          text: '#101116',
          muted: '#5C5C68',
        },
      },
    })
    expect(bad.status).toBe(400)
    expect(
      (
        await call(designPatch, `/api/brands/${brandId}/design`, {
          token: user.token,
          params: { id: brandId },
          body: { handle: 'ne valja!' },
        })
      ).status,
    ).toBe(400)
    const ok = await call<DesignView>(designPatch, `/api/brands/${brandId}/design`, {
      token: user.token,
      params: { id: brandId },
      body: {
        styleId: 'poster',
        size: 'square',
        slides: 7,
        photoSource: 'none',
        handle: 'moj.brend',
        colors: {
          primary: '#f26b1d',
          secondary: '#2B59C3',
          background: '#FFFFFF',
          text: '#101116',
          muted: '#5C5C68',
        },
      },
    })
    expect(ok.status).toBe(200)
    expect(ok.json.data).toMatchObject({
      styleId: 'poster',
      size: 'square',
      slides: 7,
      photoSource: 'none',
      handle: '@moj.brend',
      saved: { colors: true, handle: true },
    })
    expect(ok.json.data!.colors.primary).toBe('#F26B1D')
    const foreign = await call(designGet, `/api/brands/${brandId}/design`, {
      token: other.token,
      params: { id: brandId },
    })
    expect(foreign.status).toBe(404)
    const reset = await call<DesignView>(designPatch, `/api/brands/${brandId}/design`, {
      token: user.token,
      params: { id: brandId },
      body: { reset: true },
    })
    expect(reset.json.data).toMatchObject({ styleId: 'headline', size: 'portrait', handle: '@tangerineseo' })
  })
})

describe('Pregled stila (GET /api/visuals/preview)', () => {
  it('vraća JPEG u bojama koje korisnik menja; nepoznat stil 400; tuđ brend 404', async () => {
    const r = await preview({
      brandId,
      styleId: 'bold',
      kind: 'cover',
      c: 'F26B1D-2B59C3-FFFFFF-101116-5C5C68',
    })
    expect(r.status).toBe(200)
    expect(r.type).toBe('image/jpeg')
    const meta = await sharp(r.bytes).metadata()
    expect([meta.width, meta.height]).toEqual([432, 540])
    // boja brenda je zaista na slici: piksel u uglu je narandžast
    const { data } = await sharp(r.bytes)
      .extract({ left: 4, top: 4, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(200)
    expect(data[2]).toBeLessThan(80)
    const story = await preview({ brandId, styleId: 'poster', format: 'story', kind: 'point' })
    expect(await sharp(story.bytes).metadata()).toMatchObject({ width: 432, height: 768 })
    expect((await preview({ brandId, styleId: 'nepostojeci' })).status).toBe(400)
    expect((await preview({ brandId, styleId: 'bold' }, other.token)).status).toBe(404)
  })
})

describe('Nova objava sa dizajnom (D-108)', () => {
  it('karusel: 5 slajdova u stilu brenda (4:5), opis sa heštegovima, 2 tokena, bez fotografija za tipografski stil', async () => {
    enqueueReply(carouselReply(5))
    const r = await compose({ format: 'carousel', styleId: 'headline' })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ format: 'carousel', styleId: 'headline', tokensCharged: 2 })
    expect(r.json.data!.slides.map((s) => s.kind)).toEqual(['cover', 'point', 'point', 'point', 'cta'])
    const media = await mediaOf(r.json.data!.postId)
    expect(media).toHaveLength(5)
    expect(media.every((m) => m.source === 'template' && m.width === 1080 && m.height === 1350)).toBe(true)
    expect(media.map((m) => m.source_data.kind)).toEqual(['cover', 'point', 'point', 'point', 'cta'])
    expect(visualsState.unsplashSearches).toBe(0)
    const { data: post } = await admin
      .from('posts')
      .select('master_text, title')
      .eq('id', r.json.data!.postId)
      .single()
    expect(post!.master_text).toContain('#seo #marketing #sajt')
    expect(post!.title).toBe('Tri greške koje koštaju klijente')
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain('Napravi tačno 5 slajdova karusela')
  })

  it('stil sa fotografijom uzima fotografije sa Unsplash-a, kvadrat 1:1 po izboru', async () => {
    enqueueReply(carouselReply(3))
    const r = await compose({
      format: 'carousel',
      styleId: 'poster',
      slides: 3,
      size: 'square',
      photoSource: 'stock',
    })
    expect(r.status).toBe(200)
    const media = await mediaOf(r.json.data!.postId)
    expect(media).toHaveLength(3)
    expect(media.every((m) => m.width === 1080 && m.height === 1080)).toBe(true)
    expect(visualsState.unsplashSearches).toBe(1)
    expect(media.every((m) => typeof m.source_data.photoAssetId === 'string')).toBe(true)
  })

  it('„AI bira” sa jednim slajdom daje objavu sa slikom; priča je 9:16 sa oznakom story', async () => {
    enqueueReply(carouselReply(1))
    const single = await compose({ format: 'auto' })
    expect(single.json.data!.format).toBe('image')
    expect(await mediaOf(single.json.data!.postId)).toHaveLength(1)
    enqueueReply(carouselReply(1))
    const story = await compose({ format: 'story', styleId: 'event', photoSource: 'none' })
    expect(story.json.data!.format).toBe('story')
    const [slide] = await mediaOf(story.json.data!.postId)
    expect([slide!.width, slide!.height]).toEqual([1080, 1920])
    const { data: targets } = await admin
      .from('post_targets')
      .select('options')
      .eq('post_id', story.json.data!.postId)
    expect((targets![0]!.options as { format?: string }).format).toBe('story')
  })

  it('X dobija kratak opis do 280 znakova; saldo pada samo za tekst', async () => {
    const before = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
      token: user.token,
      query: { workspaceId: wsId },
    })
    enqueueReply(carouselReply(1))
    const r = await compose({ format: 'image', platforms: ['instagram', 'x'] })
    expect(r.status).toBe(200)
    const x = r.json.data!.variants.find((v) => v.platform === 'x')!
    expect(x.text.length).toBeLessThanOrEqual(280)
    expect(x.text).toContain('Tri greške koje koštaju klijente')
    const after = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
      token: user.token,
      query: { workspaceId: wsId },
    })
    expect(after.json.data!.balance.available).toBe(before.json.data!.balance.available - 2)
  })
})
