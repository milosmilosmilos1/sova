import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as composePost } from '@/app/api/ai/compose/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetPexelsCacheForTests } from '@/integrations/pexels/client'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * „Nova objava” (D-107): jezik, vrsta objave ili „AI bira”, tekst sa heštegovima iz Gemini-ja,
 * fotografije sa Unsplash-a ili Pexels-a, video sa Pexels-a, vizual iz šablona po izboru.
 */
let user: TestUser
let wsId = ''
let brandId = ''

interface ComposeView {
  postId: string
  format: string
  locale: string
  variants: Array<{ platform: string; text: string; firstComment: string | null }>
  media: Array<{ id: string; kind: string; url: string; attribution: string | null }>
  targets: number
  notes: string[]
  tokensCharged: number
}

function reply(format: string | null, visualQuery: string | null, platforms = ['facebook', 'instagram']) {
  return {
    kind: 'text' as const,
    json: {
      image_description: null,
      format,
      visual_query: visualQuery,
      variants: platforms.map((platform) => ({
        platform,
        hook: 'Leto bez znoja počinje sa čistom klimom',
        body: 'Servis klima uređaja uz dolazak na adresu u Beogradu.',
        cta: 'Zakažite termin porukom.',
        hashtags: ['#klima', '#beograd'],
        alt_text: 'Serviser čisti klima uređaj.',
        first_comment: null,
      })),
    },
  }
}

let seq = 0
function compose(body: Record<string, unknown>, key = `compose-${Date.now()}-${seq++}`) {
  return call<ComposeView>(composePost, '/api/ai/compose', {
    token: user.token,
    body: {
      brandId,
      platforms: ['facebook', 'instagram'],
      topic: 'Servis klima uređaja u Beogradu, dolazak na adresu',
      // ovi testovi proveravaju objavu sa golom fotografijom; dizajn ima svoje testove (D-108)
      design: false,
      ...body,
    },
    headers: { 'idempotency-key': key },
  })
}

async function balance(): Promise<number> {
  const r = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
    token: user.token,
    query: { workspaceId: wsId },
  })
  return r.json.data!.balance.available
}

async function mediaOf(postId: string) {
  const { data } = await admin
    .from('post_media')
    .select('sort_order, media_assets(kind, source, width, height)')
    .eq('post_id', postId)
    .order('sort_order')
  return (data ?? []).map(
    (r) => r.media_assets as unknown as { kind: string; source: string; width: number; height: number },
  )
}

async function targetsOf(postId: string) {
  const { data } = await admin.from('post_targets').select('platform, options').eq('post_id', postId)
  return (data ?? []) as Array<{ platform: string; options: Record<string, unknown> | null }>
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('compose')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Nova objava test', type: 'business', websiteUrl: 'tangerineseo.rs' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active',
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  }
  const { error } = await admin.from('social_accounts').insert([
    {
      ...base,
      platform: 'facebook',
      external_id: `page-compose-${Date.now()}`,
      name: 'Strana',
      account_type: 'facebook_page',
    },
    {
      ...base,
      platform: 'instagram',
      external_id: `ig-compose-${Date.now()}`,
      name: 'IG',
      account_type: 'instagram_business',
    },
  ])
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  resetVisualsState()
  resetUnsplashCacheForTests()
  resetPexelsCacheForTests()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(user)
})

