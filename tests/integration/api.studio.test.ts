import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as messagePost } from '@/app/api/studio/messages/route'
import { DELETE as studioDelete, GET as studioGet } from '@/app/api/studio/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetPexelsCacheForTests } from '@/integrations/pexels/client'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { setCrawlDepsForTests } from '@/lib/crawler/deps'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'

import { calls, enqueueReply, geminiServer, resetGeminiMock, type MockReply } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers } from './visuals-mock'

/** Studio kao razgovor (D-116): odgovor, nova objava, izmena, prilozi, link i brisanje razgovora. */
let user: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let seq = 0

interface Message {
  id: string
  role: string
  body: string
  action: string | null
  postId: string | null
  attachments: Array<{ kind: string; assetId?: string; url: string | null; title?: string | null }>
  format: string | null
  noteCodes: string[]
  suggestions: string[]
  tokens: number
  error: { code: string; message: string } | null
}
interface Turn {
  messages: Message[]
  postId: string | null
  tokensCharged: number
}
interface Thread {
  messages: Message[]
  lastPostId: string | null
  prices: { message: number; text: number }
  platforms: string[]
  topics: string[]
}

function decision(over: Record<string, unknown>): MockReply {
  return {
    kind: 'text',
    json: {
      action: 'reply',
      reply: 'Evo predloga.',
      brief: null,
      revision: null,
      suggestions: ['Napravi karusel', 'Skrati opis'],
      ...over,
    },
  }
}

const brief = (over: Record<string, unknown> = {}) => ({
  topic: 'Karusel sa savetima za letnji servis klima uređaja u Beogradu',
  format: 'carousel',
  goal: 'education',
  cta: null,
  locale: null,
  slides: 4,
  style: null,
  photos: null,
  hashtags: true,
  ...over,
})

function carouselReply(n: number): MockReply {
  return {
    kind: 'text',
    json: {
      slides: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
        kicker: null,
        title: i === 0 ? 'Leto bez znoja' : i === n - 1 ? 'Zakažite servis' : `Savet broj ${i}`,
        body: 'Kratko objašnjenje u jednoj rečenici.',
        stat: null,
        items: null,
      })),
      caption: 'Leto je blizu.\n\nOčistite klimu na vreme.',
      short_caption: 'Leto je blizu, očistite klimu na vreme.',
      hashtags: ['#klima', '#servis'],
      first_comment: null,
      visual_query: 'air conditioner',
      alt_text: 'Slajdovi sa savetima.',
    },
  }
}

function send(body: Record<string, unknown>, token = user.token) {
  return call<Turn>(messagePost, '/api/studio/messages', {
    token,
    body: { brandId, ...body },
    headers: { 'idempotency-key': `studio-${Date.now()}-${seq++}` },
  })
}

async function available(): Promise<number> {
  const r = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
    token: user.token,
    query: { workspaceId: wsId },
  })
  return r.json.data!.balance.available
}

function promptOf(index: number): { text: string; images: number } {
  const body = calls[index]?.body as {
    contents?: Array<{ parts?: Array<{ text?: string; inlineData?: unknown }> }>
  }
  const parts = body?.contents?.[0]?.parts ?? []
  return {
    text: parts.map((p) => p.text ?? '').join('\n'),
    images: parts.filter((p) => p.inlineData).length,
  }
}

