import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import sharp from 'sharp'

import { POST as attachPost } from '@/app/api/approvals/[id]/theme-video/route'
import { GET as detailGet } from '@/app/api/approvals/[id]/route'
import { POST as previewPost } from '@/app/api/approvals/[id]/slides/preview/route'
import { GET as textGet, PUT as textPut } from '@/app/api/approvals/[id]/slides/route'
import { GET as pendingGet } from '@/app/api/approvals/videos/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { getTokenBalance } from '@/lib/tokens/reservation'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { sceneSeconds, videoScenes } from '@/lib/visuals/design/video'
import type { StepRunner } from '@/services/autopilot/runner'
import { resolveDesign } from '@/services/design/brand-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { buildThemeVideoInSteps, videoPostDesign } from '@/services/design/video-post'
import { setRenderBudgetForTests } from '@/services/posts/slide-text'
import type { Json } from '@/types/database'

import { buildMp4 } from '../fixtures/mp4'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, unsplashHandlers } from './visuals-mock'

/**
 * Tekst na slikama (D-129): korisnik menja reči na slajdovima i kadrovima videa bez tokena. Crta se
 * ponovo samo izmenjen slajd, u temi objave i sa istom fotografijom; video dobija nov sloj teksta,
 * a MP4 se skida da ga pregledač napravi ponovo.
 */
let user: TestUser
let wsId = ''
let brandId = ''
const inline: StepRunner = (_name, fn) => fn()
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

const THEME = {
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
}

const slides = [
  { kind: 'cover' as const, kicker: 'Vodič', title: 'Noć u Beogradu', body: 'Vodič za vikend.' },
  { kind: 'point' as const, title: 'Rezervišite sto ranije', body: 'Petkom su mesta brzo popunjena.' },
  { kind: 'cta' as const, title: 'Pišite nam', body: null },
]

type Status = 'in_review' | 'draft' | 'approved' | 'scheduled'

/** Karusel nacrtan u temi brenda (ili bez zapamćene teme, kao pre D-125), sa fotografijama. */
async function carousel(status: Status, remembersTheme = true): Promise<string> {
  const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
  const theme = await resolveDesign(brand!)
  const rendered = await renderDesignSlides({
    workspaceId: wsId,
    brandId,
    design: theme,
    styleId: 'split',
    format: 'portrait',
    slides,
    photoSource: 'stock',
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
        styleId: 'split',
        slides: slides.length,
        photoSource: 'stock',
        size: 'portrait',
        ...(remembersTheme ? { colors: theme.colors, fonts: theme.fonts } : {}),
        locale: 'sr-Latn',
        platforms: ['instagram'],
        copy: { slides, photoAssetIds: rendered.photoIds },
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
  return post.id
}

const scenes = videoScenes([
  { kind: 'cover', title: 'Novogodišnja noć' },
  { kind: 'point', title: 'Fiksne cene', body: 'Bez iznenađenja.' },
  { kind: 'cta', title: 'Rezervišite sto' },
])

async function videoDraft(): Promise<string> {
  const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
  const theme = await resolveDesign(brand!)
  const video = await buildThemeVideoInSteps(inline, {
    workspaceId: wsId,
    brandId,
    design: theme,
    scenes,
    query: 'night club',
    uploadedBy: null,
  })
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      title: 'Novogodišnja noć',
      master_text: 'Rezervišite sto za doček.',
      status: 'in_review',
      source: 'ai',
      language: 'sr-Latn',
      created_by: user.id,
      design: videoPostDesign(
        { topic: 'Novogodišnja noć', cta: null, locale: 'sr-Latn', platforms: ['instagram'] },
        theme,
        scenes,
        video,
      ) as unknown as Json,
    })
    .select('id')
    .single()
  if (error || !post) throw new Error(error?.message)
  return post.id
}