describe('Nova objava (POST /api/ai/compose)', () => {
  it('AI bira vrstu: Gemini predlaže karusel, tri fotografije sa Unsplash-a, nacrt za Facebook i Instagram, 2 tokena', async () => {
    enqueueReply(reply('carousel', 'air conditioner service'))
    const before = await balance()
    const r = await compose({ format: 'auto' })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ format: 'carousel', locale: 'sr-Latn', targets: 2, tokensCharged: 2 })
    expect(r.json.data!.media).toHaveLength(3)
    expect(
      r.json.data!.media.every((m) => m.kind === 'image' && m.attribution?.endsWith('on Unsplash')),
    ).toBe(true)
    expect(await balance()).toBe(before - 2)
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain('Vrstu objave izaberi sam')
    expect(prompt).toContain('Karusel (carousel)')
    // Instagram ne prima objavu bez slike, pa „samo tekst” nije ponuđen
    expect(prompt).not.toContain('(text)')
    const { data: post } = await admin
      .from('posts')
      .select('status, source, master_text')
      .eq('id', r.json.data!.postId)
      .single()
    expect(post).toMatchObject({ status: 'draft', source: 'ai' })
    expect(post!.master_text).toContain('#klima')
    expect((await mediaOf(r.json.data!.postId)).map((m) => m.source)).toEqual([
      'unsplash',
      'unsplash',
      'unsplash',
    ])
    expect((await targetsOf(r.json.data!.postId)).map((t) => t.platform).sort()).toEqual([
      'facebook',
      'instagram',
    ])
  })

  it('priča na engleskom: uspravna fotografija, oba naloga dobijaju options.format = story', async () => {
    enqueueReply(reply('story', 'neon city night'))
    const r = await compose({ format: 'story', locale: 'en', source: 'unsplash' })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ format: 'story', locale: 'en', targets: 2, tokensCharged: 2 })
    expect(r.json.data!.notes.join(' ')).toContain('Priča nema opis')
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain('Write in English.')
    expect(prompt).toContain('Vrsta objave: Priča (Story)')
    const media = await mediaOf(r.json.data!.postId)
    expect(media).toHaveLength(1)
    expect(media[0]!.height).toBeGreaterThan(media[0]!.width)
    const targets = await targetsOf(r.json.data!.postId)
    expect(targets.every((t) => t.options?.format === 'story')).toBe(true)
  })

  it('ukrajinski: model dobija uputstvo na ukrajinskom, nacrt nosi jezik uk (D-108)', async () => {
    enqueueReply(reply('image', 'kyiv cafe'))
    const r = await compose({ format: 'image', locale: 'uk' })
    expect(r.status).toBe(200)
    expect(r.json.data!.locale).toBe('uk')
    expect(JSON.stringify(calls[0]!.body)).toContain('Пиши українською мовою.')
    const { data: post } = await admin.from('posts').select('language').eq('id', r.json.data!.postId).single()
    expect(post!.language).toBe('uk')
  })

  it('Reels: uspravan snimak sa Pexels-a; bez snimka nacrt ostaje bez videa uz napomenu', async () => {
    enqueueReply(
      reply('video', 'barista coffee', ['instagram']),
      reply('video', 'empty street', ['instagram']),
    )
    const r = await compose({ format: 'video', platforms: ['instagram'] })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ format: 'video', targets: 1, tokensCharged: 2 })
    expect(r.json.data!.media).toEqual([
      expect.objectContaining({ kind: 'video', attribution: 'Video by Autor 101 on Pexels' }),
    ])
    expect(visualsState.pexelsSearches).toEqual(['video:barista coffee:portrait'])
    visualsState.pexelsEmpty = true
    const none = await compose({ format: 'video', platforms: ['instagram'] })
    expect(none.status).toBe(200)
    expect(none.json.data!.media).toEqual([])
    expect(none.json.data!.notes.join(' ')).toContain('Video nije nađen')
  })

  it('Unsplash bez rezultata: fotografija sa Pexels-a, kvadrat za objavu', async () => {
    enqueueReply(reply('image', 'nista'))
    const r = await compose({ format: 'image' })
    expect(r.status).toBe(200)
    expect(r.json.data!.media).toHaveLength(1)
    // fotografija koju je brend već dobio se ne ponavlja (D-121), pa je ovo prva sledeća sa Pexels-a
    expect(r.json.data!.media[0]!.attribution).toMatch(/^Photo by Fotograf 30\d on Pexels$/)
    const [m] = await mediaOf(r.json.data!.postId)
    expect(m).toMatchObject({ source: 'pexels', width: m!.height })
  })

  it('šablon: vizual iz šablona preko fotografije sa Unsplash-a, tekst 2 + šablon 2 tokena', async () => {
    enqueueReply(reply('image', 'modern office'))
    const before = await balance()
    const r = await compose({ format: 'image', source: 'template' })
    expect(r.status).toBe(200)
    expect(r.json.data!.tokensCharged).toBe(4)
    expect(r.json.data!.media).toHaveLength(1)
    expect(r.json.data!.media[0]!.attribution).toMatch(/on Unsplash$/)
    expect(await balance()).toBe(before - 4)
    expect((await mediaOf(r.json.data!.postId))[0]).toMatchObject({ source: 'template' })
  })

  it('link: bez vizuala, link sa sajta brenda kad nije unet', async () => {
    enqueueReply(reply('link', null, ['facebook']))
    const r = await compose({ format: 'link', platforms: ['facebook'] })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ format: 'link', media: [], targets: 1 })
    const { data: brand } = await admin.from('brands').select('website_url').eq('id', brandId).single()
    const { data: post } = await admin.from('posts').select('link_url').eq('id', r.json.data!.postId).single()
    expect(brand!.website_url).toBeTruthy()
    expect(post!.link_url).toBe(brand!.website_url)
  })

  it('ponovljen zahtev sa istim ključem vraća isti nacrt, bez novog poziva Gemini-ja', async () => {
    enqueueReply(reply('image', 'coffee shop'))
    const key = `compose-replay-${Date.now()}`
    const first = await compose({ format: 'image' }, key)
    const again = await compose({ format: 'image' }, key)
    expect(first.status).toBe(200)
    expect(again.json.data!.postId).toBe(first.json.data!.postId)
    expect(calls).toHaveLength(1)
  })

  it('provere: bez ključa, vrsta koju mreža ne prima, mreže bez zajedničke vrste; ništa se ne naplaćuje', async () => {
    const before = await balance()
    const noKey = await call(composePost, '/api/ai/compose', {
      token: user.token,
      body: { brandId, platforms: ['instagram'], topic: 'Servis klima uređaja' },
    })
    expect(noKey.status).toBe(400)
    const text = await compose({ format: 'text', platforms: ['instagram'] })
    expect(text.status).toBe(400)
    expect(text.json.error?.message).toContain('ne ide na sve izabrane mreže')
    const none = await compose({ platforms: ['youtube', 'google_business'] })
    expect(none.status).toBe(400)
    expect(none.json.error?.message).toContain('nemaju zajedničku vrstu')
    expect(await balance()).toBe(before)
    expect(calls).toHaveLength(0)
  })
})
