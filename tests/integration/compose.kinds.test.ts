import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as composePost } from '@/app/api/ai/compose/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetPexelsCacheForTests } from '@/integrations/pexels/client'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'

import { calls, enqueueReply, geminiServer, resetGeminiMock, type MockReply } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Nova objava sa sadržajem brenda (D-165): utisak citiran bez izmena, osoba iz tima i pre i posle
 * samo sa svojim fotografijama (nikad Unsplash ili Pexels), format koji vrsta ne nosi se odbija.
 */
let user: TestUser
let wsId = ''
let brandId = ''
const photos = { member: '', before: '', after: '' }
const REVIEW = 'Došli su na vreme i ostavili sve čisto. Preporuka!'

interface ComposeView {
  postId: string
  format: string
  variants: Array<{ platform: string; text: string }>
  slides?: Array<{ kind: string; title: string; body?: string | null }>
}

const designedReply = (n: number): MockReply => ({
  kind: 'text',
  json: {
    slides: Array.from({ length: n }, (_, i) => ({
      kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
      kicker: null,
      title: i === 0 ? 'Najbolji majstori' : `Slajd ${i + 1}`,
      body: 'Kratko.',
      stat: null,
      items: null,
    })),
    caption: 'Hvala na poverenju.',
    short_caption: 'Hvala.',
    hashtags: ['#adaptacija'],
    first_comment: null,
    visual_query: 'bathroom',
    alt_text: 'Slajdovi.',
  },
})

const textReply = (): MockReply => ({
  kind: 'text',
  json: {
    image_description: null,
    format: 'image',
    visual_query: 'office',
    variants: ['facebook', 'instagram'].map((platform) => ({
      platform,
      hook: 'Ponedeljak u kancelariji',
      body: 'Kafa pre mejlova.',
      cta: 'Pišite nam.',
      hashtags: [],
      alt_text: 'Kancelarija.',
      first_comment: null,
    })),
  },
})

let seq = 0
function compose(body: Record<string, unknown>) {
  return call<ComposeView>(composePost, '/api/ai/compose', {
    token: user.token,
    body: { brandId, platforms: ['facebook', 'instagram'], topic: 'Objava za test', ...body },
    headers: { 'idempotency-key': `kinds-${Date.now()}-${seq++}` },
  })
}

async function design(postId: string) {
  const { data } = await admin.from('posts').select('master_text, design').eq('id', postId).single()
  return data as {
    master_text: string
    design: { photoSource?: string; copy?: { photoAssetIds: string[]; slides: unknown[] } } | null
  }
}

