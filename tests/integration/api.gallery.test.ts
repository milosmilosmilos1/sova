import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as flowsPost } from '@/app/api/flows/route'
import { DELETE as categoryDelete, PATCH as categoryPatch } from '@/app/api/gallery/categories/[id]/route'
import { POST as categoriesPost } from '@/app/api/gallery/categories/route'
import { POST as describePost } from '@/app/api/gallery/describe/route'
import { GET as galleryGet, PATCH as galleryPatch } from '@/app/api/gallery/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { pickGalleryPhotos } from '@/services/design/render-post'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Galerija brenda: kategorije, opisi, automatski opis, izbor fotografije i tok (D-114). */
let owner: TestUser
let viewer: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let otherWs = ''
let otherBrand = ''
const photos: Record<string, string> = {}
let templateId = ''

interface GalleryView {
  items: Array<{
    id: string
    url: string
    description: string | null
    categoryId: string | null
    tags: string[]
  }>
  categories: Array<{ id: string; name: string; count: number }>
  stats: { total: number; categories: number; described: number; missing: number; uncategorized: number }
  describePrice: number
}

function gallery(query: Record<string, string> = {}, token = owner.token) {
  return call<GalleryView>(galleryGet, '/api/gallery', { token, query: { brandId, ...query } })
}

async function asset(name: string, opts: { source?: 'upload' | 'template'; description?: string } = {}) {
  const id = crypto.randomUUID()
  const path = `ws/${wsId}/brand/${brandId}/uploads/${id}.png`
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#3366cc' } })
    .png()
    .toBuffer()
  const up = await admin.storage.from('uploads').upload(path, png, { contentType: 'image/png' })
  if (up.error) throw new Error(up.error.message)
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: wsId,
    brand_id: brandId,
    kind: 'image',
    source: opts.source ?? 'upload',
    bucket: 'uploads',
    storage_path: path,
    mime_type: 'image/png',
    size_bytes: png.length,
    width: 64,
    height: 64,
    description: opts.description ?? null,
    tags: [name],
  })
  if (error) throw new Error(error.message)
  return id
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  owner = await createTestUser('gallery')
  viewer = await createTestUser('gallery-viewer')
  other = await createTestUser('gallery-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Galerija test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const foreign = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: other.token,
    body: { name: 'Tuđa galerija', type: 'business' },
  })
  otherWs = foreign.json.data!.workspaceId
  otherBrand = foreign.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: viewer.id, role: 'viewer', all_brands: true })
  const { error } = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 50,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().in('id', [wsId, otherWs])
  await deleteTestUser(owner)
  await deleteTestUser(viewer)
  await deleteTestUser(other)
})

