import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { resolveDesign } from '@/services/design/brand-design'
import { pickDesignPhotos, pickGalleryPhotos } from '@/services/design/render-post'
import { downloadAsset, type MediaAssetRow } from '@/services/media'
import { pickPexelsPhotos } from '@/services/visuals/pexels'
import { pickUnsplashPhotos } from '@/services/visuals/unsplash'

import { enqueuePhotoChecks, geminiServer, photoCalls, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Fotografija mora da prikazuje ono o čemu je objava (D-167): automatski izbor sa Unsplash-a i
 * Pexels-a uzima samo ono što provera oceni kao jasno poklapanje sa temom i upotrebljivo za objavu,
 * a isečak ide oko glavnog predmeta. Iz galerije brenda ne uzima ono što temi ne pripada.
 */
let user: TestUser
let wsId = ''
let brandId = ''

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  user = await createTestUser('photo-check')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Šapa test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(async () => {
  resetVisualsState()
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  // svaki test kreće bez stok fotografija, da izbor ne preskače one iz ranijeg testa (D-121)
  await admin.from('media_assets').delete().eq('brand_id', brandId).in('source', ['unsplash', 'pexels'])
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

// pretraga se pamti, pa svaki upit ima svoju oznaku da stigne do lažnog servisa
const tag = () => crypto.randomUUID().slice(0, 8)
const topic = 'Kviz: Koliko dobro poznaješ ishranu psa?'
const unsplash = (query: string, count = 1) =>
  pickUnsplashPhotos({ workspaceId: wsId, brandId, query, count, crop: 'square', uploadedBy: null, topic })
const sourceData = (asset: MediaAssetRow) =>
  asset.source_data as { photoId?: string; pexelsId?: number; focus?: { x: number; y: number } }

describe('fotografija prikazuje ono o čemu je objava (D-167)', () => {
  it('Unsplash: slika koja temi ne pripada se preskače; tema i upit idu u proveru; isečak ide oko psa', async () => {
    enqueuePhotoChecks([{ match: 'off' }, { match: 'exact', box: [10, 40, 30, 60] }])
    const picked = await unsplash(`dog eating kibble ${tag()}`)
    expect(picked.map((p) => sourceData(p.asset).photoId)).toEqual(['b2'])
    expect(photoCalls).toHaveLength(1)
    expect(photoCalls[0]!.text).toContain(topic)
    expect(photoCalls[0]!.text).toContain('dog eating kibble')

    // ceo kadar 1080×713 iz lažnog CDN-a, kvadrat oko psa: pas je levo od sredine, ali u kadru
    const focus = sourceData(picked[0]!.asset).focus!
    expect(focus.x).toBeCloseTo(216 / 713, 2)
    expect(focus.y).toBeCloseTo(0.5, 2)
    const meta = await sharp(await downloadAsset(picked[0]!.asset)).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 1600])
  })

  it('slika bez glavnog predmeta, slika sa tekstom i ljudi drugog izgleda se ne uzimaju sa stoka', async () => {
    enqueuePhotoChecks([{ match: 'area' }, { usable: false }, { people: 'other' }, { match: 'exact' }])
    const picked = await unsplash(`dog eating kibble ${tag()}`)
    expect(picked.map((p) => sourceData(p.asset).photoId)).toEqual(['d4'])
  })

  it('pas koji jede ide pre psa koji samo pozira, a pas bez hrane je bolji od prazne slajd-boje', async () => {
    enqueuePhotoChecks([{ match: 'subject' }, { match: 'off' }, { match: 'exact' }, { match: 'subject' }])
    const two = await unsplash(`dog eating kibble ${tag()}`, 2)
    expect(two.map((p) => sourceData(p.asset).photoId)).toEqual(['c3', 'a1'])

    resetGeminiMock()
    enqueuePhotoChecks([{ match: 'subject' }, { match: 'area' }, { match: 'off' }, { match: 'off' }])
    const one = await unsplash(`dog eating kibble ${tag()}`)
    // a1 i c3 su već uzeti (D-121), pa je prvi kandidat sada b2
    expect(one.map((p) => sourceData(p.asset).photoId)).toEqual(['b2'])
  })

  it('kad prva strana nema ništa za temu, traži se sledeća; posle tri provere bez pogotka nema fotografije', async () => {
    const off = [
      { match: 'off' as const },
      { match: 'off' as const },
      { match: 'off' as const },
      { match: 'off' as const },
    ]
    enqueuePhotoChecks(off, [{ match: 'exact' }])
    const next = await unsplash(`dog eating kibble ${tag()}`)
    expect(next.map((p) => sourceData(p.asset).photoId)).toEqual(['e5'])
    expect(photoCalls).toHaveLength(2)

    resetGeminiMock()
    enqueuePhotoChecks(off, off, off, off)
    const none = await unsplash(`dog eating kibble ${tag()}`)
    expect(none).toEqual([])
    expect(photoCalls.length).toBeLessThanOrEqual(3)
  })

  it('kad provera ne uspe, sa stoka ne prolazi slika čiji opis ne deli reč sa upitom', async () => {
    // lažni Unsplash opisuje slike kao „fotografija a1”: ništa od toga nije pas
    enqueuePhotoChecks('fail', 'fail', 'fail', 'fail', 'fail', 'fail')
    expect(await unsplash(`dog eating kibble ${tag()}`)).toEqual([])
  })

  it('Pexels: isečak oko glavnog predmeta i fokus uz fotografiju', async () => {
    enqueuePhotoChecks([{ match: 'off' }, { match: 'exact', box: [5, 40, 15, 60] }])
    const picked = await pickPexelsPhotos({
      workspaceId: wsId,
      brandId,
      query: `coffee beans ${tag()}`,
      count: 1,
      crop: 'square',
      uploadedBy: null,
      topic: 'Kafa iz Etiopije',
    })
    expect(picked.map((p) => sourceData(p.asset).pexelsId)).toEqual([302])
    expect(photoCalls[0]!.text).toContain('Kafa iz Etiopije')
    // lažni Pexels daje uspravan kadar 1200×1600: kvadrat se seče po visini, predmet ostaje levo
    const focus = sourceData(picked[0]!.asset).focus!
    expect(focus.x).toBeCloseTo(0.1, 6)
    expect(focus.y).toBeCloseTo(0.5, 6)
    const meta = await sharp(await downloadAsset(picked[0]!.asset)).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 1600])
  })
})

