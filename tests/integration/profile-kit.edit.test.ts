import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as applyPost } from '@/app/api/brands/[id]/profile-kit/apply/route'
import { PATCH as biosPatch } from '@/app/api/brands/[id]/profile-kit/bios/route'
import { PATCH as extrasPatch } from '@/app/api/brands/[id]/profile-kit/extras/route'
import { GET as kitGet } from '@/app/api/brands/[id]/profile-kit/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Izmena i primena tekstova za profile (D-166): opisi i dodaci se menjaju u granicama mreža, menja ih
 * samo urednik, a opis se upisuje na Google poslovni profil; ostale mreže dobijaju stranu za izmenu.
 */
let owner: TestUser
let viewer: TestUser
let wsId = ''
let brandId = ''
const LOCATION = '4455667788'
const gbp: { calls: Array<{ url: string; body: unknown }>; status: number } = { calls: [], status: 200 }

const bios = {
  instagram: { name: 'Šapa', short: 'Hrana za pse i mačke 🐾' },
  facebook: {
    short: 'Prodavnica hrane za ljubimce.',
    long: 'Specijalizovana prodavnica hrane za pse i mačke.',
  },
  linkedin: { short: 'Hrana za ljubimce', long: 'O nama.', keywords: ['hrana za pse', 'BARF'] },
  tiktok: { name: 'Šapa', short: 'Psi i hrana' },
  x: { name: 'Šapa', short: 'Hrana za ljubimce' },
  youtube: { long: 'Saveti o ishrani pasa.', keywords: ['psi'] },
  pinterest: { name: 'Šapa', long: 'Ideje za ishranu pasa.' },
  google_business: { long: 'Prodavnica hrane za pse i mačke u Beogradu.' },
}
const extras = {
  pinterest_boards: [{ name: 'Ishrana štenaca', description: 'Saveti za prve mesece.' }],
  youtube_playlists: [{ title: 'BARF ishrana', description: 'Sve o sirovoj ishrani.' }],
  youtube_trailer: { hook: 'Šta jede vaš pas?', script: 'Kratak scenario.', cta: 'Pretplatite se.' },
  google_services: [{ name: 'Dostava', description: 'Dostava na kućnu adresu.' }],
  ice_breakers: [{ question: 'Koju hranu preporučujete?', answer: 'Zavisi od rase i uzrasta.' }],
  pinned_posts: [{ title: 'Dobrodošli', why: 'Prvi utisak.', text: 'Mi smo Šapa i Šargarepa.' }],
}

const get = (token = owner.token) =>
  call<ProfileKitView>(kitGet, `/api/brands/${brandId}/profile-kit`, { token, params: { id: brandId } })
const patchBio = (platform: string, entry: Record<string, unknown>, token = owner.token) =>
  call<ProfileKitView>(biosPatch, `/api/brands/${brandId}/profile-kit/bios`, {
    token,
    method: 'PATCH',
    body: { platform, entry },
    params: { id: brandId },
  })
const patchExtras = (next: unknown, token = owner.token) =>
  call<ProfileKitView>(extrasPatch, `/api/brands/${brandId}/profile-kit/extras`, {
    token,
    method: 'PATCH',
    body: { extras: next },
    params: { id: brandId },
  })
const apply = (platform: string, token = owner.token) =>
  call<ProfileKitView>(applyPost, `/api/brands/${brandId}/profile-kit/apply`, {
    token,
    body: { platform },
    params: { id: brandId },
  })

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(
    http.patch(
      'https://mybusinessbusinessinformation.googleapis.com/v1/locations/:id',
      async ({ request }) => {
        gbp.calls.push({ url: request.url, body: await request.json() })
        if (gbp.status !== 200)
          return HttpResponse.json(
            { error: { code: gbp.status, message: 'denied', status: 'PERMISSION_DENIED' } },
            { status: gbp.status },
          )
        return HttpResponse.json({ name: `locations/${LOCATION}` })
      },
    ),
  )
  owner = await createTestUser('kit-edit')
  viewer = await createTestUser('kit-edit-viewer')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Profili izmena', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: viewer.id, role: 'viewer', all_brands: true })
  const e = encryptSecret('gbp-token', `social:${brandId}:google_business:${LOCATION}`)
  const { error } = await admin.from('social_accounts').insert({
    brand_id: brandId,
    workspace_id: wsId,
    platform: 'google_business',
    external_id: LOCATION,
    external_parent_id: '998877',
    name: 'Šapa lokacija',
    account_type: 'google_business_location',
    status: 'active',
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
    access_token_enc: toPgBytea(e.ciphertext),
    key_version: e.keyVersion,
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetMemoryRateLimit()
  gbp.calls = []
  gbp.status = 200
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(owner)
  await deleteTestUser(viewer)
})

