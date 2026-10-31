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
import { harmonizePost, offThemeDraftIds } from '@/services/design/harmonize'
import { renderDesignSlides } from '@/services/design/render-post'
import type { Json } from '@/types/database'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, unsplashHandlers } from './visuals-mock'

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
): Promise<{ id: string; photoIds: string[] }> {
  const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
  const theme = await resolveDesign(brand!)
  const styleId = look === 'vivid' ? 'pop' : theme.styleId
  const colors = look === 'vivid' ? VIVID : theme.colors
  const rendered = await renderDesignSlides({
    workspaceId: wsId,
    brandId,
    design: theme,
    styleId,
    format: 'portrait',
    slides,
    photoSource: 'stock',
    colors,
    query: 'night club',
    uploadedBy: null,
  })
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
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

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('harmonize')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Jedna tema', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  // tema brenda: Pola-pola u tamnim bojama, font Lora
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
    .eq('id', brandId)
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
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
})