async function uploadPhoto(brand: string, workspace: string): Promise<string> {
  const png = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .png()
    .toBuffer()
  const path = `ws/${workspace}/brand/${brand}/uploads/${crypto.randomUUID()}.png`
  await admin.storage.from('uploads').upload(path, png, { contentType: 'image/png' })
  const { data, error } = await admin
    .from('media_assets')
    .insert({
      workspace_id: workspace,
      brand_id: brand,
      kind: 'image',
      source: 'upload',
      bucket: 'uploads',
      storage_path: path,
      mime_type: 'image/png',
      size_bytes: png.length,
      width: 600,
      height: 600,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

async function designOf(postId: string) {
  const { data } = await admin.from('posts').select('design, master_text, version').eq('id', postId).single()
  return data as {
    design: {
      styleId: string
      ownPhotos?: boolean
      copy?: { slides: Array<{ title: string; body: string | null }>; photoAssetIds: string[] }
    }
    master_text: string
    version: number
  }
}

async function slidePhotos(postId: string) {
  const { data } = await admin
    .from('post_media')
    .select('sort_order, media_asset_id, media_assets(source_data)')
    .eq('post_id', postId)
    .order('sort_order')
  return (data ?? []).map((r) => ({
    id: r.media_asset_id,
    photo: (r.media_assets as unknown as { source_data: { photoAssetId?: string | null } }).source_data
      .photoAssetId,
  }))
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('studio')
  other = await createTestUser('studio-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Studio test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('brands')
    .update({ voice: { offer: 'Servis klima u Beogradu', topics: ['Letnji servis', 'Saveti za uštedu'] } })
    .eq('id', brandId)
  const { error } = await admin.from('social_accounts').insert({
    brand_id: brandId,
    workspace_id: wsId,
    platform: 'instagram',
    external_id: `ig-studio-${Date.now()}`,
    name: 'IG',
    username: 'klimaservis',
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
  setCrawlDepsForTests(null)
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
  await deleteTestUser(other)
})

describe('Studio kao razgovor', () => {
  let carouselId = ''

  it('prazan razgovor: cene, mreže povezanih naloga i teme iz glasa brenda; tuđ brend 404', async () => {
    const r = await call<Thread>(studioGet, '/api/studio', { token: user.token, query: { brandId } })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      messages: [],
      lastPostId: null,
      prices: { message: 1, text: 2 },
      platforms: ['instagram'],
      topics: ['Letnji servis', 'Saveti za uštedu'],
    })
    expect((await call(studioGet, '/api/studio', { token: other.token, query: { brandId } })).status).toBe(
      404,
    )
    expect((await send({ text: 'Zdravo' }, other.token)).status).toBe(404)
  })

  it('odgovor košta 1 token i čuva obe poruke sa predlozima', async () => {
    const before = await available()
    enqueueReply(decision({ reply: 'Predlažem tri teme za ovu nedelju: servis, uštedu i čišćenje filtera.' }))
    const r = await send({ text: 'Šta da objavimo ove nedelje?' })
    expect(r.status).toBe(200)
    const [mine, sova] = r.json.data!.messages
    expect(mine).toMatchObject({ role: 'user', body: 'Šta da objavimo ove nedelje?' })
    expect(sova).toMatchObject({ role: 'assistant', action: 'reply', tokens: 1, postId: null })
    expect(sova!.suggestions).toEqual(['Napravi karusel', 'Skrati opis'])
    expect(r.json.data!.tokensCharged).toBe(1)
    expect(await available()).toBe(before - 1)
    const prompt = promptOf(0).text
    expect(prompt).toContain('Šta da objavimo ove nedelje?')
    expect(prompt).toContain('Instagram')
    const { data: gen } = await admin
      .from('ai_generations')
      .select('status, tokens_charged')
      .eq('workspace_id', wsId)
      .eq('type', 'studio_chat')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(gen).toMatchObject({ status: 'succeeded', tokens_charged: 1 })
  })

  it('nova objava: poruka se ne plaća, tekst 2 tokena, slajdovi i njihov tekst su sačuvani', async () => {
    const before = await available()
    enqueueReply(
      decision({ action: 'create', reply: 'Pravim karusel od četiri slajda.', brief: brief() }),
      carouselReply(4),
    )
    const r = await send({ text: 'Napravi karusel o letnjem servisu, četiri slajda' })
    expect(r.status).toBe(200)
    const sova = r.json.data!.messages[1]!
    expect(sova).toMatchObject({ action: 'create', format: 'carousel', tokens: 2 })
    expect(sova.postId).toBe(r.json.data!.postId)
    carouselId = r.json.data!.postId!
    expect(await available()).toBe(before - 2)
    const post = await designOf(carouselId)
    expect(post.design.copy!.slides.map((s) => s.title)).toEqual([
      'Leto bez znoja',
      'Savet broj 1',
      'Savet broj 2',
      'Zakažite servis',
    ])
    expect((await slidePhotos(carouselId)).length).toBe(4)
    // druga generacija je tekst objave; poruka koja je napravila objavu nije naplaćena
    const { data: gens } = await admin
      .from('ai_generations')
      .select('type, status, tokens_charged')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(2)
    expect(gens).toEqual([
      { type: 'text', status: 'succeeded', tokens_charged: 2 },
      { type: 'studio_chat', status: 'succeeded', tokens_charged: 0 },
    ])
    const thread = await call<Thread>(studioGet, '/api/studio', { token: user.token, query: { brandId } })
    expect(thread.json.data!.lastPostId).toBe(carouselId)
  })

  it('izmena otvorene objave: nov opis i jedan slajd, ostali slajdovi isti tekst, nova verzija', async () => {
    const old = await designOf(carouselId)
    const oldMedia = await slidePhotos(carouselId)
    enqueueReply(
      decision({
        action: 'revise',
        reply: 'Skratila sam opis i promenila drugi slajd.',
        revision: {
          caption: 'Kraće: očistite klimu pre leta. #klima',
          first_comment: 'Pišite nam za termin.',
          slides: [{ index: 2, title: 'Filteri jednom mesečno', body: 'Čist filter troši manje struje.' }],
        },
      }),
    )
    const r = await send({ text: 'Skrati opis i promeni drugi slajd', postId: carouselId })
    expect(r.status).toBe(200)
    expect(r.json.data!.messages[1]).toMatchObject({ action: 'revise', postId: carouselId, tokens: 1 })
    const post = await designOf(carouselId)
    expect(post.master_text).toBe('Kraće: očistite klimu pre leta. #klima')
    expect(post.version).toBe(old.version + 1)
    expect(post.design.copy!.slides[1]).toMatchObject({
      title: 'Filteri jednom mesečno',
      body: 'Čist filter troši manje struje.',
    })
    expect(post.design.copy!.slides[0]!.title).toBe('Leto bez znoja')
    const media = await slidePhotos(carouselId)
    expect(media).toHaveLength(4)
    expect(media.map((m) => m.id)).not.toEqual(oldMedia.map((m) => m.id))
    const { data: row } = await admin.from('posts').select('first_comment').eq('id', carouselId).single()
    expect(row!.first_comment).toBe('Pišite nam za termin.')
    expect(promptOf(0).text).toContain('Slajd 2: Savet broj 1')
  })

  it('izmena zakazane objave i izmena bez otvorene objave postaju odgovor sa napomenom', async () => {
    const { data: post } = await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        master_text: 'Zakazano',
        status: 'scheduled',
        scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
        created_by: user.id,
      })
      .select('id')
      .single()
    const revise = decision({
      action: 'revise',
      reply: 'Promenila sam opis.',
      revision: { caption: 'Novo', first_comment: null, slides: null },
    })
    enqueueReply(revise)
    const locked = await send({ text: 'Promeni opis', postId: post!.id })
    expect(locked.json.data!.messages[1]).toMatchObject({ action: 'reply', noteCodes: ['revise_locked'] })
    const { data: still } = await admin.from('posts').select('master_text').eq('id', post!.id).single()
    expect(still!.master_text).toBe('Zakazano')
    enqueueReply(revise)
    const none = await send({ text: 'Promeni opis' })
    expect(none.json.data!.messages[1]!.noteCodes).toEqual(['revise_no_post'])
    await admin.from('posts').delete().eq('id', post!.id)
  })

  it('priložena fotografija ide modelu i u slajdove; tipografski stil prelazi na „Poster”; izmena zadržava fotografiju', async () => {
    const photoId = await uploadPhoto(brandId, wsId)
    enqueueReply(
      decision({
        action: 'create',
        reply: 'Pravim objavu sa vašom fotografijom.',
        brief: brief({ photos: 'in_design', slides: 3 }),
      }),
      carouselReply(3),
    )
    const r = await send({ text: 'Napravi objavu sa ovom slikom', photoIds: [photoId] })
    expect(r.status).toBe(200)
    expect(promptOf(0).images).toBe(1)
    expect(r.json.data!.messages[0]!.attachments[0]).toMatchObject({ kind: 'photo', assetId: photoId })
    expect(r.json.data!.messages[0]!.attachments[0]!.url).toContain('token=')
    const postId = r.json.data!.postId!
    const post = await designOf(postId)
    expect(post.design).toMatchObject({ styleId: 'poster', ownPhotos: true })
    expect(post.design.copy!.photoAssetIds).toEqual([photoId])
    expect((await slidePhotos(postId)).every((m) => m.photo === photoId)).toBe(true)

    resetGeminiMock()
    enqueueReply(
      decision({
        action: 'revise',
        reply: 'Promenila sam naslov.',
        revision: {
          caption: null,
          first_comment: null,
          slides: [{ index: 1, title: 'Novi naslov', body: null }],
        },
      }),
    )
    const rev = await send({ text: 'Promeni naslov prvog slajda', postId })
    expect(rev.json.data!.messages[1]!.action).toBe('revise')
    expect((await slidePhotos(postId)).every((m) => m.photo === photoId)).toBe(true)
  })

  it('fotografija drugog korisnika se ne prilaže (404)', async () => {
    const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
      token: other.token,
      body: { name: 'Tuđi prostor', type: 'business' },
    })
    const foreign = await uploadPhoto(ws.json.data!.brandId, ws.json.data!.workspaceId)
    const r = await send({ text: 'Objavi ovu sliku', photoIds: [foreign] })
    expect(r.status).toBe(404)
    expect(calls).toHaveLength(0)
    await admin.from('workspaces').delete().eq('id', ws.json.data!.workspaceId)
  })

  it('link iz poruke: stranica proizvoda ide u kontekst, naslov ostaje uz poruku', async () => {
    const html = `<!doctype html><html><head><title>Klima 12000 BTU | Prodavnica</title>
<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Inverter klima 12000 BTU',
      description: 'Tiha inverter klima za stan do 35 m2.',
      offers: { '@type': 'Offer', price: 45990, priceCurrency: 'RSD' },
    })}</script></head><body><main><h1>Inverter klima 12000 BTU</h1><p>Ugradnja u Beogradu.</p></main></body></html>`
    setCrawlDepsForTests({
      fetch: async (input) => ({
        url: String(input),
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        body: Buffer.from(html),
        contentType: 'text/html; charset=utf-8',
        redirected: false,
        elapsedMs: 1,
      }),
    })
    enqueueReply(decision({ reply: 'Vidim klimu od 45.990 dinara. Da napravim objavu?' }))
    const r = await send({ text: 'Šta misliš o ovom proizvodu https://shop.test/klima-12000' })
    expect(r.status).toBe(200)
    const prompt = promptOf(0).text
    expect(prompt).toContain('Inverter klima 12000 BTU')
    expect(prompt).toContain('Cena: 45990 RSD')
    expect(r.json.data!.messages[0]!.attachments).toEqual([
      { kind: 'link', url: 'https://shop.test/klima-12000', title: 'Inverter klima 12000 BTU' },
    ])
  })

  it('objava koja ne uspe ostaje u razgovoru kao neuspela, bez naplate', async () => {
    const before = await available()
    enqueueReply(
      decision({ action: 'create', reply: 'Pravim objavu sa linkom.', brief: brief({ format: 'auto' }) }),
    )
    // Instagram ne prima link: „Nova objava” odbija, a poruka se čuva sa greškom
    const r = await send({ text: 'Objava sa linkom', settings: { format: 'link', platforms: ['instagram'] } })
    expect(r.status).toBe(200)
    expect(r.json.data!.messages[1]).toMatchObject({ action: 'failed', tokens: 0, postId: null })
    expect(r.json.data!.messages[1]!.error!.code).toBe('VALIDATION')
    expect(await available()).toBe(before)
  })

  it('neispravan odgovor modela: greška, ništa se ne upisuje i ne naplaćuje', async () => {
    const before = await available()
    const count = async () =>
      (
        await admin
          .from('studio_messages')
          .select('id', { count: 'exact', head: true })
          .eq('brand_id', brandId)
          .eq('user_id', user.id)
      ).count ?? 0
    const n = await count()
    enqueueReply({ kind: 'text', json: { nesto: 'drugo' } })
    const r = await send({ text: 'Zdravo' })
    expect(r.status).toBeGreaterThanOrEqual(500)
    expect(await count()).toBe(n)
    expect(await available()).toBe(before)
  })

  it('razgovor čuva najviše 200 poruka; brisanje razgovora ostavlja objave', async () => {
    const old = Array.from({ length: 205 }, (_, i) => ({
      brand_id: brandId,
      workspace_id: wsId,
      user_id: user.id,
      role: i % 2 ? 'assistant' : 'user',
      body: `Stara poruka ${i}`,
      created_at: new Date(Date.now() - (300 - i) * 60_000).toISOString(),
    }))
    await admin.from('studio_messages').insert(old)
    enqueueReply(decision({}))
    expect((await send({ text: 'Još jedna' })).status).toBe(200)
    const { count } = await admin
      .from('studio_messages')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
    expect(count).toBe(200)

    const cleared = await call<{ deleted: number }>(studioDelete, '/api/studio', {
      token: user.token,
      method: 'DELETE',
      query: { brandId },
    })
    expect(cleared.json.data!.deleted).toBe(200)
    const thread = await call<Thread>(studioGet, '/api/studio', { token: user.token, query: { brandId } })
    expect(thread.json.data!.messages).toEqual([])
    const { data: post } = await admin.from('posts').select('id').eq('id', carouselId).single()
    expect(post!.id).toBe(carouselId)
  })
})