describe('oblik fotografije prati okvir slajda (D-169)', () => {
  it('traži se u obliku okvira, predmet koji ne staje ceo se ne uzima, a čuva se ceo kadar', async () => {
    // okvir 2,3:1 (traka u „aurora” stilu): uspravan pas preko cele visine ne staje, pas u sredini staje
    enqueuePhotoChecks([
      { match: 'exact', whole: true, box: [10, 0, 60, 100] },
      { match: 'exact', whole: true, box: [20, 30, 80, 70] },
    ])
    const picked = await pickUnsplashPhotos({
      workspaceId: wsId,
      brandId,
      query: `dog lying on grass ${tag()}`,
      count: 1,
      crop: 'square',
      uploadedBy: null,
      topic,
      frame: { aspect: 2.31 },
    })
    expect(visualsState.unsplashOrientations[0]).toBe('landscape')
    expect(picked.map((p) => sourceData(p.asset).photoId)).toEqual(['b2'])
    const saved = picked[0]!.asset.source_data as { crop: string; subject: Record<string, number> }
    expect(saved.crop).toBe('full')
    expect(saved.subject).toEqual({ left: 0.2, top: 0.3, right: 0.8, bottom: 0.7 })
    // ceo kadar, vodoravan kao original
    const meta = await sharp(await downloadAsset(picked[0]!.asset)).metadata()
    expect(meta.width! > meta.height!).toBe(true)
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2000)
  })

  it('objava bira oblik po stilu: traka u „aurora” traži vodoravnu, priča preko celog kadra uspravnu', async () => {
    const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
    const design = await resolveDesign(brand!)
    const base = {
      workspaceId: wsId,
      brandId,
      design,
      photoSource: 'stock' as const,
      uploadedBy: null,
      topic,
      slides: [
        { kind: 'cover' as const, title: 'Koliko poznaješ ishranu pasa?', body: 'Kviz' },
        { kind: 'point' as const, title: 'Pitanje', body: 'Koliko dana traje prelazak?' },
      ],
    }
    const aurora = await pickDesignPhotos({
      ...base,
      styleId: 'aurora',
      format: 'portrait',
      query: `dog eating kibble ${tag()}`,
    })
    expect(aurora.photoIds).toHaveLength(1)
    expect(visualsState.unsplashOrientations).toEqual(['landscape'])

    resetVisualsState()
    const story = await pickDesignPhotos({
      ...base,
      styleId: 'magazine',
      format: 'story',
      query: `dog portrait ${tag()}`,
    })
    expect(story.photoIds).toHaveLength(2)
    expect(visualsState.unsplashOrientations).toEqual(['portrait'])
  })
})

describe('galerija brenda (D-167)', () => {
  async function upload(name: string, createdAt: string): Promise<string> {
    const id = crypto.randomUUID()
    const path = `ws/${wsId}/brand/${brandId}/uploads/${id}.png`
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#3366cc' } })
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
      width: 64,
      height: 48,
      tags: [name],
      source_data: { uploadedFrom: 'test' },
      created_at: createdAt,
    })
    if (error) throw new Error(error.message)
    return id
  }

  it('ono što temi ne pripada se ne uzima, jasno poklapanje ide napred, a ljudi se na fotografijama brenda ne gledaju', async () => {
    const dog = await upload('a', '2026-11-01T10:00:00Z')
    const bowl = await upload('b', '2026-11-01T11:00:00Z')
    const cat = await upload('c', '2026-11-01T12:00:00Z')
    // bez poklapanja opisa redosled je od najnovije: mačka, činija, pas
    enqueuePhotoChecks([
      { match: 'off' },
      { match: 'area' },
      { match: 'exact', people: 'other', box: [20, 30, 40, 50] },
    ])
    const picked = await pickGalleryPhotos(brandId, 'dog eating kibble', 2, { topic })
    expect(picked.map((p) => p.id)).toEqual([dog, bowl])
    expect(photoCalls[0]!.images).toBe(3)

    const { data: rows } = await admin
      .from('media_assets')
      .select('id, source_data, last_used_at')
      .in('id', [dog, bowl, cat])
    const byId = new Map(rows!.map((r) => [r.id, r]))
    // fokus i okvir predmeta se pamte uz fotografiju, a ono što je već bilo u source_data ostaje
    const saved = byId.get(dog)!.source_data as {
      uploadedFrom: string
      focus: { x: number; y: number }
      subject: Record<string, number>
    }
    expect(saved.uploadedFrom).toBe('test')
    expect(saved.focus.x).toBeCloseTo(0.3, 6)
    expect(saved.focus.y).toBeCloseTo(0.4, 6)
    expect(saved.subject).toEqual({ left: 0.2, top: 0.3, right: 0.4, bottom: 0.5 })
    expect(byId.get(dog)!.last_used_at).not.toBeNull()
    expect(byId.get(bowl)!.last_used_at).not.toBeNull()
    expect(byId.get(cat)!.last_used_at).toBeNull()
  })
})
