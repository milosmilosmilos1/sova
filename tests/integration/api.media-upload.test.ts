import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import sharp from 'sharp'

import { POST as completePost } from '@/app/api/media/complete/route'
import { GET as mediaGet } from '@/app/api/media/route'
import { POST as uploadUrlPost } from '@/app/api/media/upload-url/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { cleanupIncomingUploads } from '@/services/media'

import { buildMp4 } from '../fixtures/mp4'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let owner: TestUser
let stranger: TestUser
let wsId = ''
let brandId = ''

interface Target {
  uploadId: string
  signedUrl: string
  maxBytes: number
}
interface Uploaded {
  id: string
  kind: 'image' | 'video'
  mimeType: string
  width: number | null
  height: number | null
  durationMs: number | null
  sizeBytes: number
  url: string
}

async function target(mimeType: string, sizeBytes: number, token = owner.token, brand = brandId) {
  return call<Target>(uploadUrlPost, '/api/media/upload-url', {
    token,
    body: { brandId: brand, mimeType, sizeBytes },
  })
}

/** Isto što radi pregledač: PUT sirovih bajtova na potpisan URL skladišta. */
async function put(url: string, bytes: Buffer, type: string): Promise<number> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': type, 'x-upsert': 'false' },
    body: new Uint8Array(bytes),
  })
  await res.arrayBuffer()
  return res.status
}

async function complete(uploadId: string, originalName = 'fajl') {
  return call<Uploaded>(completePost, '/api/media/complete', {
    token: owner.token,
    body: { brandId, uploadId, originalName },
  })
}

async function upload(bytes: Buffer, type: string, name: string) {
  const t = await target(type, bytes.length)
  expect(t.status).toBe(200)
  expect(await put(t.json.data!.signedUrl, bytes, type)).toBe(200)
  return { uploadId: t.json.data!.uploadId, res: await complete(t.json.data!.uploadId, name) }
}

async function incomingExists(uploadId: string): Promise<boolean> {
  const { data } = await admin.storage.from('uploads').list(`ws/${wsId}/brand/${brandId}/incoming`, {
    search: uploadId,
  })
  return (data ?? []).some((f) => f.name === uploadId)
}

beforeAll(async () => {
  owner = await createTestUser('media-up')
  stranger = await createTestUser('media-up-x')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Direktno otpremanje', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  await deleteTestUser(owner)
  await deleteTestUser(stranger)
})

describe('Direktno otpremanje slike (D-082)', () => {
  it('potpisan URL → PUT u skladište → complete: slika bez EXIF-a, privremeni fajl obrisan', async () => {
    const jpeg = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'Tajni Autor' } })
      .toBuffer()
    expect(jpeg.includes('Tajni Autor')).toBe(true)
    const { uploadId, res } = await upload(jpeg, 'image/jpeg', 'zalazak.jpg')
    expect(res.status).toBe(200)
    expect(res.json.data).toMatchObject({ kind: 'image', mimeType: 'image/jpeg', width: 1200, height: 900 })
    expect(await incomingExists(uploadId)).toBe(false)
    const { data: row } = await admin.from('media_assets').select('*').eq('id', res.json.data!.id).single()
    expect(row!.storage_path).toBe(`ws/${wsId}/brand/${brandId}/uploads/${row!.id}.jpg`)
    expect(row!.source_data).toMatchObject({ original_name: 'zalazak.jpg' })
    const stored = await admin.storage.from('uploads').download(row!.storage_path)
    expect(Buffer.from(await stored.data!.arrayBuffer()).includes('Tajni Autor')).toBe(false)
  })
})