describe('izmena i primena tekstova za profile', () => {
  it('bez napravljenih opisa nema šta da se menja', async () => {
    const r = await patchBio('instagram', { short: 'Nov bio' })
    expect(r.status).toBe(400)
    expect(r.json.error!.message).toBe('Prvo napravite opise profila, pa ih menjajte.')
  })

  it('opis jedne mreže: samo polja koja mreža ima, u njenim granicama; pregled menja samo urednik', async () => {
    const { data } = await admin.from('brands').select('settings').eq('id', brandId).single()
    await admin
      .from('brands')
      .update({
        settings: {
          ...(data!.settings as object),
          profileKit: {
            bios,
            biosAt: '2026-11-16T10:00:00.000Z',
            extras,
            extrasAt: '2026-11-16T10:00:00.000Z',
          },
        },
      })
      .eq('id', brandId)

    const saved = await patchBio('instagram', {
      name: '  Šapa i Šargarepa ',
      short: 'Sve za pse 🐶',
      long: 'ignoriše se',
    })
    expect(saved.status).toBe(200)
    expect(saved.json.data!.bios!.instagram).toEqual({ name: 'Šapa i Šargarepa', short: 'Sve za pse 🐶' })
    // ostale mreže i dodaci ostaju
    expect(saved.json.data!.bios!.facebook).toEqual(bios.facebook)
    expect(saved.json.data!.extras).toEqual(extras)

    const long = await patchBio('instagram', { short: 'a'.repeat(151) })
    expect(long.status).toBe(400)
    expect(long.json.error!.message).toBe('Tekst je duži od 150 znakova, koliko mreža dozvoljava.')
    const words = await patchBio('youtube', { keywords: Array.from({ length: 16 }, (_, i) => `rec ${i}`) })
    expect(words.status).toBe(400)
    const link = await patchBio('google_business', { long: 'Posetite www.sapa.rs za ponudu.' })
    expect(link.json.error!.message).toBe('Google ne dozvoljava linkove u opisu profila.')
    expect((await patchBio('instagram', { short: 'Bio' }, viewer.token)).status).toBe(403)
  })

  it('dodaci: izmena jedne stavke, granice i bez linkova u uslugama na Google profilu', async () => {
    const next = structuredClone(extras)
    next.pinterest_boards[0]!.name = 'Ishrana štenaca do godinu dana'
    const saved = await patchExtras(next)
    expect(saved.status).toBe(200)
    expect(saved.json.data!.extras!.pinterest_boards[0]!.name).toBe('Ishrana štenaca do godinu dana')

    const tooMany = structuredClone(extras)
    tooMany.pinterest_boards = Array.from({ length: 6 }, (_, i) => ({ name: `Tabla ${i}`, description: '' }))
    expect((await patchExtras(tooMany)).status).toBe(400)
    const withLink = structuredClone(extras)
    withLink.google_services[0]!.description = 'Naručite na https://sapa.rs'
    const r = await patchExtras(withLink)
    expect(r.json.error!.message).toBe('Google ne dozvoljava linkove u opisu usluge.')
    expect((await patchExtras(extras, viewer.token)).status).toBe(403)
  })

  it('primena: opis ide na Google profil, ostale mreže dobijaju stranu za izmenu', async () => {
    const view = (await get()).json.data!
    expect(view.live).toEqual(['google_business'])
    expect(view.editLinks.instagram).toBe('https://www.instagram.com/accounts/edit/')
    expect(view.editLinks).not.toHaveProperty('x')
    expect(view.applied).toEqual({})

    const r = await apply('google_business')
    expect(r.status).toBe(200)
    expect(gbp.calls).toHaveLength(1)
    expect(gbp.calls[0]!.url).toBe(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${LOCATION}?updateMask=profile.description`,
    )
    expect(gbp.calls[0]!.body).toEqual({ profile: { description: bios.google_business.long } })
    expect(r.json.data!.applied.google_business).toBeTruthy()

    // izmenjen opis više nije onaj koji je upisan
    const edited = await patchBio('google_business', {
      long: 'Hrana za pse i mačke u Beogradu, sa dostavom.',
    })
    expect(edited.json.data!.applied.google_business).toBeUndefined()

    const ig = await apply('instagram')
    expect(ig.status).toBe(400)
    expect(ig.json.error!.message).toBe(
      'Ova mreža ne dozvoljava da Sova sama menja opis profila. Kopirajte tekst i nalepite ga na profilu.',
    )
    expect((await apply('google_business', viewer.token)).status).toBe(403)
  })

  it('Google odbije izmenu (pristup API-ju nije odobren): jasna poruka, ništa se ne beleži', async () => {
    gbp.status = 403
    const r = await apply('google_business')
    expect(r.status).toBe(502)
    expect(r.json.error!.message).toContain('Google je odbio izmenu')
    expect((await get()).json.data!.applied.google_business).toBeUndefined()
  })
})
