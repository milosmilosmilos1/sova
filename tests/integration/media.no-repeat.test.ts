import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { resolveDesign } from '@/services/design/brand-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'
import { pickUnsplashPhotos } from '@/services/visuals/unsplash'

import { geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, pexelsVideo, resetVisualsState, unsplashHandlers } from './visuals-mock'

/**
 * Fotografije i snimci se ne ponavljaju (D-121): u jednom karuselu svaki slajd ima drugu
 * fotografiju, a sledeće objave istog brenda ne dobijaju ono što je brend već dobio.
 * Lažni Unsplash ima tri strane po četiri fotografije, Pexels tri fotografije.
 */
let user: TestUser
let wsId = ''
let brandId = ''

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('norepeat')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Bez ponavljanja', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetGeminiMock()
  resetVisualsState()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

const ctx = () => ({ workspaceId: wsId, brandId, uploadedBy: null })

/** Oznake fotografija i snimaka sa Unsplash-a i Pexels-a koje brend već ima. */
async function stockRefs(): Promise<string[]> {
  const { data } = await admin
    .from('media_assets')
    .select('source, source_data')
    .eq('brand_id', brandId)
    .in('source', ['unsplash', 'pexels'])
  return (data ?? []).map((a) => {
    const d = a.source_data as { photoId?: string; pexelsId?: number; kind?: string }
    return a.source === 'unsplash' ? `u:${d.photoId}` : `p:${d.kind}:${d.pexelsId}`
  })
}

describe('fotografije i snimci bez ponavljanja', () => {
  it('karusel u stilu sa fotografijom na svakom slajdu: pet slajdova, pet različitih fotografija', async () => {
    const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
    const design = await resolveDesign(brand!)
    const slides = [
      { kind: 'cover' as const, title: 'Pet saveta za jutarnju kafu', body: 'Kratak vodič.' },
      { kind: 'point' as const, title: 'Sveže mleveno zrno', body: 'Melje se pred kuvanje.' },
      { kind: 'point' as const, title: 'Prava temperatura vode', body: 'Između 90 i 96 stepeni.' },
      { kind: 'point' as const, title: 'Čista oprema', body: 'Svake nedelje.' },
      { kind: 'cta' as const, title: 'Svratite na degustaciju', body: 'Subotom od 10.' },
    ]
    const rendered = await renderDesignSlides({
      ...ctx(),
      design,
      styleId: 'magazine',
      format: 'portrait',
      slides,
      photoSource: 'stock',
      query: 'coffee morning',
    })
    expect(rendered.assetIds).toHaveLength(5)
    expect(rendered.photoIds).toHaveLength(5)
    const { data: assets } = await admin
      .from('media_assets')
      .select('id, source_data')
      .in('id', rendered.assetIds)
    const used = (assets ?? []).map((a) => (a.source_data as { photoAssetId: string | null }).photoAssetId)
    expect(used.every(Boolean)).toBe(true)
    expect(new Set(used).size).toBe(5)
  })

  it('sledeće objave ne dobijaju fotografije koje je brend već dobio; kad ih nema, ne vraćaju stare', async () => {
    const before = await stockRefs()
    const picked: string[] = []
    for (let i = 0; i < 6; i++) {
      const batch = await pickUnsplashPhotos({ ...ctx(), query: 'coffee', count: 3, crop: 'square' })
      picked.push(...batch.map((p) => `u:${(p.asset.source_data as { photoId: string }).photoId}`))
      if (!batch.length) break
    }
    for (let i = 0; i < 3; i++) {
      const batch = await pickPexelsPhotos({ ...ctx(), query: 'coffee', count: 2, crop: 'square' })
      picked.push(...batch.map((p) => `p:photo:${(p.asset.source_data as { pexelsId: number }).pexelsId}`))
      if (!batch.length) break
    }
    expect(picked.length).toBeGreaterThan(0)
    expect(new Set(picked).size).toBe(picked.length)
    expect(picked.filter((r) => before.includes(r))).toEqual([])
    // sve je potrošeno: nova pretraga ne vraća ništa umesto stare fotografije
    expect(await pickUnsplashPhotos({ ...ctx(), query: 'coffee', count: 1, crop: 'square' })).toEqual([])
    expect(await pickPexelsPhotos({ ...ctx(), query: 'coffee', count: 1, crop: 'square' })).toEqual([])
  })

  it('snimak se ne ponavlja: dva različita kratka snimka, pa nijedan umesto starog', async () => {
    // dva kratka uspravna snimka (101 i 303) i jedan predug (202)
    geminiServer.use(
      http.get('https://api.pexels.com/videos/search', () =>
        HttpResponse.json({ videos: [pexelsVideo(101), pexelsVideo(202), pexelsVideo(303)] }),
      ),
    )
    const first = await pickPexelsVideo({ ...ctx(), query: 'barista', orientation: 'portrait' })
    const second = await pickPexelsVideo({ ...ctx(), query: 'barista latte', orientation: 'portrait' })
    const id = (v: typeof first) => (v!.asset.source_data as { pexelsId: number }).pexelsId
    expect(id(first)).toBe(101)
    expect(id(second)).toBe(303)
    expect(await pickPexelsVideo({ ...ctx(), query: 'barista', orientation: 'portrait' })).toBeNull()
  })
})
