import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueHarmonize: vi.fn(async () => {}),
}))

import { GET as harmonizeGet, POST as harmonizePost_ } from '@/app/api/brands/[id]/design/harmonize/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueHarmonize } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import type { StepRunner } from '@/services/autopilot/runner'
import { resolveDesign } from '@/services/design/brand-design'
import {
  harmonizePost,
  offThemeDraftIds,
  PHOTO_REFRESH_LIMIT_WAIT_MS,
  PHOTO_REFRESH_PAUSE_MS,
  PHOTO_REFRESH_SUMMARY,
  photoRefreshDraftIds,
  refreshBrandPhotos,
  refreshPostPhotos,
} from '@/services/design/harmonize'
import { renderDesignSlides } from '@/services/design/render-post'
import { storeServerImage } from '@/services/visuals/store'
import type { Json } from '@/types/database'

import {
  enqueuePhotoQueries,
  geminiServer,
  photoCalls,
  photoQueryCalls,
  resetGeminiMock,
} from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Jedna tema za sve objave (D-125): nacrti koji čekaju a nisu u temi brenda crtaju se ponovo u temi,
 * sa istim tekstom i fotografijama; zakazane objave i nacrt koji je neko izmenio ostaju kakvi jesu.
 */
let user: TestUser
let wsId = ''
let brandId = ''

const slides = [
  { kind: 'cover' as const, title: 'Noć u Beogradu', body: 'Vodič za vikend.' },
  { kind: 'point' as const, title: 'Rezervišite sto ranije', body: 'Petkom su mesta brzo popunjena.' },
  { kind: 'cta' as const, title: 'Pišite nam', body: null },
]
const VIVID = {
  primary: '#FF006E',
  secondary: '#3A86FF',
  background: '#FFD60A',
  text: '#1B1B3A',
  muted: '#5C5A3C',
}

/** Nacrt nacrtan u starom šarenom stilu (ili u temi), sa pravim slajdovima i fotografijama. */
async function draft(
  status: 'in_review' | 'draft' | 'scheduled',
  look: 'vivid' | 'theme',
  withCopy = true,
  photoSource: 'stock' | 'none' = 'stock',
  target: { ws: string; brand: string } = { ws: wsId, brand: brandId },
): Promise<{ id: string; photoIds: string[] }> {
  const { data: brand } = await admin.from('brands').select('*').eq('id', target.brand).single()
  const theme = await resolveDesign(brand!)
  const styleId = look === 'vivid' ? 'pop' : theme.styleId
  const colors = look === 'vivid' ? VIVID : theme.colors
  const rendered = await renderDesignSlides({
    workspaceId: target.ws,
    brandId: target.brand,
    design: theme,
    styleId,
    format: 'portrait',
    slides,
    photoSource,
    colors,
    query: 'night club',
    uploadedBy: null,
  })
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: target.brand,
      workspace_id: target.ws,
      title: 'Noć u Beogradu',
      master_text: 'Vikend je blizu.',
      status,
      source: 'ai',
      language: 'sr-Latn',
      created_by: user.id,
      ...(status === 'scheduled' ? { scheduled_for: new Date(Date.now() + 864e5).toISOString() } : {}),
      design: {
        topic: 'Noć u Beogradu',
        cta: null,
        format: 'carousel',
        styleId,
        slides: slides.length,
        photoSource: 'stock',
        size: 'portrait',
        colors,
        ...(look === 'theme' ? { fonts: theme.fonts } : {}),
        locale: 'sr-Latn',
        platforms: ['instagram'],
        ...(withCopy ? { copy: { slides, photoAssetIds: rendered.photoIds } } : {}),
      } as unknown as Json,
    })
    .select('id')
    .single()
  if (error || !post) throw new Error(error?.message)
  await admin.from('post_media').insert(
    rendered.assetIds.map((media_asset_id, sort_order) => ({
      post_id: post.id,
      media_asset_id,
      sort_order,
    })),
  )
  return { id: post.id, photoIds: rendered.photoIds }
}