async function image(color: string): Promise<string> {
  const id = crypto.randomUUID()
  const path = `ws/${wsId}/brand/${brandId}/uploads/${id}.png`
  const png = await sharp({ create: { width: 160, height: 160, channels: 3, background: color } })
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
    width: 160,
    height: 160,
  })
  if (error) throw new Error(error.message)
  return id
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('compose-kinds')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Nova objava sa sadržajem', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const granted = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 50,
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
      platform: 'facebook',
      external_id: `fb-ck-${Date.now()}`,
      name: 'FB',
      account_type: 'facebook_page',
    },
    {
      ...base,
      platform: 'instagram',
      external_id: `ig-ck-${Date.now()}`,
      name: 'IG',
      account_type: 'instagram_business',
    },
  ])
  if (accounts.error) throw new Error(accounts.error.message)
  photos.member = await image('#2f6f5e')
  photos.before = await image('#8a7f72')
  photos.after = await image('#d9e4ea')
  const at = '2026-11-01T10:00:00.000Z'
  const { data } = await admin.from('brands').select('settings').eq('id', brandId).single()
  const updated = await admin
    .from('brands')
    .update({
      settings: {
        ...((data?.settings as object) ?? {}),
        content: {
          kinds: { humor: false },
          testimonials: [
            {
              id: 'aaaaaaaaa1',
              createdAt: at,
              usedAt: null,
              author: 'Marija P.',
              detail: null,
              text: REVIEW,
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
              bio: null,
              funFact: null,
              photoAssetId: photos.member,
            },
          ],
          pairs: [
            {
              id: 'ccccccccc1',
              createdAt: at,
              usedAt: null,
              title: 'Kupatilo',
              note: null,
              beforeAssetId: photos.before,
              afterAssetId: photos.after,
            },
          ],
        },
      },
    })
    .eq('id', brandId)
  if (updated.error) throw new Error(updated.error.message)
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
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('Nova objava sa sadržajem brenda', () => {
  it('utisak: dizajn i kad je izabrana gola fotografija, citat bez izmena, bez Unsplash-a', async () => {
    enqueueReply(designedReply(1))
    const r = await compose({
      format: 'image',
      design: false,
      content: { kind: 'review', ref: 'aaaaaaaaa1' },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.slides![0]!.title).toBe(`„${REVIEW}”`)
    expect(r.json.data!.slides![0]!.body).toBe('— Marija P.')
    const post = await design(r.json.data!.postId)
    expect(post.master_text.startsWith(`„${REVIEW}”\n— Marija P. · ★★★★★\n\nHvala na poverenju.`)).toBe(true)
    expect(post.design!.photoSource).toBe('none')
    expect(post.design!.copy!.photoAssetIds).toEqual([])
    expect(visualsState.unsplashSearches).toBe(0)
    expect(visualsState.pexelsSearches).toEqual([])
    expect(calls.some((c) => JSON.stringify(c.body).includes('VRSTA OBJAVE: utisak klijenta'))).toBe(true)
  })

  it('osoba iz tima: samo njena fotografija', async () => {
    enqueueReply(designedReply(1))
    const r = await compose({ format: 'image', content: { kind: 'team', ref: 'bbbbbbbbb1' } })
    expect(r.status).toBe(200)
    const post = await design(r.json.data!.postId)
    expect(post.design!.copy!.photoAssetIds).toEqual([photos.member])
    expect(visualsState.unsplashSearches).toBe(0)
  })

  it('pre i posle na „AI bira”: karusel od tri slajda sa fotografijom pre, pa posle', async () => {
    enqueueReply(designedReply(5))
    const r = await compose({ format: 'auto', content: { kind: 'before_after', ref: 'ccccccccc1' } })
    expect(r.status).toBe(200)
    expect(r.json.data!.format).toBe('carousel')
    expect(r.json.data!.slides).toHaveLength(3)
    const post = await design(r.json.data!.postId)
    expect(post.design!.copy!.photoAssetIds).toEqual([photos.before, photos.after])
    expect(visualsState.unsplashSearches).toBe(0)
  })

  it('format koji vrsta ne nosi i obrisana stavka se odbijaju pre naplate', async () => {
    const pair = await compose({ format: 'image', content: { kind: 'before_after', ref: 'ccccccccc1' } })
    expect(pair.status).toBe(400)
    expect(pair.json.error!.message).toBe('Ova vrsta sadržaja ne ide uz izabranu vrstu objave.')
    const video = await compose({ format: 'video', content: { kind: 'team', ref: 'bbbbbbbbb1' } })
    expect(video.status).toBe(400)
    const gone = await compose({ format: 'image', content: { kind: 'review', ref: 'zzzzzzzzzz' } })
    expect(gone.status).toBe(400)
    expect(gone.json.error!.message).toBe('Izabrani utisak, osoba ili rad više ne postoji u Sadržaju brenda.')
    expect(calls).toHaveLength(0)
  })

  it('humor bira korisnik i kad je isključen za predloge; tekst dobija uputstvo vrste', async () => {
    enqueueReply(textReply())
    const r = await compose({ platforms: ['facebook'], format: 'text', content: { kind: 'humor' } })
    expect(r.status).toBe(200)
    expect(calls.some((c) => JSON.stringify(c.body).includes('VRSTA OBJAVE: humor iz struke'))).toBe(true)
  })

  it('utisak kao tekst: ceo utisak sa imenom na početku', async () => {
    enqueueReply(textReply())
    const r = await compose({
      platforms: ['facebook'],
      format: 'text',
      content: { kind: 'review', ref: 'aaaaaaaaa1' },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.variants.every((v) => v.text.startsWith(`„${REVIEW}”\n— Marija P.`))).toBe(true)
  })
})
