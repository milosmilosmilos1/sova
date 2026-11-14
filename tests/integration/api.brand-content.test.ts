import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { DELETE as itemDelete, PATCH as itemPatch } from '@/app/api/brands/[id]/content/[list]/[itemId]/route'
import { POST as listPost } from '@/app/api/brands/[id]/content/[list]/route'
import { GET as contentGet, PATCH as contentPatch } from '@/app/api/brands/[id]/content/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import type { BrandContentView } from '@/services/brand-content'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Sadržaj brenda (D-165): utisci klijenata, tim i parovi pre i posle u `brands.settings.content`.
 * Proverava prava (pregled vs uređivanje, tuđ brend), fotografije samo iz biblioteke brenda, punu listu
 * i da upis ne briše ostala podešavanja brenda.
 */
let owner: TestUser
let viewer: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let otherWs = ''
let otherBrand = ''

async function image(ws: string, brand: string | null) {
  const id = crypto.randomUUID()
  const path = `ws/${ws}/brand/${brand ?? 'none'}/uploads/${id}.png`
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#cc6633' } })
    .png()
    .toBuffer()
  const up = await admin.storage.from('uploads').upload(path, png, { contentType: 'image/png' })
  if (up.error) throw new Error(up.error.message)
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: ws,
    brand_id: brand,
    kind: 'image',
    source: 'upload',
    bucket: 'uploads',
    storage_path: path,
    mime_type: 'image/png',
    size_bytes: png.length,
    width: 32,
    height: 32,
  })
  if (error) throw new Error(error.message)
  return id
}

const get = (token = owner.token, id = brandId) =>
  call<BrandContentView>(contentGet, `/api/brands/${id}/content`, { token, params: { id } })

const add = (list: string, body: unknown, token = owner.token) =>
  call<BrandContentView>(listPost, `/api/brands/${brandId}/content/${list}`, {
    token,
    body,
    params: { id: brandId, list },
  })

const edit = (list: string, itemId: string, body: unknown, token = owner.token) =>
  call<BrandContentView>(itemPatch, `/api/brands/${brandId}/content/${list}/${itemId}`, {
    token,
    body,
    method: 'PATCH',
    params: { id: brandId, list, itemId },
  })

const remove = (list: string, itemId: string, token = owner.token) =>
  call<BrandContentView>(itemDelete, `/api/brands/${brandId}/content/${list}/${itemId}`, {
    token,
    method: 'DELETE',
    params: { id: brandId, list, itemId },
  })

const review = {
  author: 'Marija P.',
  detail: 'vlasnica stana na Vračaru',
  text: 'Majstori su došli na vreme, završili za dve nedelje i ostavili čisto.',
  rating: 5,
  source: 'google',
  date: '2026-10-02',
}

async function settings(): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from('brands').select('settings').eq('id', brandId).single()
  if (error) throw new Error(error.message)
  return (data.settings ?? {}) as Record<string, unknown>
}

beforeAll(async () => {
  owner = await createTestUser('content')
  viewer = await createTestUser('content-viewer')
  other = await createTestUser('content-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Sadržaj brenda test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const foreign = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: other.token,
    body: { name: 'Tuđe vrste objava', type: 'business' },
  })
  otherWs = foreign.json.data!.workspaceId
  otherBrand = foreign.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: viewer.id, role: 'viewer', all_brands: true })
  // drugo podešavanje brenda koje upis sadržaja ne sme da pregazi
  const current = await settings()
  await admin
    .from('brands')
    .update({ settings: { ...current, testMarker: 'ostaje' } })
    .eq('id', brandId)
})

afterEach(() => {
  resetMemoryRateLimit()
})

afterAll(async () => {
  await admin.from('workspaces').delete().in('id', [wsId, otherWs])
  await deleteTestUser(owner)
  await deleteTestUser(viewer)
  await deleteTestUser(other)
})

