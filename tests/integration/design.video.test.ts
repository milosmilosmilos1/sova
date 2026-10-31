import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueHarmonize: vi.fn(async () => {}),
  enqueueTargetScheduled: vi.fn(async () => {}),
  enqueueTargetUnscheduled: vi.fn(async () => {}),
}))

import sharp from 'sharp'

import { GET as detailGet } from '@/app/api/approvals/[id]/route'
import { GET as specGet, POST as attachPost } from '@/app/api/approvals/[id]/theme-video/route'
import { GET as listGet } from '@/app/api/approvals/route'
import { GET as pendingGet } from '@/app/api/approvals/videos/route'
import { POST as bulkPost } from '@/app/api/posts/bulk/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueTargetScheduled } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { videoScenes } from '@/lib/visuals/design/video'
import type { StepRunner } from '@/services/autopilot/runner'
import { resolveDesign } from '@/services/design/brand-design'
import { harmonizePost, offThemeDraftIds } from '@/services/design/harmonize'
import { buildThemeVideoInSteps, videoPostDesign } from '@/services/design/video-post'
import type { Json } from '@/types/database'

import { buildMp4 } from '../fixtures/mp4'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, unsplashHandlers } from './visuals-mock'

/**
 * Video u temi (D-128): nacrt sa kadrovima, snimcima i slojem teksta teme čeka da ga pregledač
 * napravi; tek sa gotovim MP4 može da se zakaže, a nova tema crta slojeve ponovo sa istim snimcima.
 */
let user: TestUser
let wsId = ''
let brandId = ''
const accountIds: string[] = []
const inline: StepRunner = (_name, fn) => fn()

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

const scenes = videoScenes([
  { kind: 'cover', title: 'Novogodišnja noć u Beogradu' },
  { kind: 'point', title: 'Fiksne cene', body: 'Potvrđene pismeno, bez iznenađenja.' },
  { kind: 'point', title: 'Domaćin na WhatsApp-u', body: 'Do poslednje pesme.' },
  { kind: 'cta', title: 'Rezervišite sto' },
])

/** Nacrt sa videom u temi, na odobravanju, sa Instagramom i Facebook-om. */
async function videoDraft(): Promise<{ id: string; clips: string[] }> {
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
  const design = videoPostDesign(
    { topic: 'Novogodišnja noć', cta: null, locale: 'sr-Latn', platforms: ['instagram', 'facebook'] },
    theme,
    scenes,
    video,
  )
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      title: 'Novogodišnja noć u Beogradu',
      master_text: 'Rezervišite sto za doček. #beograd',
      status: 'in_review',
      source: 'ai',
      language: 'sr-Latn',
      created_by: user.id,
      design: design as unknown as Json,
    })
    .select('id')
    .single()
  if (error || !post) throw new Error(error?.message)
  await admin.from('post_targets').insert([
    {
      post_id: post.id,
      brand_id: brandId,
      social_account_id: accountIds[0]!,
      platform: 'instagram',
      text_content: '',
    },
    {
      post_id: post.id,
      brand_id: brandId,
      social_account_id: accountIds[1]!,
      platform: 'facebook',
      text_content: '',
    },
  ])
  return { id: post.id, clips: video.clipAssetIds }
}

/** Gotov MP4 iz pregledača u biblioteci brenda (kao posle otpremanja). */
async function renderedMp4(): Promise<string> {
  const path = `ws/${wsId}/brand/${brandId}/uploads/${crypto.randomUUID()}.mp4`
  const bytes = buildMp4({ durationMs: 12_000, width: 1080, height: 1920 })
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
      duration_ms: 12_000,
      uploaded_by: user.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}

