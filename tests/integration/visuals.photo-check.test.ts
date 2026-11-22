import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { resolveDesign } from '@/services/design/brand-design'
import { pickDesignPhotos, pickGalleryPhotos } from '@/services/design/render-post'
import { downloadAsset, type MediaAssetRow } from '@/services/media'
import { pickPexelsPhotos } from '@/services/visuals/pexels'

import { enqueuePhotoChecks, geminiServer, photoCalls, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import {
  PEXELS_PHOTO_IDS,
  pexelsHandlers,
  resetVisualsState,
  unsplashHandlers,
  visualsState,
} from './visuals-mock'

/**
 * Fotografija mora da prikazuje ono o čemu je objava (D-167). Automatski izbor sa stoka (Pexels;
 * Unsplash samo po izboru korisnika, D-190) uzima samo ono čiji opis odgovara upitu i ne pominje
 * ljude, bez slanja slika modelu (D-180).
 * Iz galerije brenda Gemini ne uzima ono što temi ne pripada, a isečak ide oko glavnog predmeta.
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
const pexels = (query: string, count = 1) =>
  pickPexelsPhotos({ workspaceId: wsId, brandId, query, count, crop: 'square', uploadedBy: null, topic })
const sourceData = (asset: MediaAssetRow) =>
  asset.source_data as { photoId?: string; pexelsId?: number; focus?: { x: number; y: number } }
/** oblik iz zapisa lažne Pexels pretrage („photo:upit:oblik”) */
const orientations = () => visualsState.pexelsSearches.map((x) => x.split(':').at(-1))

describe('stok se bira po opisu, bez slanja slika modelu (D-167, D-180)', () => {
  it('automatski izbor ide na Pexels; Unsplash se ne pretražuje i ništa se ne preuzima sa njega (D-190)', async () => {
    const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
    const picked = await pickDesignPhotos({
      workspaceId: wsId,
      brandId,
      design: await resolveDesign(brand!),
      photoSource: 'stock',
      uploadedBy: null,
      topic,
      styleId: 'magazine',
      format: 'portrait',
      query: `dog eating kibble ${tag()}`,
      slides: [
        { kind: 'cover', title: 'Koliko poznaješ ishranu pasa?', body: 'Kviz' },
        { kind: 'point', title: 'Pitanje', body: 'Koliko dana traje prelazak?' },
      ],
    })
    expect(picked.photoIds.length).toBeGreaterThan(0)
    const { data: rows } = await admin.from('media_assets').select('source').in('id', picked.photoIds)
    expect((rows ?? []).map((r) => r.source)).toEqual(picked.photoIds.map(() => 'pexels'))
    expect(visualsState.unsplashSearches).toBe(0)
    expect(visualsState.unsplashDownloads).toEqual([])
    expect(visualsState.pexelsSearches.length).toBeGreaterThan(0)
  })

  it('fotografija čiji opis pominje ljude ili drugi izgled se ne uzima sa stoka', async () => {
    visualsState.pexelsAlts = {
      301: 'woman feeding her dog kibble',
      302: 'black man with a dog eating kibble',
    }
    const picked = await pexels(`dog eating kibble ${tag()}`)
    expect(picked.map((p) => sourceData(p.asset).pexelsId)).toEqual([303])
  })

  it('fotografija čiji opis ne odgovara temi se preskače; bez poklapanja nema fotografije', async () => {
    const offTopic = (ids: number[]) =>
      Object.fromEntries(ids.map((id) => [id, `city skyline at night ${id}`]))
    visualsState.pexelsAlts = offTopic([301, 302])
    const next = await pexels(`dog eating kibble ${tag()}`)
    expect(next.map((p) => sourceData(p.asset).pexelsId)).toEqual([303])

    await admin.from('media_assets').delete().eq('brand_id', brandId).eq('source', 'pexels')
    visualsState.pexelsAlts = offTopic(PEXELS_PHOTO_IDS)
    expect(await pexels(`dog eating kibble ${tag()}`)).toEqual([])
    expect(photoCalls).toHaveLength(0)
  })

  it('Pexels: po opisu, isečak po sredini, bez slanja slike modelu', async () => {
    visualsState.pexelsAlts = { 301: 'tea leaves in a cup' }
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
    expect(photoCalls).toHaveLength(0)
    const meta = await sharp(await downloadAsset(picked[0]!.asset)).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 1600])
  })
})

describe('oblik fotografije prati okvir slajda (D-169)', () => {
  it('traži se u obliku okvira, a čuva se ceo kadar', async () => {
    // okvir 2,3:1 (traka u „aurora” stilu): pretraga traži vodoravne fotografije
    const picked = await pickPexelsPhotos({
      workspaceId: wsId,
      brandId,
      query: `dog lying on grass ${tag()}`,
      count: 1,
      crop: 'square',
      uploadedBy: null,
      topic,
      frame: { aspect: 2.31 },
    })
    expect(orientations()[0]).toBe('landscape')
    expect(picked).toHaveLength(1)
    const saved = picked[0]!.asset.source_data as { crop: string }
    expect(saved.crop).toBe('full')
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
    expect(orientations()).toEqual(['landscape'])

    resetVisualsState()
    const story = await pickDesignPhotos({
      ...base,
      styleId: 'magazine',
      format: 'story',
      query: `dog on the beach ${tag()}`,
    })
    expect(story.photoIds).toHaveLength(2)
    expect(orientations()).toEqual(['portrait'])
  })
})

describe('rok za izbor fotografija u koraku od 30 s (D-171)', () => {
  /** naslovni slajd „aurora”: jedna fotografija u traci 2,3:1 */
  async function auroraCover(query: string) {
    const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
    return {
      workspaceId: wsId,
      brandId,
      design: await resolveDesign(brand!),
      photoSource: 'stock' as const,
      uploadedBy: null,
      topic,
      styleId: 'aurora' as const,
      format: 'portrait' as const,
      query,
      slides: [{ kind: 'cover' as const, title: 'Koliko poznaješ ishranu pasa?', body: 'Kviz' }],
    }
  }

  it('posle roka nema nove pretrage ni provere, a objava ide sa onim što je nađeno', async () => {
    const past = Date.now() - 1
    const base = { workspaceId: wsId, brandId, count: 1, crop: 'square' as const, uploadedBy: null, topic }
    expect(await pickPexelsPhotos({ ...base, query: `dog ${tag()}`, deadline: past })).toEqual([])
    const late = await pickDesignPhotos(await auroraCover(`dog eating kibble ${tag()}`), { deadline: past })
    expect(late.photoIds).toEqual([])
    expect(late.notes).toEqual([
      'Fotografija koja odgovara temi nije nađena, pa su slajdovi u bojama brenda.',
    ])
    expect(visualsState.unsplashSearches).toBe(0)
    expect(visualsState.pexelsSearches).toEqual([])
    expect(photoCalls).toHaveLength(0)
  })

  it('Pexels se pita samo ako do roka ima vremena za pretragu i proveru', async () => {
    const short = await pickDesignPhotos(await auroraCover(`dog ${tag()}`), { deadline: Date.now() + 2_000 })
    expect(short.photoIds).toEqual([])
    expect(visualsState.pexelsSearches).toEqual([])

    resetVisualsState()
    const enough = await pickDesignPhotos(await auroraCover(`dog ${tag()}`), {
      deadline: Date.now() + 15_000,
    })
    expect(enough.photoIds).toHaveLength(1)
    expect(visualsState.pexelsSearches.length).toBeGreaterThan(0)
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
    enqueuePhotoChecks([{ match: 'off' }, { match: 'area' }, { match: 'exact', box: [20, 30, 40, 50] }])
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