describe('galerija', () => {
  it('prazna galerija; tuđ brend se ne vidi', async () => {
    const r = await gallery()
    expect(r.status).toBe(200)
    expect(r.json.data!.stats).toEqual({
      total: 0,
      categories: 0,
      described: 0,
      missing: 0,
      uncategorized: 0,
    })
    expect(r.json.data!.describePrice).toBe(1)
    expect((await gallery({ brandId: otherBrand })).status).toBe(404)
  })

  it('kategorije: jedinstven naziv bez obzira na velika slova, preimenovanje, prava', async () => {
    const created = await call<{ id: string; name: string }>(categoriesPost, '/api/gallery/categories', {
      token: owner.token,
      body: { brandId, name: 'Tim' },
    })
    expect(created.status).toBe(201)
    const dup = await call(categoriesPost, '/api/gallery/categories', {
      token: owner.token,
      body: { brandId, name: ' tim ' },
    })
    expect(dup.status).toBe(409)
    const denied = await call(categoriesPost, '/api/gallery/categories', {
      token: viewer.token,
      body: { brandId, name: 'Enterijer' },
    })
    expect(denied.status).toBe(403)
    const renamed = await call<{ name: string }>(
      categoryPatch,
      `/api/gallery/categories/${created.json.data!.id}`,
      {
        token: owner.token,
        method: 'PATCH',
        params: { id: created.json.data!.id },
        body: { name: 'Naš tim' },
      },
    )
    expect(renamed.json.data!.name).toBe('Naš tim')
    const foreign = await call(categoryPatch, `/api/gallery/categories/${created.json.data!.id}`, {
      token: other.token,
      method: 'PATCH',
      params: { id: created.json.data!.id },
      body: { name: 'Otmica' },
    })
    expect(foreign.status).toBe(404)
  })

  it('fotografije: samo sopstvene, opis i kategorija u jednom čuvanju, filteri i brojači', async () => {
    photos.team = await asset('tim')
    photos.ac = await asset('klima')
    photos.office = await asset('kancelarija', { description: 'Kancelarija sa pogledom na grad' })
    templateId = await asset('slajd', { source: 'template' })
    const cats = (await gallery()).json.data!.categories
    const team = cats.find((c) => c.name === 'Naš tim')!.id

    const saved = await call<{ updated: number }>(galleryPatch, '/api/gallery', {
      token: owner.token,
      method: 'PATCH',
      body: {
        brandId,
        items: [
          { id: photos.team, description: 'Ekipa na terenu ispred kombija', categoryId: team },
          { id: photos.ac, description: 'Majstor montira klimu u dnevnoj sobi' },
        ],
      },
    })
    expect(saved.json.data!.updated).toBe(2)

    const all = (await gallery()).json.data!
    expect(all.items.map((i) => i.id).sort()).toEqual([photos.team, photos.ac, photos.office].sort())
    expect(all.items.every((i) => i.url.includes('token='))).toBe(true)
    expect(all.stats).toEqual({ total: 3, categories: 1, described: 3, missing: 0, uncategorized: 2 })
    expect(all.categories).toEqual([{ id: team, name: 'Naš tim', count: 1 }])
    expect((await gallery({ category: team })).json.data!.items.map((i) => i.id)).toEqual([photos.team])
    expect((await gallery({ category: 'none' })).json.data!.items).toHaveLength(2)

    const notGallery = await call(galleryPatch, '/api/gallery', {
      token: owner.token,
      method: 'PATCH',
      body: { brandId, items: [{ id: templateId, description: 'slajd' }] },
    })
    expect(notGallery.status).toBe(400)
    const { data: foreignCat } = await admin
      .from('gallery_categories')
      .insert({ brand_id: otherBrand, workspace_id: otherWs, name: 'Tuđa' })
      .select('id')
      .single()
    const wrongCat = await call(galleryPatch, '/api/gallery', {
      token: owner.token,
      method: 'PATCH',
      body: { brandId, items: [{ id: photos.ac, categoryId: foreignCat!.id }] },
    })
    expect(wrongCat.status).toBe(400)
    const denied = await call(galleryPatch, '/api/gallery', {
      token: viewer.token,
      method: 'PATCH',
      body: { brandId, items: [{ id: photos.ac, description: 'x' }] },
    })
    expect(denied.status).toBe(403)
  })

  it('automatski opis: slika ide modelu, opis i tagovi se čuvaju, 1 token po uspeloj slici', async () => {
    await admin.from('media_assets').update({ description: null }).in('id', [photos.ac, photos.office])
    enqueueReply(
      {
        kind: 'text',
        json: {
          description: 'Majstor montira klima uređaj na zid dnevne sobe.',
          tags: ['klima', 'majstor'],
          tags_en: ['air conditioner', 'installation'],
        },
      },
      {
        kind: 'status',
        status: 400,
        body: { error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT' } },
      },
    )
    const r = await call<{
      described: Array<{ id: string; description: string; tags: string[] }>
      failed: Array<{ id: string }>
      tokensCharged: number
    }>(describePost, '/api/gallery/describe', {
      token: owner.token,
      body: { brandId, assetIds: [photos.ac, photos.office] },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.described).toHaveLength(1)
    expect(r.json.data!.failed).toHaveLength(1)
    expect(r.json.data!.tokensCharged).toBe(1)
    const sent = JSON.stringify(calls[0]!.body)
    expect(sent).toContain('inlineData')
    expect(sent).toContain('image/jpeg')
    const described = r.json.data!.described[0]!
    const { data: row } = await admin
      .from('media_assets')
      .select('description, tags')
      .eq('id', described.id)
      .single()
    expect(row!.description).toBe('Majstor montira klima uređaj na zid dnevne sobe.')
    expect(row!.tags).toEqual(expect.arrayContaining(['klima', 'air conditioner']))
    const notGallery = await call(describePost, '/api/gallery/describe', {
      token: owner.token,
      body: { brandId, assetIds: [templateId] },
    })
    expect(notGallery.status).toBe(400)
  })

  it('izbor za objavu: kategorija toka, pa poklapanje sa temom, pa rotacija', async () => {
    const team = (await gallery()).json.data!.categories[0]!.id
    const inTeam = await pickGalleryPhotos(brandId, 'people working', 1, { categoryId: team })
    expect(inTeam.map((p) => p.id)).toEqual([photos.team])
    // bez kategorije: tema „klima” bira fotografiju sa klimom (opisi postavljeni izričito, jer
    // automatski opis iz prethodnog testa ide na sliku koja prva stigne do modela)
    await admin
      .from('media_assets')
      .update({ description: 'Majstor montira klimu u dnevnoj sobi', tags: ['klima'] })
      .eq('id', photos.ac)
    await admin
      .from('media_assets')
      .update({ description: 'Kancelarija sa pogledom na grad', tags: ['kancelarija'] })
      .eq('id', photos.office)
    const ac = await pickGalleryPhotos(brandId, 'air conditioner', 1, { topic: 'Saveti za klimu pre leta' })
    expect(ac.map((p) => p.id)).toEqual([photos.ac])
    const { data: used } = await admin
      .from('media_assets')
      .select('last_used_at')
      .eq('id', photos.ac)
      .single()
    expect(used!.last_used_at).not.toBeNull()
    // bez poklapanja: prednost ima fotografija koja nije korišćena
    const next = await pickGalleryPhotos(brandId, 'zzz', 1)
    expect(next[0]!.id).not.toBe(photos.ac)
    // šablon (slajd) nikad nije u izboru
    const many = await pickGalleryPhotos(brandId, 'slajd', 10)
    expect(many.map((p) => p.id)).not.toContain(templateId)
  })

  it('tok pamti kategoriju galerije; tuđa kategorija se odbija; brisanje kategorije je ne ruši', async () => {
    const team = (await gallery()).json.data!.categories[0]!.id
    const flow = await call<{ id: string; galleryCategoryId: string | null }>(flowsPost, '/api/flows', {
      token: owner.token,
      body: {
        brandId,
        name: 'Iza scene',
        topic: 'Ekipa na terenu',
        photoSource: 'gallery',
        galleryCategoryId: team,
        active: false,
      },
    })
    expect(flow.status).toBe(201)
    expect(flow.json.data!.galleryCategoryId).toBe(team)
    const { data: foreignCat } = await admin
      .from('gallery_categories')
      .select('id')
      .eq('brand_id', otherBrand)
      .single()
    const wrong = await call(flowsPost, '/api/flows', {
      token: owner.token,
      body: {
        brandId,
        name: 'Tuđe',
        topic: 'Tuđa kategorija',
        galleryCategoryId: foreignCat!.id,
        active: false,
      },
    })
    expect(wrong.status).toBe(400)

    const del = await call(categoryDelete, `/api/gallery/categories/${team}`, {
      token: owner.token,
      method: 'DELETE',
      params: { id: team },
    })
    expect(del.status).toBe(200)
    const after = (await gallery()).json.data!
    expect(after.stats.categories).toBe(0)
    expect(after.stats.uncategorized).toBe(3)
    const { data: flowRow } = await admin
      .from('content_flows')
      .select('gallery_category_id')
      .eq('id', flow.json.data!.id)
      .single()
    expect(flowRow!.gallery_category_id).toBeNull()
  })
})