/** Nov radni prostor sa brendom u temi: Pola-pola u tamnim bojama, font Lora. */
const workspaces: string[] = []
async function themedBrand(name: string): Promise<{ ws: string; brand: string }> {
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name, type: 'business' },
  })
  const target = { ws: ws.json.data!.workspaceId, brand: ws.json.data!.brandId }
  workspaces.push(target.ws)
  await admin
    .from('brands')
    .update({
      design: {
        look: 'dark-3',
        styleId: 'split',
        photoSource: 'stock',
        colors: {
          primary: '#E3B662',
          secondary: '#F2DEB9',
          background: '#0E0C09',
          text: '#FBF4ED',
          muted: '#9A948C',
        },
        fonts: { headings: 'Lora', body: 'Lora' },
      },
    })
    .eq('id', target.brand)
  return target
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('harmonize')
  const target = await themedBrand('Jedna tema')
  wsId = target.ws
  brandId = target.brand
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  geminiServer.close()
  for (const id of workspaces) await admin.from('workspaces').delete().eq('id', id)
  await deleteTestUser(user)
})

describe('jedna tema za sve objave (D-125)', () => {
  it('broji samo nacrte koji čekaju, mogu da se nacrtaju ponovo i nisu u temi', async () => {
    const vivid = await draft('in_review', 'vivid')
    const vividDraft = await draft('draft', 'vivid')
    await draft('in_review', 'theme')
    await draft('scheduled', 'vivid')
    await draft('in_review', 'vivid', false)
    expect(new Set(await offThemeDraftIds(brandId))).toEqual(new Set([vivid.id, vividDraft.id]))
    const r = await call<{ offTheme: number }>(harmonizeGet, `/api/brands/${brandId}/design/harmonize`, {
      token: user.token,
      params: { id: brandId },
    })
    expect(r.json.data).toEqual({ offTheme: 2 })
    const post = await call<{ offTheme: number }>(harmonizePost_, `/api/brands/${brandId}/design/harmonize`, {
      method: 'POST',
      token: user.token,
      params: { id: brandId },
    })
    expect(post.json.data).toEqual({ offTheme: 2 })
    expect(enqueueHarmonize).toHaveBeenCalledWith(brandId)
  })

  it('nacrt se crta ponovo u temi: isti tekst i fotografije, novi slajdovi, nova verzija', async () => {
    const [id] = await offThemeDraftIds(brandId)
    const { data: before } = await admin
      .from('posts')
      .select('version, design, post_media(media_asset_id)')
      .eq('id', id!)
      .single()
    const oldMedia = (before!.post_media as Array<{ media_asset_id: string }>).map((m) => m.media_asset_id)
    const oldPhotos = (before!.design as { copy: { photoAssetIds: string[] } }).copy.photoAssetIds
    expect(await harmonizePost(id!)).toBe('done')

    const { data: after } = await admin
      .from('posts')
      .select('version, status, design, post_media(sort_order, media_asset_id)')
      .eq('id', id!)
      .single()
    expect(after!.version).toBe(before!.version + 1)
    expect(after!.status).toBe('in_review')
    const design = after!.design as {
      styleId: string
      colors: { background: string }
      fonts: { headings: string }
      copy: { slides: unknown[]; photoAssetIds: string[] }
    }
    expect(design).toMatchObject({
      styleId: 'split',
      colors: { background: '#0E0C09' },
      fonts: { headings: 'Lora' },
    })
    expect(design.copy.slides).toEqual(slides)
    // Pola-pola traži fotografiju na svakom slajdu: stare ostaju, a nedostajuće se dopunjuju
    expect(design.copy.photoAssetIds.slice(0, oldPhotos.length)).toEqual(oldPhotos)
    expect(design.copy.photoAssetIds).toHaveLength(slides.length)
    const media = (after!.post_media as Array<{ sort_order: number; media_asset_id: string }>).sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    expect(media).toHaveLength(slides.length)
    expect(media.some((m) => oldMedia.includes(m.media_asset_id))).toBe(false)
    const { data: assets } = await admin
      .from('media_assets')
      .select('source_data')
      .in(
        'id',
        media.map((m) => m.media_asset_id),
      )
    expect(assets!.every((a) => (a.source_data as { styleId: string }).styleId === 'split')).toBe(true)
    const { data: version } = await admin
      .from('post_versions')
      .select('change_summary')
      .eq('post_id', id!)
      .eq('version', after!.version)
      .single()
    expect(version!.change_summary).toBe('Usklađeno sa temom brenda')
    expect(await offThemeDraftIds(brandId)).not.toContain(id)
  })

  it('nacrt koji je neko izmenio dok je Sova crtala ostaje kakav jeste', async () => {
    const [id] = await offThemeDraftIds(brandId)
    const run = (async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'save') {
        const { data } = await admin.from('posts').select('version').eq('id', id!).single()
        await admin
          .from('posts')
          .update({ version: data!.version + 1 })
          .eq('id', id!)
      }
      return fn()
    }) as StepRunner
    expect(await harmonizePost(id!, run)).toBe('skipped')
    const { data: post } = await admin.from('posts').select('design').eq('id', id!).single()
    expect((post!.design as { styleId: string }).styleId).toBe('pop')
    // nacrtani slajdovi pokušaja ne ostaju u biblioteci
    const { data: leftovers } = await admin
      .from('media_assets')
      .select('id, deleted_at')
      .eq('source_data->>postId', id!)
      .eq('source_data->>harmonized', 'theme')
    expect(leftovers!.length).toBeGreaterThan(0)
    expect(leftovers!.every((a) => a.deleted_at)).toBe(true)
  })

  it('nov logo brenda: nacrt nacrtan pre njega nije u temi, a posle usklađivanja pamti logo', async () => {
    // nacrt u temi, a logo stiže tek posle njega (kao kad Sova ispravi tuđi logo sa sajta)
    const themed = await draft('in_review', 'theme')
    expect(await offThemeDraftIds(brandId)).not.toContain(themed.id)
    const png = await sharp({ create: { width: 240, height: 80, channels: 4, background: '#C8102E' } })
      .png()
      .toBuffer()
    const logo = await storeServerImage({
      workspaceId: wsId,
      brandId,
      bytes: png,
      mimeType: 'image/png',
      source: 'upload',
      folder: 'logo',
    })
    await admin.from('brands').update({ logo_asset_id: logo.id }).eq('id', brandId)
    expect(await offThemeDraftIds(brandId)).toContain(themed.id)

    expect(await harmonizePost(themed.id)).toBe('done')
    const { data: after } = await admin.from('posts').select('design').eq('id', themed.id).single()
    expect(after!.design as { logoAssetId: string; logoVersion: number }).toMatchObject({
      logoAssetId: logo.id,
      logoVersion: 2,
    })
    expect(await offThemeDraftIds(brandId)).not.toContain(themed.id)

    // isti logo nacrtan starijim načinom (beli okvir oko logoa): nacrt se nudi za ponovno crtanje
    const older = await draft('in_review', 'theme')
    const { data: o } = await admin.from('posts').select('design').eq('id', older.id).single()
    await admin
      .from('posts')
      .update({
        design: { ...(o!.design as Record<string, unknown>), logoAssetId: logo.id } as unknown as Json,
      })
      .eq('id', older.id)
    expect(await offThemeDraftIds(brandId)).toContain(older.id)
  })

  it('nacrt bez sačuvanog upita traži fotografije engleskim upitom i pamti ga (D-167)', async () => {
    const { id } = await draft('in_review', 'vivid')
    // starija objava: tema na srpskom, bez upita i bez fotografija, pa joj usklađivanje traži nove
    const { data: p } = await admin.from('posts').select('design').eq('id', id).single()
    const old = p!.design as { copy: { slides: unknown[] } }
    await admin
      .from('posts')
      .update({
        design: {
          ...old,
          topic: 'Noć u Beogradu: gde za vikend',
          copy: { ...old.copy, photoAssetIds: [] },
        } as Json,
      })
      .eq('id', id)
    // raniji nacrti su potrošili sve lažne fotografije, a izbor ne ponavlja one koje brend ima (D-121)
    await admin.from('media_assets').delete().eq('brand_id', brandId).in('source', ['unsplash', 'pexels'])
    resetGeminiMock()
    resetVisualsState()
    enqueuePhotoQueries(`night club neon lights ${crypto.randomUUID().slice(0, 8)}`)
    expect(await harmonizePost(id)).toBe('done')

    expect(photoQueryCalls).toHaveLength(1)
    expect(photoQueryCalls[0]!.text).toContain('Noć u Beogradu: gde za vikend')
    const english = visualsState.unsplashQueries[0]!
    expect(english.startsWith('night club neon lights ')).toBe(true)
    expect(visualsState.unsplashQueries.every((q) => !q.includes('Beogradu'))).toBe(true)
    // stok fotografije ne idu modelu (D-180)
    expect(photoCalls).toHaveLength(0)
    const { data: after } = await admin.from('posts').select('design').eq('id', id).single()
    const design = after!.design as { photoQuery?: string; copy: { photoAssetIds: string[] } }
    expect(design.photoQuery).toBe(english)
    expect(design.copy.photoAssetIds).toHaveLength(slides.length)
  })
})

