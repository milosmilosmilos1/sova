import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import type { StepRunner } from '@/services/autopilot/runner'
import {
  CATCH_UP_PLAN,
  cleanupHistory,
  DAILY_PLAN,
  findCleanupCandidates,
  purgeMedia,
  runMediaCleanup,
} from '@/services/media-cleanup'
import { usedStockIds } from '@/services/visuals/used'
import type { Json } from '@/types/database'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Čišćenje skladišta (D-168): briše se samo ono što je Sova napravila ili preuzela i što više ne treba
 * nijednoj objavi. Pomoćni fajlovi objave idu 30 dana posle objave, fajlovi obrisane objave 30 dana
 * posle brisanja, stare verzije posle 7 dana; jednokratno čišćenje briše otpad stariji od dana.
 * Galerija, logo, Figma šablon, objavljeni slajdovi i gotov video ostaju.
 */
let user: TestUser
let wsId = ''
let brandId = ''
let accountId = ''
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

let png: Buffer
const a: Record<string, { id: string; bucket: string; path: string }> = {}

async function asset(
  key: string,
  opts: {
    source: 'template' | 'unsplash' | 'pexels' | 'upload'
    kind?: 'image' | 'video'
    ageDays: number
    sourceData?: Record<string, unknown>
    deletedDaysAgo?: number
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const video = opts.kind === 'video'
  const bucket = opts.source === 'template' ? 'generated' : 'uploads'
  const path = `ws/${wsId}/brand/${brandId}/test-cleanup/${id}.${video ? 'mp4' : 'png'}`
  const bytes = video ? Buffer.from('mp4-test') : png
  const up = await admin.storage
    .from(bucket)
    .upload(path, bytes, { contentType: video ? 'video/mp4' : 'image/png' })
  if (up.error) throw new Error(up.error.message)
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: wsId,
    brand_id: brandId,
    kind: opts.kind ?? 'image',
    source: opts.source,
    bucket,
    storage_path: path,
    mime_type: video ? 'video/mp4' : 'image/png',
    size_bytes: bytes.length,
    source_data: (opts.sourceData ?? null) as Json,
    created_at: ago(opts.ageDays),
    deleted_at: opts.deletedDaysAgo === undefined ? null : ago(opts.deletedDaysAgo),
  })
  if (error) throw new Error(error.message)
  a[key] = { id, bucket, path }
  return id
}

async function post(opts: {
  status: 'draft' | 'published'
  design: Record<string, unknown>
  media?: string[]
  updatedDaysAgo?: number
  deletedDaysAgo?: number
  publishedDaysAgo?: number
}): Promise<string> {
  const { data, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      title: 'Test čišćenja',
      status: opts.status,
      source: 'ai',
      created_by: user.id,
      design: opts.design as Json,
      created_at: ago(45),
      updated_at: ago(opts.updatedDaysAgo ?? 0),
      deleted_at: opts.deletedDaysAgo === undefined ? null : ago(opts.deletedDaysAgo),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message)
  if (opts.media?.length) {
    const { error: mErr } = await admin
      .from('post_media')
      .insert(
        opts.media.map((media_asset_id, sort_order) => ({ post_id: data.id, media_asset_id, sort_order })),
      )
    if (mErr) throw new Error(mErr.message)
  }
  if (opts.publishedDaysAgo !== undefined) {
    const { error: tErr } = await admin.from('post_targets').insert({
      post_id: data.id,
      brand_id: brandId,
      social_account_id: accountId,
      platform: 'facebook',
      status: 'published',
      published_at: ago(opts.publishedDaysAgo),
    })
    if (tErr) throw new Error(tErr.message)
  }
  return data.id
}

async function fileExists(key: string): Promise<boolean> {
  const { bucket, path } = a[key]!
  const { data } = await admin.storage.from(bucket).download(path)
  return Boolean(data)
}

const mine = (ids: Array<{ id: string }>) => {
  const own = new Map(Object.entries(a).map(([k, v]) => [v.id, k]))
  return ids.flatMap((c) => (own.has(c.id) ? [own.get(c.id)!] : [])).sort()
}

