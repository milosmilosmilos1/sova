import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'

import { geminiServer, photoCalls, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Ljudi na stok fotografijama (D-136, D-180): automatski izbor traži evropske ljude kad upit pominje
 * ljude, a sa Unsplash-a i Pexels-a uzima samo ono čiji opis ili ime ne pominje ljude i odgovara
 * upitu. Fotografije i kadrovi tih servisa ne idu modelu (ne dozvoljavaju AI obradu). Pravilo važi za
 * svaki brend, i na engleskom.
 */
let user: TestUser
let wsId = ''
let brandId = ''

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  user = await createTestUser('people')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Ljudi kao publika', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

beforeEach(async () => {
  // svaki test kreće od brenda bez Pexels medija, da izbor ne preskače snimke iz ranijeg testa
  await admin.from('media_assets').delete().eq('brand_id', brandId).eq('source', 'pexels')
})

afterEach(() => {
  resetVisualsState()
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

// pretraga se pamti (memorija ili Redis), pa svaki upit ima svoju oznaku da stigne do lažnog Pexels-a
const tag = () => crypto.randomUUID().slice(0, 8)
const photo = (query: string) =>
  pickPexelsPhotos({ workspaceId: wsId, brandId, query, count: 1, crop: 'square', uploadedBy: null })
const video = (query: string) =>
  pickPexelsVideo({ workspaceId: wsId, brandId, query, orientation: 'portrait', uploadedBy: null })
const pexelsId = (asset: { source_data: unknown } | undefined) =>
  Number((asset?.source_data as { pexelsId?: number } | null)?.pexelsId)

describe('ljudi na stok fotografijama (D-136, D-180)', () => {
  it('upit koji pominje ljude traži evropske ljude, i za fotografije i za snimke', async () => {
    const a = tag()
    await photo(`happy couple dinner ${a}`)
    expect(visualsState.pexelsSearches[0]).toBe(`photo:european happy couple dinner ${a}:square`)
    const b = tag()
    await video(`friends at party ${b}`)
    expect(visualsState.pexelsSearches).toContain(`video:european friends at party ${b}:portrait`)
    // kraća rezervna pretraga i dalje pominje ljude, a ne samo „european”
    expect(visualsState.pexelsSearches.every((q) => !/:european:/.test(q))).toBe(true)
  })

  it('pravilo važi i za brend na engleskom i za staro podešavanje „bilo ko”', async () => {
    await admin
      .from('brands')
      .update({ design: { people: 'any' }, content_locale: 'en' })
      .eq('id', brandId)
    const c = tag()
    await photo(`happy couple dinner ${c}`)
    expect(visualsState.pexelsSearches[0]).toBe(`photo:european happy couple dinner ${c}:square`)
    await admin.from('brands').update({ design: {}, content_locale: 'sr-Latn' }).eq('id', brandId)
  })

  it('snimak čije ime pominje ljude Sova sama ne uzima, uzima se sledeći; model ne gleda kadrove (D-180)', async () => {
    // snimci od 3 do 60 s: 101, 303, 505, 707 (parni su dugi)
    visualsState.pexelsVideoSlugs = { 101: 'a-woman-vacuuming-the-floor' }
    const picked = await video(`robot vacuum ${tag()}`)
    expect(pexelsId(picked?.asset)).toBe(303)
    expect(photoCalls).toHaveLength(0)
  })

  it('snimak čije ime pominje drugi izgled se odbija', async () => {
    visualsState.pexelsVideoSlugs = { 101: 'black-woman-vacuuming-the-floor' }
    const picked = await video(`robot vacuum ${tag()}`)
    expect(pexelsId(picked?.asset)).toBe(303)
    expect(photoCalls).toHaveLength(0)
  })

  it('fotografija čiji opis pominje ljude se ne uzima sama; uzima se sledeća po opisu (D-180)', async () => {
    visualsState.pexelsAlts = { 301: 'man repairing an air conditioner' }
    const picked = await photo(`air conditioner unit ${tag()}`)
    expect(picked.map((p) => pexelsId(p.asset))).toEqual([302])
    expect(photoCalls).toHaveLength(0)
  })

  it('prolazi samo snimak čije ime ne pominje ljude i odgovara upitu (D-167, D-180)', async () => {
    visualsState.pexelsVideoSlugs = {
      101: 'a-woman-cleaning-the-kitchen',
      303: 'air-conditioner-on-the-wall',
      505: 'clean-kitchen-counter',
    }
    const picked = await video(`kitchen cleaning ${tag()}`)
    expect(pexelsId(picked?.asset)).toBe(505)
  })

  it('kad nijedan snimak ne prođe, izbor vraća null', async () => {
    visualsState.pexelsVideoSlugs = {
      101: 'woman-working-in-busy-office',
      303: 'man-at-busy-office-desk',
      505: 'people-in-busy-office',
      707: 'girl-typing-in-busy-office',
    }
    const picked = await video(`busy office ${tag()}`)
    expect(picked).toBeNull()
    expect(photoCalls).toHaveLength(0)
  })
})