/** Gotov MP4 iz pregledača u biblioteci brenda. */
async function renderedMp4(): Promise<string> {
  const path = `ws/${wsId}/brand/${brandId}/uploads/${crypto.randomUUID()}.mp4`
  const bytes = buildMp4({ durationMs: 9_000, width: 1080, height: 1920 })
  const upload = await admin.storage.from('uploads').upload(path, bytes, { contentType: 'video/mp4' })
  if (upload.error) throw new Error(upload.error.message)
  const { data, error } = await admin
    .from('media_assets')
    .insert({
      workspace_id: wsId,
      brand_id: brandId,
      kind: 'video',
      source: 'upload',
      bucket: 'uploads',
      storage_path: path,
      mime_type: 'video/mp4',
      size_bytes: bytes.length,
      width: 1080,
      height: 1920,
      duration_ms: 9_000,
      uploaded_by: user.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}

async function postOf(id: string) {
  const { data } = await admin
    .from('posts')
    .select('version, status, title, design, post_media(sort_order, media_asset_id)')
    .eq('id', id)
    .single()
  const media = [...((data!.post_media as Array<{ sort_order: number; media_asset_id: string }>) ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => m.media_asset_id)
  return { ...data!, media }
}

/** Tekst svih slajdova kao u obrascu, sa izmenom na jednom slajdu. */
function edited(index: number, change: Record<string, unknown>) {
  return slides.map((s, i) => (i === index ? { ...s, ...change } : s))
}

async function save(id: string, version: number, body: unknown[]) {
  return call<{ version: number; changed: number }>(textPut, `/api/approvals/${id}/slides`, {
    method: 'PUT',
    token: user.token,
    params: { id },
    body: { version, slides: body },
  })
}

async function preview(id: string, body: unknown) {
  const { NextRequest } = await import('next/server')
  const res = await previewPost(
    new NextRequest(new URL(`/api/approvals/${id}/slides/preview`, APP), {
      method: 'POST',
      headers: { authorization: `Bearer ${user.token}`, origin: APP, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    bytes: Buffer.from(await res.arrayBuffer()),
  }
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('slide-text')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Tekst na slikama', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin.from('brands').update({ design: THEME }).eq('id', brandId)
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('tekst na slikama (D-129)', () => {
  it('detalj kaže da tekst može da se menja; obrazac dobija tekst slajdova, a pregled je slika sa novim tekstom', async () => {
    const id = await carousel('in_review')
    const detail = await call<{ canEditText: boolean }>(detailGet, `/api/approvals/${id}`, {
      token: user.token,
      params: { id },
    })
    expect(detail.json.data!.canEditText).toBe(true)
    const text = await call<{
      format: string
      slides: Array<{ kind: string; title: string; fields: string[] }>
    }>(textGet, `/api/approvals/${id}/slides`, { token: user.token, params: { id } })
    expect(text.json.data).toMatchObject({
      format: 'carousel',
      width: 1080,
      height: 1350,
      slides: slides.map((s) => ({ kind: s.kind, title: s.title })),
    })
    // Pola-pola crta natpis iznad naslova na naslovnom slajdu, a na ostalim samo tekst
    expect(text.json.data!.slides.map((s) => s.fields)).toEqual([['kicker', 'body'], ['body'], ['body']])
    const r = await preview(id, {
      index: 1,
      slide: { title: 'Sto za četvoro', body: 'Rezervacija do četvrtka.' },
    })
    expect(r.status).toBe(200)
    expect(r.type).toBe('image/jpeg')
    const meta = await sharp(r.bytes).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 540, height: 675 })
  })

  it('čuvanje crta samo izmenjen slajd, sa istom fotografijom; nacrt i dalje čeka odluku i tokeni se ne troše', async () => {
    const id = await carousel('in_review')
    const before = await postOf(id)
    const tokens = (await getTokenBalance(wsId)).available
    const r = await save(
      id,
      before.version,
      edited(1, { title: 'Sto za četvoro', body: 'Rezervacija do četvrtka.' }),
    )
    expect(r.status).toBe(200)
    expect(r.json.data).toEqual({ version: before.version + 1, changed: 1, rest: 0 })

    const after = await postOf(id)
    expect(after.status).toBe('in_review')
    expect(after.title).toBe('Noć u Beogradu')
    expect(after.media[0]).toBe(before.media[0])
    expect(after.media[2]).toBe(before.media[2])
    expect(after.media[1]).not.toBe(before.media[1])
    const design = after.design as { copy: { slides: Array<{ title: string; body: string | null }> } }
    expect(design.copy.slides[1]).toMatchObject({ title: 'Sto za četvoro', body: 'Rezervacija do četvrtka.' })
    expect(design.copy.slides[0]!.title).toBe('Noć u Beogradu')

    const { data: assets } = await admin
      .from('media_assets')
      .select('id, source_data')
      .in('id', [before.media[1]!, after.media[1]!])
    const photoOf = (assetId: string) =>
      (assets!.find((a) => a.id === assetId)!.source_data as { photoAssetId: string | null }).photoAssetId
    expect(photoOf(after.media[1]!)).toBe(photoOf(before.media[1]!))
    expect(photoOf(after.media[1]!)).toBeTruthy()

    const { data: version } = await admin
      .from('post_versions')
      .select('change_summary, changed_by')
      .eq('post_id', id)
      .eq('version', after.version)
      .single()
    expect(version).toEqual({ change_summary: 'Izmenjen tekst na slikama', changed_by: user.id })
    expect((await getTokenBalance(wsId)).available).toBe(tokens)
  })

  it('naslov objave prati prvi slajd; isti tekst ne menja ništa; stara verzija dobija 409', async () => {
    const id = await carousel('draft')
    const before = await postOf(id)
    const r = await save(id, before.version, edited(0, { title: 'Doček u Beogradu' }))
    expect(r.json.data).toEqual({ version: before.version + 1, changed: 1, rest: 0 })
    const after = await postOf(id)
    expect(after.title).toBe('Doček u Beogradu')
    expect(after.status).toBe('draft')

    const same = await save(id, after.version, edited(0, { title: '  Doček u   Beogradu ' }))
    expect(same.json.data).toEqual({ version: after.version, changed: 0, rest: 0 })
    const stale = await save(id, before.version, edited(2, { title: 'Pozovite nas' }))
    expect(stale.status).toBe(409)
  })

  it('odobrena objava se vraća u nacrt, a zakazana ne menja tekst', async () => {
    const approved = await carousel('approved')
    const before = await postOf(approved)
    await save(approved, before.version, edited(2, { title: 'Pozovite nas' }))
    expect((await postOf(approved)).status).toBe('draft')

    const scheduled = await carousel('scheduled')
    const detail = await call<{ canEditText: boolean }>(detailGet, `/api/approvals/${scheduled}`, {
      token: user.token,
      params: { id: scheduled },
    })
    expect(detail.json.data!.canEditText).toBe(false)
    const r = await save(scheduled, (await postOf(scheduled)).version, edited(2, { title: 'Pozovite nas' }))
    expect(r.status).toBe(409)
    expect(r.json.error!.message).toContain('zakazanoj')
  })

  it('objava koja ne pamti temu crta se cela u temi brenda, sa istim fotografijama', async () => {
    const id = await carousel('in_review', false)
    const before = await postOf(id)
    const r = await save(id, before.version, edited(2, { title: 'Pozovite nas' }))
    expect(r.json.data!.changed).toBe(1)
    const after = await postOf(id)
    expect(after.media.some((m) => before.media.includes(m))).toBe(false)
    expect(after.media).toHaveLength(slides.length)
    const design = after.design as { colors: { background: string }; fonts: { headings: string } }
    expect(design).toMatchObject({ colors: { background: '#0E0C09' }, fonts: { headings: 'Lora' } })
  })

  it('video: nov sloj samo za izmenjen kadar, nova slika i trajanje, a MP4 se skida da ga pregledač napravi', async () => {
    const id = await videoDraft()
    const { data: start } = await admin.from('posts').select('version').eq('id', id).single()
    await call(attachPost, `/api/approvals/${id}/theme-video`, {
      token: user.token,
      params: { id },
      body: { version: start!.version, mediaAssetId: await renderedMp4() },
    })
    const before = await postOf(id)
    const old = (before.design as { video: { overlayAssetIds: string[]; posterAssetId: string } }).video
    const text = await call<{ format: string; slides: Array<{ title: string }> }>(
      textGet,
      `/api/approvals/${id}/slides`,
      { token: user.token, params: { id } },
    )
    expect(text.json.data!.format).toBe('video')
    const title = 'Novogodišnja noć na splavu uz živu muziku do jutra'
    const body = scenes.map((s, i) =>
      i === 0 ? { ...s, title, body: 'Doček sa pogledom na reku i vatrometom.' } : s,
    )
    const shot = await preview(id, { index: 0, slide: body[0] })
    expect(shot.type).toBe('image/jpeg')
    expect((await sharp(shot.bytes).metadata()).height).toBe(960)

    const r = await save(id, before.version, body)
    expect(r.json.data).toEqual({ version: before.version + 1, changed: 1, rest: 0 })
    const after = await postOf(id)
    const video = (
      after.design as {
        video: {
          overlayAssetIds: string[]
          posterAssetId: string
          renderedAssetId: string | null
          seconds: number[]
        }
      }
    ).video
    expect(video.overlayAssetIds[0]).not.toBe(old.overlayAssetIds[0])
    expect(video.overlayAssetIds.slice(1)).toEqual(old.overlayAssetIds.slice(1))
    expect(video.posterAssetId).not.toBe(old.posterAssetId)
    expect(video.renderedAssetId).toBeNull()
    expect(video.seconds[0]).toBe(
      sceneSeconds({ kind: 'cover', title, body: 'Doček sa pogledom na reku i vatrometom.' }),
    )
    expect(after.media).toEqual([])
    expect(after.status).toBe('in_review')
    const pending = await call<{ items: Array<{ id: string }> }>(pendingGet, '/api/approvals/videos', {
      token: user.token,
      query: { brandId },
    })
    expect(pending.json.data!.items.map((i) => i.id)).toContain(id)
  })

  it('kad vreme zahteva istekne, čuva se nacrtano, a ostatak stiže u sledećem zahtevu', async () => {
    const id = await carousel('in_review')
    const before = await postOf(id)
    const wanted = slides.map((s, i) => (i === 1 ? s : { ...s, title: `${s.title} (nova)` }))
    setRenderBudgetForTests(0)
    try {
      const first = await save(id, before.version, wanted)
      expect(first.json.data).toEqual({ version: before.version + 1, changed: 1, rest: 1 })
      const half = await postOf(id)
      const text = (half.design as { copy: { slides: Array<{ title: string }> } }).copy.slides
      expect(text.map((s) => s.title)).toEqual(['Noć u Beogradu (nova)', slides[1]!.title, 'Pišite nam'])
      expect(half.media[2]).toBe(before.media[2])

      const second = await save(id, half.version, wanted)
      expect(second.json.data).toEqual({ version: half.version + 1, changed: 1, rest: 0 })
      const after = await postOf(id)
      expect((after.design as { copy: { slides: Array<{ title: string }> } }).copy.slides[2]!.title).toBe(
        'Pišite nam (nova)',
      )
      expect(after.media[1]).toBe(before.media[1])
      expect(after.media[2]).not.toBe(before.media[2])
    } finally {
      setRenderBudgetForTests(15_000)
    }
  })
})
