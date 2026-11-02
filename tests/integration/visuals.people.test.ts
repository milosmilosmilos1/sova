import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'
import { brandPeopleLook } from '@/services/visuals/people'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Ljudi kao publika (D-136): automatski izbor fotografija i snimaka za brend na srpskom traži evropske
 * ljude kad upit pominje ljude; brend sa isključenim podešavanjem i brend na engleskom traže kao do sada.
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

afterEach(() => {
  resetVisualsState()
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

// pretraga se pamti (memorija ili Redis), pa svaki upit ima svoju oznaku da stigne do lažnog Pexels-a
const pick = (query: string) =>
  pickPexelsPhotos({ workspaceId: wsId, brandId, query, count: 1, crop: 'square', uploadedBy: null })
const tag = () => crypto.randomUUID().slice(0, 8)

describe('ljudi kao publika (D-136)', () => {
  it('brend na srpskom traži evropske ljude, i za fotografije i za snimke', async () => {
    const { data: brand } = await admin.from('brands').select('content_locale').eq('id', brandId).single()
    expect(brand!.content_locale).toBe('sr-Latn')
    const a = tag()
    await pick(`happy couple dinner ${a}`)
    expect(visualsState.pexelsSearches[0]).toBe(`photo:european happy couple dinner ${a}:square`)
    const b = tag()
    await pickPexelsVideo({
      workspaceId: wsId,
      brandId,
      query: `friends at party ${b}`,
      orientation: 'portrait',
      uploadedBy: null,
    })
    expect(visualsState.pexelsSearches).toContain(`video:european friends at party ${b}:portrait`)
    // kraća rezervna pretraga i dalje pominje ljude, a ne samo „european”
    expect(visualsState.pexelsSearches.every((q) => !/:european:/.test(q))).toBe(true)
  })

  it('isključeno podešavanje i brend na engleskom traže kao do sada', async () => {
    const { error } = await admin
      .from('brands')
      .update({ design: { people: 'any' } })
      .eq('id', brandId)
    expect(error).toBeNull()
    const { data: saved } = await admin.from('brands').select('design').eq('id', brandId).single()
    expect(saved!.design).toEqual({ people: 'any' })
    expect(await brandPeopleLook(brandId)).toBe('any')
    const c = tag()
    await pick(`happy couple dinner ${c}`)
    expect(visualsState.pexelsSearches[0]).toBe(`photo:happy couple dinner ${c}:square`)

    resetVisualsState()
    await admin.from('brands').update({ design: {}, content_locale: 'en' }).eq('id', brandId)
    const d = tag()
    await pick(`happy couple dinner ${d}`)
    expect(visualsState.pexelsSearches[0]).toBe(`photo:happy couple dinner ${d}:square`)
  })
})
