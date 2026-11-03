import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'

import { enqueuePeopleVerdicts, geminiServer, peopleCalls, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Ljudi samo evropskog izgleda (D-136, D-154): automatski izbor traži evropske ljude kad upit pominje
 * ljude, odbija snimak čije ime pominje drugi izgled, a ostale pre preuzimanja proverava Gemini na
 * kadrovima. Pravilo važi za svaki brend, i na engleskom.
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

describe('ljudi samo evropskog izgleda (D-136, D-154)', () => {
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

  it('snimak sa drugim izgledom na kadrovima se preskače, uzima se sledeći', async () => {
    // snimci od 3 do 60 s: 101, 303, 505, 707 (parni su dugi); prvi je na kadrovima odbijen
    enqueuePeopleVerdicts(['other', 'european', 'none', 'european'])
    const picked = await video(`cleaning service at home ${tag()}`)
    expect(pexelsId(picked?.asset)).toBe(303)
    expect(peopleCalls).toHaveLength(1)
    // naslovna slika i dva kadra po snimku idu kao jedna slika
    expect(peopleCalls[0]!.images).toBe(4)
  })

  it('snimak čije ime pominje drugi izgled se odbija bez gledanja kadrova', async () => {
    visualsState.pexelsVideoSlugs = { 101: 'black-woman-vacuuming-the-floor' }
    const picked = await video(`vacuum cleaner ${tag()}`)
    expect(pexelsId(picked?.asset)).toBe(303)
    expect(peopleCalls[0]!.images).toBe(3)
  })

  it('fotografija sa drugim izgledom se preskače', async () => {
    enqueuePeopleVerdicts(['other', 'european'])
    const picked = await photo(`air conditioner technician ${tag()}`)
    expect(picked.map((p) => pexelsId(p.asset))).toEqual([302])
  })

  it('kad provera ne uspe, prolazi samo snimak čije ime ne pominje ljude', async () => {
    visualsState.pexelsVideoSlugs = {
      101: 'a-woman-cleaning-the-kitchen',
      303: 'air-conditioner-on-the-wall',
    }
    // glavni i rezervni model padaju
    enqueuePeopleVerdicts('fail', 'fail')
    const picked = await video(`kitchen cleaning ${tag()}`)
    expect(pexelsId(picked?.asset)).toBe(303)
  })

  it('kad nijedan snimak ne prođe, izbor vraća null posle najviše tri provere', async () => {
    enqueuePeopleVerdicts(['other', 'other', 'other', 'other'], ['other', 'other', 'other', 'other'])
    const picked = await video(`busy office ${tag()}`)
    expect(picked).toBeNull()
    expect(peopleCalls.length).toBeLessThanOrEqual(3)
  })
})