beforeAll(async () => {
  png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3366cc' } })
    .png()
    .toBuffer()
  user = await createTestUser('media-cleanup')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Čišćenje skladišta', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const { data: acc, error } = await admin
    .from('social_accounts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      platform: 'facebook',
      external_id: `cleanup-${Date.now()}`,
      name: 'Test strana',
      account_type: 'facebook_page',
      status: 'active',
      capabilities: {},
      metadata: {},
      assisted_only: true,
    })
    .select('id')
    .single()
  if (error || !acc) throw new Error(error?.message)
  accountId = acc.id

  // objava objavljena pre 40 dana: objavljeni slajd, slika videa i gotov video ostaju, pomoćni fajlovi ne
  await asset('slideOld', { source: 'template', ageDays: 41 })
  await asset('stockOld', { source: 'unsplash', ageDays: 41, sourceData: { photoId: 'cleanup-u1' } })
  await asset('clipOld', { source: 'pexels', kind: 'video', ageDays: 41, sourceData: { pexelsId: 991 } })
  await asset('layerOld', { source: 'template', ageDays: 41 })
  await asset('posterOld', { source: 'template', ageDays: 41 })
  await asset('mp4Old', {
    source: 'upload',
    kind: 'video',
    ageDays: 41,
    sourceData: { original_name: 'video-u-temi.mp4' },
  })
  await post({
    status: 'published',
    publishedDaysAgo: 40,
    updatedDaysAgo: 1, // izmena posle objave (npr. metrika) ne produžava čuvanje
    media: [a.slideOld!.id, a.mp4Old!.id],
    design: {
      topic: 'Objavljeno davno',
      copy: { slides: [], photoAssetIds: [a.stockOld!.id] },
      video: {
        clipAssetIds: [a.clipOld!.id],
        overlayAssetIds: [a.layerOld!.id],
        posterAssetId: a.posterOld!.id,
        renderedAssetId: a.mp4Old!.id,
      },
    },
  })
  // objavljena pre 10 dana (bez mreže sa vremenom objave, važi vreme poslednje izmene)
  await asset('stockRecent', { source: 'unsplash', ageDays: 11, sourceData: { photoId: 'cleanup-u2' } })
  await post({
    status: 'published',
    updatedDaysAgo: 10,
    design: { topic: 'Objavljeno skoro', copy: { slides: [], photoAssetIds: [a.stockRecent!.id] } },
  })
  // nacrt star 40 dana: može se crtati ponovo, pa čuva sve
  await asset('stockDraft', { source: 'unsplash', ageDays: 41, sourceData: { photoId: 'cleanup-u3' } })
  await post({
    status: 'draft',
    updatedDaysAgo: 40,
    design: { topic: 'Stari nacrt', copy: { slides: [], photoAssetIds: [a.stockDraft!.id] } },
  })
  // obrisana pre 40 i pre 10 dana
  await asset('slideTrashOld', { source: 'template', ageDays: 41 })
  await post({
    status: 'draft',
    deletedDaysAgo: 40,
    media: [a.slideTrashOld!.id],
    design: { topic: 'Korpa' },
  })
  await asset('slideTrashNew', { source: 'template', ageDays: 11 })
  await post({
    status: 'draft',
    deletedDaysAgo: 10,
    media: [a.slideTrashNew!.id],
    design: { topic: 'Korpa' },
  })
  // stare verzije i otpad: 10 dana, 2 dana, sat vremena
  await asset('versionOld', { source: 'template', ageDays: 10 })
  await asset('versionNew', { source: 'template', ageDays: 2 })
  await asset('justNow', { source: 'template', ageDays: 1 / 24 })
  await asset('mp4Version', {
    source: 'upload',
    kind: 'video',
    ageDays: 10,
    sourceData: { original_name: 'video-u-temi.mp4' },
  })
  await asset('softDeleted', { source: 'template', ageDays: 10, deletedDaysAgo: 9 })
  // korisnikovo i brendovo: nikad
  await asset('userVideo', {
    source: 'upload',
    kind: 'video',
    ageDays: 40,
    sourceData: { original_name: 'moj-video.mp4' },
  })
  await asset('gallery', { source: 'upload', ageDays: 40 })
  await asset('figmaBackground', { source: 'template', ageDays: 40 })
  const { error: bErr } = await admin
    .from('brands')
    .update({
      design: {
        templates: [
          { id: 'abcdefghij', frames: { cover: { background: { assetId: a.figmaBackground!.id } } } },
        ],
      } as Json,
    })
    .eq('id', brandId)
  if (bErr) throw new Error(bErr.message)
})