const minute = (hours: number) => {
  const when = new Date(Date.now() + hours * 3600_000)
  when.setSeconds(0, 0)
  return when.toISOString()
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  user = await createTestUser('theme-video')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Video u temi', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin.from('brands').update({ design: THEME }).eq('id', brandId)
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active' as const,
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  }
  const { data, error } = await admin
    .from('social_accounts')
    .insert([
      {
        ...base,
        platform: 'instagram',
        external_id: `ig-video-${Date.now()}`,
        name: 'IG',
        account_type: 'instagram_business',
      },
      {
        ...base,
        platform: 'facebook',
        external_id: `fb-video-${Date.now()}`,
        name: 'FB',
        account_type: 'facebook_page',
      },
    ])
    .select('id, platform')
  if (error) throw new Error(error.message)
  accountIds.push(
    data!.find((a) => a.platform === 'instagram')!.id,
    data!.find((a) => a.platform === 'facebook')!.id,
  )
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('video u temi (D-128)', () => {
  let postId = ''

  it('nacrt čeka pregledač: lista i detalj imaju sliku videa, a zakazivanje traži MP4', async () => {
    postId = (await videoDraft()).id
    const list = await call<{
      items: Array<{ id: string; format: string; videoPending: boolean; thumb: string | null }>
    }>(listGet, '/api/approvals', { token: user.token, query: { brandId, tab: 'waiting' } })
    expect(list.json.data!.items.find((i) => i.id === postId)).toMatchObject({
      format: 'video',
      videoPending: true,
      thumb: expect.stringMatching(/^http/),
    })
    const detail = await call<{ video: { pending: boolean; posterUrl: string | null } }>(
      detailGet,
      `/api/approvals/${postId}`,
      { token: user.token, params: { id: postId } },
    )
    expect(detail.json.data!.video).toMatchObject({
      pending: true,
      posterUrl: expect.stringMatching(/^http/),
    })
    const pending = await call<{ items: Array<{ id: string }> }>(pendingGet, '/api/approvals/videos', {
      token: user.token,
      query: { brandId },
    })
    expect(pending.json.data!.items.map((i) => i.id)).toContain(postId)

    const r = await call<{ done: string[]; failed: Array<{ message: string }> }>(
      bulkPost,
      '/api/posts/bulk',
      {
        token: user.token,
        body: { ids: [postId], action: 'schedule', at: { [postId]: minute(30) } },
      },
    )
    expect(r.json.data!.done).toEqual([])
    expect(r.json.data!.failed[0]!.message).toContain('Video još nije napravljen')
    const { data: post } = await admin.from('posts').select('status').eq('id', postId).single()
    expect(post!.status).toBe('in_review')
  })

  it('kadrovi za pregledač: providan sloj teksta, snimak koji kadar nastavlja i trajanje', async () => {
    const r = await call<{
      version: number
      width: number
      height: number
      scenes: Array<{ overlayUrl: string; seconds: number; clip: { url: string; start: number } | null }>
    }>(specGet, `/api/approvals/${postId}/theme-video`, { token: user.token, params: { id: postId } })
    expect(r.status).toBe(200)
    const spec = r.json.data!
    expect(spec).toMatchObject({ width: 1080, height: 1920 })
    expect(spec.scenes).toHaveLength(scenes.length)
    expect(spec.scenes[0]!.clip).toMatchObject({ start: 0 })
    // drugi kadar nastavlja isti snimak tamo gde je prvi stao
    expect(spec.scenes[1]!.clip!.url.split('?')[0]).toBe(spec.scenes[0]!.clip!.url.split('?')[0])
    expect(spec.scenes[1]!.clip!.start).toBe(spec.scenes[0]!.seconds)

    const { data: row } = await admin.from('posts').select('design').eq('id', postId).single()
    const overlayId = (row!.design as { video: { overlayAssetIds: string[] } }).video.overlayAssetIds[0]!
    const { data: asset } = await admin
      .from('media_assets')
      .select('bucket, storage_path')
      .eq('id', overlayId)
      .single()
    const file = await admin.storage.from(asset!.bucket).download(asset!.storage_path)
    const png = sharp(Buffer.from(await file.data!.arrayBuffer()))
    const meta = await png.metadata()
    expect(meta).toMatchObject({ format: 'png', width: 1080, height: 1920, hasAlpha: true })
    // Pola-pola: gornja polovina je snimak (providno), donja je ploča teme sa tekstom
    const stats = await png.stats()
    expect(stats.channels[3]!.min).toBe(0)
    expect(stats.channels[3]!.max).toBe(255)
  })

  it('gotov MP4 se kači na objavu; stara verzija se odbija; posle toga video može da se zakaže', async () => {
    const { data: before } = await admin.from('posts').select('version').eq('id', postId).single()
    const mp4 = await renderedMp4()
    const stale = await call(attachPost, `/api/approvals/${postId}/theme-video`, {
      token: user.token,
      params: { id: postId },
      body: { version: before!.version - 1 || 99, mediaAssetId: mp4 },
    })
    expect(stale.status).toBe(409)
    const ok = await call<{ version: number }>(attachPost, `/api/approvals/${postId}/theme-video`, {
      token: user.token,
      params: { id: postId },
      body: { version: before!.version, mediaAssetId: mp4 },
    })
    expect(ok.json.data).toEqual({ version: before!.version + 1 })
    const { data: post } = await admin
      .from('posts')
      .select('status, design, post_media(media_asset_id)')
      .eq('id', postId)
      .single()
    expect(post!.post_media).toEqual([{ media_asset_id: mp4 }])
    expect((post!.design as { video: { renderedAssetId: string } }).video.renderedAssetId).toBe(mp4)
    const pending = await call<{ items: Array<{ id: string }> }>(pendingGet, '/api/approvals/videos', {
      token: user.token,
      query: { brandId },
    })
    expect(pending.json.data!.items.map((i) => i.id)).not.toContain(postId)

    const r = await call<{ done: string[]; failed: Array<{ message: string }> }>(
      bulkPost,
      '/api/posts/bulk',
      {
        token: user.token,
        body: { ids: [postId], action: 'schedule', at: { [postId]: minute(30) } },
      },
    )
    expect(r.json.data).toMatchObject({ done: [postId], failed: [] })
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledTimes(2)
  })

  it('nova tema: slojevi teksta se crtaju ponovo sa istim snimcima, a MP4 se skida da ga pregledač napravi', async () => {
    const draft = await videoDraft()
    const { data: before } = await admin.from('posts').select('version, design').eq('id', draft.id).single()
    await call(attachPost, `/api/approvals/${draft.id}/theme-video`, {
      token: user.token,
      params: { id: draft.id },
      body: { version: before!.version, mediaAssetId: await renderedMp4() },
    })
    await admin
      .from('brands')
      .update({
        design: {
          ...THEME,
          look: 'light-1',
          styleId: 'headline',
          colors: {
            primary: '#2563EB',
            secondary: '#0EA5E9',
            background: '#F8FAFC',
            text: '#0F172A',
            muted: '#64748B',
          },
        },
      })
      .eq('id', brandId)
    expect(await offThemeDraftIds(brandId)).toContain(draft.id)
    expect(await harmonizePost(draft.id)).toBe('done')
    const { data: after } = await admin
      .from('posts')
      .select('design, post_media(media_asset_id)')
      .eq('id', draft.id)
      .single()
    const old = (before!.design as { video: { overlayAssetIds: string[] } }).video
    const design = after!.design as {
      styleId: string
      colors: { background: string }
      video: { clipAssetIds: string[]; overlayAssetIds: string[]; renderedAssetId: string | null }
    }
    // tipografska tema ide preko snimka kao Poster
    expect(design).toMatchObject({ styleId: 'poster', colors: { background: '#F8FAFC' } })
    expect(design.video.clipAssetIds).toEqual(draft.clips)
    expect(design.video.overlayAssetIds.some((id) => old.overlayAssetIds.includes(id))).toBe(false)
    expect(design.video.renderedAssetId).toBeNull()
    expect(after!.post_media).toHaveLength(0)
    expect(await offThemeDraftIds(brandId)).not.toContain(draft.id)
  })
})
