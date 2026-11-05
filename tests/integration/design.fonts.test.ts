import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DELETE as fontDelete, POST as fontPost } from '@/app/api/brands/[id]/design/fonts/route'
import { GET as looksGet } from '@/app/api/brands/[id]/design/looks/route'
import { PATCH as designPatch } from '@/app/api/brands/[id]/design/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader, loadFonts } from '@/lib/visuals/fonts'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Sopstveni font brenda (D-159): otpremljen WOFF se čuva u skladištu i crta pod porodicom „Custom <id>”,
 * pojavljuje se prvi u izboru fonta, a WOFF2 i fajl koji nije font se odbijaju. Brisanje vraća fontove
 * sa sajta izgledu koji ga je koristio.
 */
let user: TestUser
let wsId = ''
let brandId = ''
const woff = readFileSync(path.join(process.cwd(), 'src/lib/visuals/fonts/Inter-400.woff'))

beforeAll(async () => {
  configureFontLoader({ remote: false })
  user = await createTestUser('fonts')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Sopstveni font', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterAll(async () => {
  resetMemoryRateLimit()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

const upload = (name: string, bytes: Buffer) =>
  call<{ family: string; name: string; format: string }>(fontPost, `/api/brands/${brandId}/design/fonts`, {
    token: user.token,
    params: { id: brandId },
    body: { name, data: bytes.toString('base64') },
  })

describe('sopstveni font brenda (D-159)', () => {
  it('WOFF se čuva, prvi je u izboru, crta se, a izgled sa njim se čuva; brisanje vraća fontove sa sajta', async () => {
    const r = await upload('Brend Sans', woff)
    expect(r.status).toBe(200)
    const font = r.json.data!
    expect(font).toMatchObject({ name: 'Brend Sans', format: 'woff' })
    expect(font.family).toMatch(/^Custom [a-z0-9]{12}$/)

    const looks = await call<{ fonts: string[]; customFonts: Array<{ family: string; name: string }> }>(
      looksGet,
      `/api/brands/${brandId}/design/looks`,
      { token: user.token, params: { id: brandId } },
    )
    expect(looks.json.data!.fonts[0]).toBe(font.family)
    expect(looks.json.data!.customFonts).toEqual([{ family: font.family, name: 'Brend Sans' }])

    // crtač učitava font iz skladišta pod porodicom brenda
    const loaded = await loadFonts([font.family])
    expect(loaded.available.has(font.family)).toBe(true)
    expect(loaded.fonts.some((f) => f.name === font.family)).toBe(true)

    const saved = await call(designPatch, `/api/brands/${brandId}/design`, {
      token: user.token,
      method: 'PATCH',
      params: { id: brandId },
      body: { fonts: { headings: font.family, body: font.family } },
    })
    expect(saved.status).toBe(200)

    const removed = await call(fontDelete, `/api/brands/${brandId}/design/fonts`, {
      token: user.token,
      method: 'DELETE',
      params: { id: brandId },
      query: { family: font.family },
    })
    expect(removed.status).toBe(200)
    const { data: brand } = await admin.from('brands').select('design').eq('id', brandId).single()
    const design = brand!.design as { fonts?: unknown; customFonts?: unknown[] }
    expect(design.fonts).toBeUndefined()
    expect(design.customFonts).toEqual([])
    const { data: files } = await admin.storage.from('brand-assets').list('fonts', {
      search: font.family.slice('Custom '.length),
    })
    expect(files ?? []).toHaveLength(0)
  })

  it('WOFF2 i fajl koji nije font se odbijaju sa uputstvom', async () => {
    const woff2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(64)])
    const a = await upload('Novi', woff2)
    expect(a.status).toBe(400)
    expect(a.json.error?.message).toMatch(/WOFF2/)
    const b = await upload('Slika', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(64)]))
    expect(b.status).toBe(400)
    expect(b.json.error?.message).toMatch(/TTF, OTF ili WOFF/)
    // oštećen font sa ispravnim zaglavljem: crtač ga ne čita
    const broken = await upload('Pokvaren', Buffer.concat([Buffer.from('wOFF'), Buffer.alloc(200)]))
    expect(broken.status).toBe(400)
  })
})