/** Fotografije izabrane pre provere oblika (D-169) nemaju zapamćen okvir predmeta. */
async function forgetSubjects(ids: string[]): Promise<void> {
  const { data } = await admin.from('media_assets').select('id, source_data').in('id', ids)
  for (const row of data ?? []) {
    const { subject: _subject, pick: _pick, ...rest } = (row.source_data ?? {}) as Record<string, unknown>
    await admin
      .from('media_assets')
      .update({ source_data: rest as Json })
      .eq('id', row.id)
  }
}

async function patchDesign(id: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await admin.from('posts').select('design').eq('id', id).single()
  await admin
    .from('posts')
    .update({ design: { ...(data!.design as Record<string, unknown>), ...patch } as Json })
    .eq('id', id)
}

describe('nove fotografije za nacrte koji čekaju (D-170)', () => {
  // nacrt sa fotografijama izabranim pre provere oblika
  let oldId = ''

  it('nudi samo nacrte sa fotografijama izabranim pre provere oblika; video i korisnikove ne', async () => {
    // lažnih fotografija ima 15, a izbor ne ponavlja one koje brend već ima (D-121)
    await admin.from('media_assets').delete().eq('brand_id', brandId).in('source', ['unsplash', 'pexels'])
    resetGeminiMock()
    resetVisualsState()
    const old = await draft('in_review', 'theme')
    await forgetSubjects(old.photoIds)
    oldId = old.id
    const shaped = await draft('in_review', 'theme')
    // ostali nacrti bez svog izbora, sa starim fotografijama prvog
    const withOld = async (status: 'in_review' | 'draft' | 'scheduled', patch: Record<string, unknown>) => {
      const { id } = await draft(status, 'theme', true, 'none')
      await patchDesign(id, { copy: { slides, photoAssetIds: old.photoIds }, ...patch })
      return id
    }
    const own = await withOld('in_review', { ownPhotos: true })
    const video = await withOld('in_review', { format: 'video' })
    const scheduled = await withOld('scheduled', {})
    const bare = await draft('draft', 'theme', true, 'none')

    const ids = await photoRefreshDraftIds(brandId)
    expect(ids).toContain(old.id)
    expect(ids).toContain(bare.id)
    for (const skip of [shaped.id, own, video, scheduled]) expect(ids).not.toContain(skip)
    expect(await refreshPostPhotos(own)).toBe('skipped')
    expect(await refreshPostPhotos(video)).toBe('skipped')
    expect(await refreshPostPhotos(scheduled)).toBe('skipped')
  })

  it('isti tekst, nove fotografije u obliku okvira, novi slajdovi i nova verzija', async () => {
    const id = oldId
    const { data: before } = await admin
      .from('posts')
      .select('version, status, design, post_media(media_asset_id)')
      .eq('id', id!)
      .single()
    const oldDesign = before!.design as { copy: { slides: unknown[]; photoAssetIds: string[] } }
    const oldMedia = (before!.post_media as Array<{ media_asset_id: string }>).map((m) => m.media_asset_id)
    resetVisualsState()
    // nacrt nema sačuvan upit: model ga piše jednom, a nacrt ga pamti (D-167)
    const query = `cocktail bar neon sign ${crypto.randomUUID().slice(0, 8)}`
    enqueuePhotoQueries(query)
    expect(await refreshPostPhotos(id!)).toBe('done')

    const { data: after } = await admin
      .from('posts')
      .select('version, status, design, post_media(sort_order, media_asset_id)')
      .eq('id', id!)
      .single()
    expect(after!.version).toBe(before!.version + 1)
    expect(after!.status).toBe(before!.status)
    const design = after!.design as { copy: { slides: unknown[]; photoAssetIds: string[] } }
    expect(design.copy.slides).toEqual(oldDesign.copy.slides)
    // Pola-pola traži fotografiju na svakom slajdu: sve su nove, nijedna od ranijih
    expect(design.copy.photoAssetIds).toHaveLength(slides.length)
    expect(design.copy.photoAssetIds.some((p) => oldDesign.copy.photoAssetIds.includes(p))).toBe(false)
    // pretraga u obliku okvira, a izabrane pamte da su izabrane po opisu (D-180)
    expect((after!.design as { photoQuery?: string }).photoQuery).toBe(query)
    expect(visualsState.unsplashQueries.every((q) => q === query)).toBe(true)
    expect(visualsState.unsplashOrientations.length).toBeGreaterThan(0)
    expect(visualsState.unsplashOrientations.every((o) => o !== '')).toBe(true)
    const { data: photos } = await admin
      .from('media_assets')
      .select('source_data')
      .in('id', design.copy.photoAssetIds)
    expect(photos!.every((p) => (p.source_data as { pick?: unknown }).pick === 'text')).toBe(true)
    const media = after!.post_media as Array<{ sort_order: number; media_asset_id: string }>
    expect(media).toHaveLength(slides.length)
    expect(media.some((m) => oldMedia.includes(m.media_asset_id))).toBe(false)
    const { data: version } = await admin
      .from('post_versions')
      .select('change_summary')
      .eq('post_id', id!)
      .eq('version', after!.version)
      .single()
    expect(version!.change_summary).toBe(PHOTO_REFRESH_SUMMARY)
    expect(await photoRefreshDraftIds(brandId)).not.toContain(id)
  })

  it('kad nov izbor nađe manje fotografija, nacrt ostaje kakav je bio', async () => {
    const { id, photoIds } = await draft('in_review', 'theme')
    await forgetSubjects(photoIds)
    // ni Unsplash ni Pexels nemaju ništa za ovaj upit
    await patchDesign(id, { photoQuery: 'nista' })
    resetVisualsState()
    visualsState.pexelsEmpty = true
    const { data: before } = await admin.from('posts').select('version, design').eq('id', id).single()
    expect(await refreshPostPhotos(id)).toBe('fewer')

    const { data: after } = await admin.from('posts').select('version, design').eq('id', id).single()
    expect(after!.version).toBe(before!.version)
    expect(after!.design).toEqual(before!.design)
    // nacrtani slajdovi pokušaja ne ostaju u biblioteci
    const { data: leftovers } = await admin
      .from('media_assets')
      .select('deleted_at')
      .eq('source_data->>postId', id)
      .eq('source_data->>harmonized', 'photos')
    expect(leftovers!.length).toBeGreaterThan(0)
    expect(leftovers!.every((a) => a.deleted_at)).toBe(true)
  })

  it('brend: nacrt po nacrt sa pauzom; posle tri bez dovoljno fotografija čeka sat pa nastavlja', async () => {
    const target = await themedBrand('Nove fotografije')
    const made: string[] = []
    for (let i = 0; i < 4; i++) made.push((await draft('in_review', 'theme', true, 'none', target)).id)
    // prva tri ne nalaze ništa ni na Unsplash-u ni na Pexels-u (limit sata), četvrti nalazi
    for (const id of made.slice(0, 3)) await patchDesign(id, { photoQuery: 'nista' })
    await patchDesign(made[3]!, { photoQuery: `rooftop terrace sunset ${crypto.randomUUID().slice(0, 8)}` })
    resetVisualsState()
    visualsState.pexelsEmpty = true
    const names: string[] = []
    const sleeps: Array<[string, number]> = []
    const counts = await refreshBrandPhotos(target.brand, {
      run: (async (name: string, fn: () => Promise<unknown>) => {
        names.push(name)
        return fn()
      }) as StepRunner,
      sleep: async (name, ms) => {
        sleeps.push([name, ms])
      },
    })

    expect(counts).toEqual({ total: 4, done: 1, skipped: 0, fewer: 3, failed: 0 })
    expect(sleeps).toEqual([
      [`pause-${made[0]}`, PHOTO_REFRESH_PAUSE_MS],
      [`pause-${made[1]}`, PHOTO_REFRESH_PAUSE_MS],
      [`limit-${made[2]}`, PHOTO_REFRESH_LIMIT_WAIT_MS],
    ])
    // svaki korak nosi ID nacrta, pa se imena koraka pozadinskog posla ne ponavljaju
    expect(names[0]).toBe('list')
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain(`post-${made[3]}-save`)
    expect(names).toContain(`post-${made[0]}-discard`)
  })
})