afterAll(async () => {
  for (const { bucket, path } of Object.values(a)) await admin.storage.from(bucket).remove([path])
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('čišćenje skladišta (D-168)', () => {
  it('noćno: pomoćni fajlovi posle 30 dana od objave, korpa posle 30 dana, stare verzije posle 7 dana', async () => {
    const now = new Date()
    const found = await findCleanupCandidates(DAILY_PLAN, now, 2000)
    expect(mine(found)).toEqual(
      ['stockOld', 'clipOld', 'layerOld', 'slideTrashOld', 'versionOld', 'mp4Version', 'softDeleted'].sort(),
    )
    const own = found.filter((c) => mine([c]).length)
    const done = await purgeMedia(own, now)
    expect(done).toMatchObject({ files: 7, failed: 0 })
    expect(done.byKind).toMatchObject({ stok: { files: 1 }, snimak: { files: 1 }, video: { files: 1 } })

    for (const key of [
      'stockOld',
      'clipOld',
      'layerOld',
      'slideTrashOld',
      'versionOld',
      'mp4Version',
      'softDeleted',
    ])
      expect(await fileExists(key), key).toBe(false)
    for (const key of [
      'slideOld',
      'posterOld',
      'mp4Old',
      'stockRecent',
      'stockDraft',
      'slideTrashNew',
      'versionNew',
      'justNow',
      'userVideo',
      'gallery',
      'figmaBackground',
    ])
      expect(await fileExists(key), key).toBe(true)

    // red ostaje, obrisan i označen; podaci izvora ostaju (D-121: ista fotografija se ne bira ponovo)
    const { data: row } = await admin
      .from('media_assets')
      .select('deleted_at, source_data')
      .eq('id', a.stockOld!.id)
      .single()
    expect(row!.deleted_at).not.toBeNull()
    expect(row!.source_data).toMatchObject({ photoId: 'cleanup-u1', purgedAt: now.toISOString() })
    expect((await usedStockIds(brandId, 'unsplash')).has('cleanup-u1')).toBe(true)

    // drugo pokretanje nema šta da briše
    expect(mine(await findCleanupCandidates(DAILY_PLAN, new Date(), 2000))).toEqual([])
  })

  it('jednokratno: otpad stariji od dana, i iz korpe odmah; ono što je mlađe od dana ostaje', async () => {
    const found = await findCleanupCandidates(CATCH_UP_PLAN, new Date(), 2000)
    expect(mine(found)).toEqual(['slideTrashNew', 'versionNew'])
    const run = (async (_name: string, fn: () => Promise<unknown>) => fn()) as StepRunner
    const result = await runMediaCleanup(run, 'catch-up', user.id)
    expect(result.mode).toBe('catch-up')
    expect(result.files).toBeGreaterThanOrEqual(2)
    expect(await fileExists('slideTrashNew')).toBe(false)
    expect(await fileExists('versionNew')).toBe(false)
    for (const key of [
      'justNow',
      'slideOld',
      'mp4Old',
      'posterOld',
      'stockRecent',
      'stockDraft',
      'gallery',
      'userVideo',
    ])
      expect(await fileExists(key), key).toBe(true)
    const [last] = await cleanupHistory()
    expect(last).toMatchObject({ mode: 'catch-up', requestedBy: user.id, files: result.files })
  })
})
