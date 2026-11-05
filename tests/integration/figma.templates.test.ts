import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GET as previewGet } from '@/app/api/brands/[id]/design/templates/preview/route'
import {
  DELETE as templatesDelete,
  GET as templatesGet,
  PATCH as templatesPatch,
} from '@/app/api/brands/[id]/design/templates/route'
import { POST as templatesPost } from '@/app/api/figma/templates/route'
import { GET as callbackGet } from '@/app/api/integrations/figma/callback/route'
import { GET as connectGet } from '@/app/api/integrations/figma/connect/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { clearFlagCache, setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { getBrand } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { inTheme } from '@/services/design/harmonize'
import type { PostDesignContext } from '@/services/design/post-design'
import { renderDesignSlides } from '@/services/design/render-post'

import { figmaHandlers, resetFigmaState } from './figma-mock'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { getViewerFromRequest } from '@/lib/auth/viewer'

/**
 * Figma šabloni (D-162): okvir sa #pozadina i slojevima postaje šablon brenda (pozadina kao Sovin
 * crtež), uključen šablon crta objave svog formata, pregled koristi logo brenda, okvir bez #pozadina
 * se odbija sa uputstvom, a „Uskladi sa temom” vidi objave nacrtane bez šablona.
 */
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
let user: TestUser
let wsId = ''
let brandId = ''

const raw = (handler: typeof connectGet, path: string) =>
  handler(new NextRequest(new URL(path, APP), { headers: { authorization: `Bearer ${user.token}` } }), {
    params: Promise.resolve({}),
  })

beforeAll(async () => {
  configureFontLoader({ remote: false })
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...figmaHandlers)
  setFeatureFlagForTests('figma', true)
  user = await createTestUser('figma-tpl')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Figma šabloni', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const go = await raw(connectGet, `/api/integrations/figma/connect?workspaceId=${wsId}`)
  const state = new URL(go.headers.get('location')!).searchParams.get('state')!
  await raw(callbackGet, `/api/integrations/figma/callback?state=${state}&code=good-code`)
  resetFigmaState()
})

afterAll(async () => {
  setFeatureFlagForTests('figma', null)
  clearFlagCache()
  resetMemoryRateLimit()
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('Figma šabloni (D-162)', () => {
  let templateId = ''

  it('okvir bez #pozadina i #naslov se odbija sa uputstvom', async () => {
    const r = await call(templatesPost, '/api/figma/templates', {
      token: user.token,
      body: { brandId, fileKey: 'KlimaFajl1234567', name: 'Loš', nodeIds: ['1:1'] },
    })
    expect(r.status).toBe(400)
    expect(r.json.error?.message).toMatch(/#pozadina/)
  })

  it('čuvanje šablona: raspored u dizajnu brenda, pozadina kao Sovin crtež, šablon još nije uključen', async () => {
    const r = await call<{ id: string; name: string; format: string; active: boolean }>(
      templatesPost,
      '/api/figma/templates',
      {
        token: user.token,
        body: { brandId, fileKey: 'KlimaFajl1234567', name: 'Klima naslovni', nodeIds: ['5:1'] },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ name: 'Klima naslovni', format: 'portrait', active: false })
    templateId = r.json.data!.id
    const { data: brand } = await admin.from('brands').select('design').eq('id', brandId).single()
    const tpl = (
      brand!.design as {
        templates: Array<{ frames: { cover: { background: { assetId: string; w: number } } } }>
      }
    ).templates[0]!
    expect(tpl.frames.cover.background.w).toBe(1080)
    const { data: bg } = await admin
      .from('media_assets')
      .select('source, bucket, mime_type')
      .eq('id', tpl.frames.cover.background.assetId)
      .single()
    expect(bg).toMatchObject({ source: 'template', bucket: 'generated', mime_type: 'image/png' })
    const list = await call<Array<{ id: string; active: boolean }>>(
      templatesGet,
      `/api/brands/${brandId}/design/templates`,
      {
        token: user.token,
        params: { id: brandId },
      },
    )
    expect(list.json.data).toEqual([expect.objectContaining({ id: templateId, active: false })])
  })

  it('pregled šablona je PNG širine 360', async () => {
    const res = await previewGet(
      new NextRequest(
        new URL(`/api/brands/${brandId}/design/templates/preview?templateId=${templateId}&kind=point`, APP),
        {
          headers: { authorization: `Bearer ${user.token}` },
        },
      ),
      { params: Promise.resolve({ id: brandId }) },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(360)
  })

  it('uključen šablon crta objave svog formata, a priča (drugi format) ostaje u stilu', async () => {
    const on = await call(templatesPatch, `/api/brands/${brandId}/design/templates`, {
      token: user.token,
      method: 'PATCH',
      params: { id: brandId },
      body: { templateId },
    })
    expect(on.status).toBe(200)
    const viewer = (await getViewerFromRequest(
      new NextRequest(`${APP}/api/brands`, { headers: { authorization: `Bearer ${user.token}` } }),
    ))!
    const design = await resolveDesign(await getBrand(viewer, brandId))
    expect(design.template?.id).toBe(templateId)
    const slides = [
      { kind: 'cover' as const, title: 'Klima koja hladi', body: 'Servis pre sezone.' },
      { kind: 'point' as const, title: 'Dubinsko čišćenje', body: 'Filter, izmenjivač i odvod.' },
    ]
    const base = {
      workspaceId: wsId,
      brandId,
      design,
      styleId: design.styleId,
      slides,
      photoSource: 'none' as const,
      query: 'klima',
      uploadedBy: user.id,
    }
    const post = await renderDesignSlides({ ...base, format: 'portrait' })
    const { data: drawn } = await admin
      .from('media_assets')
      .select('source_data, width, height')
      .in('id', post.assetIds)
    expect(drawn!.every((a) => (a.source_data as { templateId: string }).templateId === templateId)).toBe(
      true,
    )
    expect(drawn!.every((a) => a.width === 1080 && a.height === 1350)).toBe(true)
    const story = await renderDesignSlides({ ...base, format: 'story' })
    const { data: storyDrawn } = await admin
      .from('media_assets')
      .select('source_data')
      .in('id', story.assetIds)
    expect(
      storyDrawn!.every((a) => (a.source_data as { templateId: string | null }).templateId === null),
    ).toBe(true)

    // „Uskladi sa temom”: objava bez šablona nije u temi, objava sa njim jeste; priča ne gleda šablon
    const postDesign = {
      format: 'carousel',
      size: 'portrait',
      styleId: design.styleId,
      colors: design.colors,
      fonts: design.fonts,
      logoAssetId: design.logoAssetId,
      logoVersion: 2,
    } as unknown as PostDesignContext
    expect(inTheme({ ...postDesign, templateId }, design)).toBe(true)
    expect(inTheme({ ...postDesign, templateId: null }, design)).toBe(false)
    expect(inTheme({ ...postDesign, format: 'story', templateId: null }, design)).toBe(true)
  })

  it('brisanje uključenog šablona vraća stil teme', async () => {
    const r = await call<unknown[]>(templatesDelete, `/api/brands/${brandId}/design/templates`, {
      token: user.token,
      method: 'DELETE',
      params: { id: brandId },
      query: { templateId },
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toEqual([])
    const { data: brand } = await admin.from('brands').select('design').eq('id', brandId).single()
    expect(brand!.design).toMatchObject({ templates: [], templateId: null })
  })
})
