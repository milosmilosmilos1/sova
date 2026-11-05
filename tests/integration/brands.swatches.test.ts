import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { getViewerFromRequest, type Viewer } from '@/lib/auth/viewer'
import { GET as logoGet } from '@/app/api/brands/[id]/logo/route'
import { brandLogoUrl, brandSwatch } from '@/lib/brands/swatch'
import { storeServerImage } from '@/services/visuals/store'
import { listBrandSwatches } from '@/services/brands'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Boje brendova u biraču brenda (D-137): izabrana u Vizuelnom identitetu ima prednost, zatim boja sa
 * sajta iz trenutnog profila brenda, a brend bez palete dobija rezervnu boju. Jedan upit vraća samo
 * brendove ovog radnog prostora koji nisu arhivirani.
 */
let user: TestUser
let viewer: Viewer
const workspaces: string[] = []

const colors = (primary: string) => ({
  primary,
  secondary: '#F26B1D',
  background: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
})
const profile = (primary: string) => ({
  visual: { colors: { value: { primary }, confidence: 0.9, source_urls: [] } },
})

async function workspace(name: string) {
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name, type: 'agency', brandName: name },
  })
  workspaces.push(ws.json.data!.workspaceId)
  return ws.json.data!
}

async function brand(workspaceId: string, name: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from('brands')
    .insert({ workspace_id: workspaceId, name, ...extra })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

beforeAll(async () => {
  user = await createTestUser('swatches')
  viewer = (await getViewerFromRequest(
    new NextRequest('http://localhost:3001/api/brands', {
      headers: { authorization: `Bearer ${user.token}` },
    }),
  ))!
})

afterAll(async () => {
  for (const id of workspaces) await admin.from('workspaces').delete().eq('id', id)
  await deleteTestUser(user)
})

describe('boje brendova u biraču (D-137)', () => {
  it('izabrana boja, pa boja sa sajta, pa rezervna; samo brendovi ovog prostora', async () => {
    const ws = await workspace('Agencija boja')
    const other = await workspace('Drugi prostor')
    const chosen = await admin
      .from('brands')
      .update({ design: { colors: colors('#990000') } })
      .eq('id', ws.brandId)
    expect(chosen.error).toBeNull()
    // izabrana boja pobeđuje boju sa sajta
    const first = await admin
      .from('brand_profiles')
      .insert({ brand_id: ws.brandId, version: 1, data: profile('#00AA00'), is_current: true })
    expect(first.error).toBeNull()

    const site = await brand(ws.workspaceId, 'Sa sajta')
    // stariji profil (druga boja) se ne računa, samo trenutni
    const versions = await admin.from('brand_profiles').insert([
      { brand_id: site, version: 1, data: profile('#000000'), is_current: false },
      { brand_id: site, version: 2, data: profile('#f26b1d'), is_current: true },
    ])
    expect(versions.error).toBeNull()
    const plain = await brand(ws.workspaceId, 'Bez boje')
    const archived = await brand(ws.workspaceId, 'Arhiviran', { deleted_at: new Date().toISOString() })

    const swatches = await listBrandSwatches(viewer, ws.workspaceId)
    expect(swatches[ws.brandId]).toEqual({ color: '#990000', ink: '#ffffff', logo: null })
    expect(swatches[site]?.color).toBe('#F26B1D')
    expect(swatches[plain]).toEqual(brandSwatch(plain))
    expect(swatches[archived]).toBeUndefined()
    expect(swatches[other.brandId]).toBeUndefined()
    expect(Object.keys(swatches)).toHaveLength(3)
  })

  it('tuđi radni prostor ne vraća ništa', async () => {
    const stranger = await createTestUser('swatches-stranger')
    try {
      const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
        token: stranger.token,
        body: { name: 'Tuđi prostor', type: 'business' },
      })
      workspaces.push(ws.json.data!.workspaceId)
      expect(await listBrandSwatches(viewer, ws.json.data!.workspaceId)).toEqual({})
    } finally {
      await deleteTestUser(stranger)
    }
  })
})

describe('logo u znaku brenda (D-155)', () => {
  it('kvadratan logo daje ikonicu u znaku i na putanji, širok natpis ostaje slovo', async () => {
    const ws = await workspace('Agencija logoa')
    const sharp = (await import('sharp')).default
    const square = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#0A2540' } })
      .composite([
        {
          input: await sharp({ create: { width: 120, height: 80, channels: 3, background: '#FFFFFF' } })
            .png()
            .toBuffer(),
          left: 60,
          top: 90,
        },
      ])
      .png()
      .toBuffer()
    const wide = await sharp({ create: { width: 800, height: 120, channels: 3, background: '#FFFFFF' } })
      .composite([
        {
          input: await sharp({ create: { width: 700, height: 80, channels: 3, background: '#201E1D' } })
            .png()
            .toBuffer(),
          left: 50,
          top: 20,
        },
      ])
      .png()
      .toBuffer()
    const store = (bytes: Buffer, brandId: string) =>
      storeServerImage({
        workspaceId: ws.workspaceId,
        brandId,
        bytes,
        mimeType: 'image/png',
        source: 'upload',
        folder: 'logos',
        uploadedBy: user.id,
      })
    const squareAsset = await store(square, ws.brandId)
    await admin
      .from('brands')
      .update({ design: { logoAssetId: squareAsset.id } })
      .eq('id', ws.brandId)
    const wideBrand = await brand(ws.workspaceId, 'Natpis')
    const wideAsset = await store(wide, wideBrand)
    await admin.from('brands').update({ logo_asset_id: wideAsset.id }).eq('id', wideBrand)

    const swatches = await listBrandSwatches(viewer, ws.workspaceId)
    expect(swatches[ws.brandId]!.logo).toBe(brandLogoUrl(ws.brandId, squareAsset.id))
    expect(swatches[wideBrand]!.logo).toBeNull()

    // putanja vraća PNG, pa se čita bez `call` (koji očekuje JSON)
    const get = (id: string) =>
      logoGet(
        new NextRequest(`http://localhost:3001/api/brands/${id}/logo`, {
          headers: { authorization: `Bearer ${user.token}`, origin: 'http://localhost:3001' },
        }),
        { params: Promise.resolve({ id }) },
      )
    const ok = await get(ws.brandId)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(await sharp(Buffer.from(await ok.arrayBuffer())).metadata()).toMatchObject({
      width: 96,
      height: 96,
    })
    expect((await get(wideBrand)).status).toBe(404)
  })
})