describe('Video u biblioteci', () => {
  it('MP4 sa telefona: trajanje, vertikalne dimenzije iz rotacije, lokacija uklonjena', async () => {
    const where = '+44.8125+020.4612/'
    const mp4 = buildMp4({ width: 1920, height: 1080, rotation: 90, durationMs: 32_400, location: where })
    const { uploadId, res } = await upload(mp4, 'video/mp4', 'snimak.mp4')
    expect(res.status).toBe(200)
    expect(res.json.data).toMatchObject({
      kind: 'video',
      mimeType: 'video/mp4',
      width: 1080,
      height: 1920,
      durationMs: 32_400,
    })
    expect(await incomingExists(uploadId)).toBe(false)
    const { data: row } = await admin.from('media_assets').select('*').eq('id', res.json.data!.id).single()
    expect(row!.storage_path.endsWith('.mp4')).toBe(true)
    expect(row!.source_data).toMatchObject({ video_codec: 'avc1', audio_codec: 'mp4a', rotation: 90 })
    const stored = await admin.storage.from('uploads').download(row!.storage_path)
    const bytes = Buffer.from(await stored.data!.arrayBuffer())
    expect(bytes.length).toBe(mp4.length)
    expect(bytes.includes(where)).toBe(false)

    // isti video drugi put: postojeći asset umesto duplikata (U8)
    const again = await upload(mp4, 'video/mp4', 'snimak-kopija.mp4')
    expect(again.res.json.data!.id).toBe(res.json.data!.id)

    const list = await call<Array<{ id: string; kind: string; durationMs: number | null }>>(
      mediaGet,
      '/api/media',
      {
        token: owner.token,
        query: { brandId, kind: 'video' },
      },
    )
    expect(list.json.data!.map((m) => m.id)).toEqual([res.json.data!.id])
    expect(list.json.data![0]!.durationMs).toBe(32_400)
  })

  it('MOV se čuva kao video/quicktime; oštećen video i tekst sa .mp4 imenom se odbijaju', async () => {
    const mov = await upload(buildMp4({ brand: 'qt  ', durationMs: 5_000 }), 'video/quicktime', 'klip.mov')
    expect(mov.res.json.data).toMatchObject({ kind: 'video', mimeType: 'video/quicktime', durationMs: 5_000 })

    const broken = buildMp4({ moovAtEnd: true })
    const cut = await upload(broken.subarray(0, broken.length - 300), 'video/mp4', 'prekinut.mp4')
    expect(cut.res.status).toBe(400)
    expect(cut.res.json.error?.message).toContain('Video nije čitljiv')
    expect(await incomingExists(cut.uploadId)).toBe(false)

    const fake = await upload(
      Buffer.from('ovo je obican tekst, ne video '.repeat(20)),
      'video/mp4',
      'lazni.mp4',
    )
    expect(fake.res.status).toBe(400)
    expect(fake.res.json.error?.message).toContain('MP4 ili MOV')
    expect(await incomingExists(fake.uploadId)).toBe(false)
  })
})

describe('Ograničenja i pristup', () => {
  it('GIF i HEIC odmah dobijaju svoju poruku; prevelik video 413; tuđi brend 404; complete bez fajla 404', async () => {
    const gif = await target('image/gif', 1000)
    expect(gif.status).toBe(400)
    expect(gif.json.error?.message).toContain('GIF još nije podržan')
    const heic = await target('image/heic', 1000)
    expect(heic.json.error?.message).toContain('HEIC')
    const pdf = await target('application/pdf', 1000)
    expect(pdf.status).toBe(400)
    const big = await target('video/mp4', 51 * 1024 * 1024)
    expect(big.status).toBe(413)
    expect(big.json.error?.message).toContain('50 MB')
    const bigImage = await target('image/png', 21 * 1024 * 1024)
    expect(bigImage.status).toBe(413)

    const foreign = await target('image/jpeg', 1000, stranger.token)
    expect(foreign.status).toBe(404)

    const missing = await complete('00000000-0000-4000-8000-000000000000')
    expect(missing.status).toBe(404)
  })

  it('napušten privremeni fajl briše dnevni posao', async () => {
    const t = await target('video/mp4', 2000)
    expect(await put(t.json.data!.signedUrl, buildMp4(), 'video/mp4')).toBe(200)
    expect(await incomingExists(t.json.data!.uploadId)).toBe(true)
    expect(await cleanupIncomingUploads(0)).toBeGreaterThanOrEqual(1)
    expect(await incomingExists(t.json.data!.uploadId)).toBe(false)
  })
})
