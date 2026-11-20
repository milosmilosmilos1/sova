import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as regeneratePost } from '@/app/api/approvals/[id]/regenerate/route'
import { POST as createPost } from '@/app/api/brands/[id]/templates/route'
import { POST as previewPost } from '@/app/api/brands/[id]/templates/preview/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'

import { admin, call, completeBrand, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Šabloni koje biznis popunjava sam (D-175): pregled i nacrt bez AI-ja i tokena, fotografije samo
 * iz biblioteke brenda, tekst tačno kako je upisan, objava se ne generiše ponovo i ne pravi se za
 * nepotpun brend.
 */
let owner: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let otherWs = ''
let otherBrand = ''
const workspaces: string[] = []

async function workspaceFor(user: TestUser, name: string) {
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name, type: 'business' },
  })
  workspaces.push(ws.json.data!.workspaceId)
  return ws.json.data!
}

async function image(ws: string, brand: string | null, color = '#cc6633') {
  const id = crypto.randomUUID()
  const path = `ws/${ws}/brand/${brand ?? 'none'}/uploads/${id}.png`
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: color } })
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
    width: 64,
    height: 48,
  })
  if (error) throw new Error(error.message)
  return id
}

const preview = (body: Record<string, unknown>, token = owner.token, brand = brandId) =>
  call<{ slides: string[]; caption: string; title: string }>(
    previewPost,
    `/api/brands/${brand}/templates/preview`,
    {
      token,
      params: { id: brand },
      body,
    },
  )

const create = (body: Record<string, unknown>, token = owner.token) =>
  call<{ postId: string; targets: number; notes: string[] }>(createPost, `/api/brands/${brandId}/templates`, {
    token,
    params: { id: brandId },
    body,
  })

beforeAll(async () => {
  owner = await createTestUser('tpl')
  other = await createTestUser('tpl-other')
  ;({ workspaceId: wsId, brandId } = await workspaceFor(owner, 'Šabloni'))
  ;({ workspaceId: otherWs, brandId: otherBrand } = await workspaceFor(other, 'Tuđi šabloni'))
  await completeBrand(brandId)
})

afterAll(async () => {
  for (const id of workspaces) await admin.from('workspaces').delete().eq('id', id)
  await deleteTestUser(owner)
  await deleteTestUser(other)
})

describe('šabloni koje biznis popunjava (D-175)', () => {
  it('pregled: slajdovi kao JPEG i predlog opisa od upisanih podataka; neispravan unos daje polja', async () => {
    const r = await preview({
      templateId: 'poll',
      format: 'image',
      values: { question: 'Kafa ili čaj?', options: ['Kafa', 'Čaj'] },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.slides).toHaveLength(1)
    expect(r.json.data!.slides[0]!.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(r.json.data!.caption).toContain('1. Kafa\n2. Čaj')

    const bad = await preview({
      templateId: 'quiz',
      format: 'carousel',
      values: { question: 'X?', answers: ['A'] },
    })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.json.error!.fields ?? {})).toEqual(expect.arrayContaining(['answers', 'correct']))
    // oblik koji šablon nema
    expect((await preview({ templateId: 'faq', format: 'image', values: {} })).status).toBe(400)
    // tuđ brend se ne vidi
    expect((await preview({ templateId: 'poll', format: 'image', values: {} }, other.token)).status).toBe(404)
  })

  it('nacrt: slajdovi u biblioteci, opis koji je korisnik izmenio, bez tokena; ne generiše se ponovo', async () => {
    const photo = await image(wsId, brandId)
    const caption = 'Ovo je Marko, naš majstor. Pozovite nas.'
    const r = await create({
      templateId: 'team',
      format: 'carousel',
      values: { photo, name: 'Marko', role: 'majstor za klime', bio: 'Radi kod nas od 2018.' },
      caption,
    })
    expect(r.status).toBe(200)
    const { data: post } = await admin
      .from('posts')
      .select('status, master_text, source, title, design, post_media(sort_order, media_asset_id)')
      .eq('id', r.json.data!.postId)
      .single()
    expect(post).toMatchObject({
      status: 'draft',
      master_text: caption,
      source: 'manual',
      title: 'Upoznajte tim: Marko',
    })
    expect(post!.post_media).toHaveLength(3) // osoba, priča, poziv
    const design = post!.design as {
      fillTemplate: string
      ownPhotos: boolean
      copy: { photoAssetIds: string[] }
    }
    expect(design).toMatchObject({ fillTemplate: 'team', ownPhotos: true })
    expect(design.copy.photoAssetIds).toEqual([photo])
    // bez tokena i bez AI poziva
    const { count } = await admin
      .from('ai_generations')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
    expect(count).toBe(0)

    const again = await call(regeneratePost, `/api/approvals/${r.json.data!.postId}/regenerate`, {
      token: owner.token,
      params: { id: r.json.data!.postId },
      body: { version: 1 },
    })
    expect(again.status).toBe(400)
    expect(again.json.error!.message).toContain('šablona')
  })

  it('pre i posle kao jedna slika: spoj dve fotografije sačuvan u biblioteci, levo pre, desno posle', async () => {
    const before = await image(wsId, brandId, '#333333')
    const after = await image(wsId, brandId, '#eeeeee')
    const r = await create({
      templateId: 'before_after',
      format: 'image',
      values: { before, after, title: 'Kupatilo, Vračar' },
    })
    expect(r.status).toBe(200)
    const { data: composites } = await admin
      .from('media_assets')
      .select('id, source_data, width, height')
      .eq('brand_id', brandId)
      .contains('tags', ['before-after'])
    expect(composites).toHaveLength(1)
    expect((composites![0]!.source_data as { composite: string[] }).composite).toEqual([before, after])
    const { data: post } = await admin
      .from('posts')
      .select('master_text')
      .eq('id', r.json.data!.postId)
      .single()
    expect(post!.master_text).toContain('Levo je stanje pre, desno posle.')
  })

  it('fotografija tuđeg brenda se odbija; posmatrač ne pravi nacrt', async () => {
    const foreign = await image(otherWs, otherBrand)
    const r = await create({
      templateId: 'launch',
      format: 'image',
      values: { photo: foreign, name: 'Nova klima', description: 'Tiša i štedljivija.' },
    })
    expect(r.status).toBe(400)
    expect(r.json.error!.message).toContain('galerije ovog brenda')

    await admin
      .from('workspace_members')
      .insert({ workspace_id: wsId, user_id: other.id, role: 'viewer', all_brands: true })
    const viewer = await create(
      {
        templateId: 'announcement',
        format: 'image',
        values: { title: 'Praznici', text: 'Ne radimo 1. januara.' },
      },
      other.token,
    )
    expect(viewer.status).toBe(403)
  })

  it('nepotpun brend: šablon se ne crta (D-174)', async () => {
    process.env.SOVA_BRAND_GATE = 'on'
    try {
      const r = await preview(
        { templateId: 'poll', format: 'image', values: { question: 'Da li?', options: ['Da', 'Ne'] } },
        other.token,
        otherBrand,
      )
      expect(r.status).toBe(409)
      expect(r.json.error!.code).toBe('SETUP_INCOMPLETE')
    } finally {
      process.env.SOVA_BRAND_GATE = 'off'
    }
  })
})