describe('vrste objava brenda', () => {
  it('prazno na početku: sve vrste automatski, vlasnik može da menja, tuđ brend se ne vidi', async () => {
    const r = await get()
    expect(r.status).toBe(200)
    expect(r.json.data).toEqual({
      kinds: { review: 'auto', before_after: 'auto', team: 'auto', interactive: 'auto', humor: 'auto' },
      testimonials: [],
      team: [],
      pairs: [],
      canEdit: true,
    })
    expect((await get(viewer.token)).json.data!.canEdit).toBe(false)
    expect((await get(owner.token, otherBrand)).status).toBe(404)
    expect((await get(other.token)).status).toBe(404)
  })

  it('utisak: dodavanje, izmena čuva id i datum unosa, brisanje, ostala podešavanja ostaju', async () => {
    const created = await add('testimonials', review)
    expect(created.status).toBe(200)
    const item = created.json.data!.testimonials[0]!
    expect(item).toMatchObject({ ...review, usedAt: null })
    expect(item.id).toMatch(/^[a-z0-9]{10}$/)

    const second = await add('testimonials', { author: 'Jovan', text: 'Brzo, čisto i po dogovorenoj ceni.' })
    const list = second.json.data!.testimonials
    expect(list.map((t) => t.author)).toEqual(['Jovan', 'Marija P.'])
    expect(list[0]).toMatchObject({ source: 'direct', rating: null, detail: null, date: null })

    const changed = await edit('testimonials', item.id, {
      ...review,
      rating: 4,
      text: `${review.text} Preporuka!`,
    })
    expect(changed.status).toBe(200)
    const after = changed.json.data!.testimonials.find((t) => t.id === item.id)!
    expect(after).toMatchObject({ rating: 4, createdAt: item.createdAt })
    expect(after.text.endsWith('Preporuka!')).toBe(true)

    const removed = await remove('testimonials', item.id)
    expect(removed.json.data!.testimonials.map((t) => t.author)).toEqual(['Jovan'])
    const again = await remove('testimonials', item.id)
    expect(again.status).toBe(404)
    expect(again.json.error!.code).toBe('NOT_FOUND')

    expect((await settings()).testMarker).toBe('ostaje')
  })

  it('neispravan unos i nepoznata lista daju grešku validacije', async () => {
    const short = await add('testimonials', { author: 'A', text: 'Kratko' })
    expect(short.status).toBe(400)
    expect(short.json.error!.code).toBe('VALIDATION')
    expect((await add('reviews', review)).status).toBe(400)
    expect((await edit('testimonials', 'NIJE-ID', review)).status).toBe(400)
  })

  it('pregled sme da čita, ali ne i da menja', async () => {
    const denied = await add('testimonials', review, viewer.token)
    expect(denied.status).toBe(403)
    const kinds = await call(contentPatch, `/api/brands/${brandId}/content`, {
      token: viewer.token,
      method: 'PATCH',
      body: { kinds: { humor: 'off' } },
      params: { id: brandId },
    })
    expect(kinds.status).toBe(403)
  })

  it('prekidači: uključeno, isključeno i povratak na automatski', async () => {
    const patch = (kinds: Record<string, string>) =>
      call<BrandContentView>(contentPatch, `/api/brands/${brandId}/content`, {
        token: owner.token,
        method: 'PATCH',
        body: { kinds },
        params: { id: brandId },
      })
    const set = await patch({ interactive: 'on', humor: 'off' })
    expect(set.status).toBe(200)
    expect(set.json.data!.kinds).toMatchObject({ interactive: 'on', humor: 'off', review: 'auto' })
    const back = await patch({ humor: 'auto' })
    expect(back.json.data!.kinds).toMatchObject({ interactive: 'on', humor: 'auto' })
    expect((await patch({ humor: 'yes' })).status).toBe(400)
    const stored = (await settings()).content as { kinds: Record<string, boolean> }
    expect(stored.kinds).toEqual({ interactive: true })
  })

  it('tim i pre i posle: samo slike iz biblioteke ovog brenda, sa potpisanim adresama', async () => {
    const own = await image(wsId, brandId)
    const shared = await image(wsId, null)
    const foreign = await image(otherWs, otherBrand)

    const member = await add('team', { name: 'Nikola', role: 'Keramičar', photoAssetId: own })
    expect(member.status).toBe(200)
    expect(member.json.data!.team[0]).toMatchObject({ name: 'Nikola', photoAssetId: own })
    expect(member.json.data!.team[0]!.photoUrl).toMatch(/^https?:\/\//)

    const noPhoto = await add('team', { name: 'Ana', role: 'Vlasnica' })
    expect(noPhoto.json.data!.team[0]).toMatchObject({ name: 'Ana', photoAssetId: null, photoUrl: null })

    const stolen = await add('team', { name: 'Tuđa', role: 'Uloga', photoAssetId: foreign })
    expect(stolen.status).toBe(400)
    expect(stolen.json.error!.code).toBe('VALIDATION')

    const pair = await add('pairs', { title: 'Kupatilo, Vračar', beforeAssetId: own, afterAssetId: shared })
    expect(pair.status).toBe(200)
    const saved = pair.json.data!.pairs[0]!
    expect(saved.beforeUrl).toMatch(/^https?:\/\//)
    expect(saved.afterUrl).toMatch(/^https?:\/\//)

    const badPair = await add('pairs', { title: 'Tuđe', beforeAssetId: own, afterAssetId: foreign })
    expect(badPair.status).toBe(400)
    const badEdit = await edit('pairs', saved.id, {
      title: 'Tuđe',
      beforeAssetId: foreign,
      afterAssetId: own,
    })
    expect(badEdit.status).toBe(400)
    expect((await get()).json.data!.pairs[0]!.beforeAssetId).toBe(own)
  })

  it('puna lista odbija novu stavku', async () => {
    const current = await settings()
    const content = (current.content ?? {}) as Record<string, unknown>
    const full = Array.from({ length: 100 }, (_, i) => ({
      ...review,
      id: `full${String(i).padStart(6, '0')}`,
      createdAt: '2026-11-14T10:00:00.000Z',
      usedAt: null,
    }))
    await admin
      .from('brands')
      .update({ settings: { ...current, content: { ...content, testimonials: full } } })
      .eq('id', brandId)
    const r = await add('testimonials', review)
    expect(r.status).toBe(403)
    expect(r.json.error!.code).toBe('PLAN_LIMIT')
    expect((await get()).json.data!.testimonials).toHaveLength(100)
  })
})
