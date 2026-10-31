import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { PATCH as designPatch } from '@/app/api/brands/[id]/design/route'
import { GET as looksGet, POST as looksPost } from '@/app/api/brands/[id]/design/looks/route'
import { GET as plansGet } from '@/app/api/plans/route'
import { GET as previewGet } from '@/app/api/visuals/preview/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setCrawlDepsForTests } from '@/lib/crawler/deps'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { safeFetch } from '@/lib/ssrf'
import { configureFontLoader } from '@/lib/visuals/fonts'
import { LOOK_FONTS } from '@/lib/visuals/design/font-choices'
import { contrast } from '@/lib/visuals/design/kit'
import { resolveDesign } from '@/services/design/brand-design'
import { renderDesignSlides } from '@/services/design/render-post'

import { fixtureHandlers } from './fixture-site'
import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Izgled brenda (D-123): Sova poseti sajt (lažni fixture-site.test: narandžasta #ff6600, teget
 * #003366, naslovi u Playfair Display-u, tekst u Poppins-u), napravi tri predloga, a korisnik bira jedan ili sastavlja
 * svoj. Izabran font važi u svakom stilu, a nov plan podrazumevano uzima izgled brenda.
 */
interface LookOption {
  id: string
  styleId: string
  colors: { primary: string; secondary: string; background: string; text: string; muted: string }
  fonts: { headings: string; body: string }
}
interface LooksView {
  website: string | null
  site: { url: string; source: string; options: LookOption[] } | null
  siteError: string | null
  visit: boolean
  custom: { styleId: string; primary: string; tertiary: string; font: string }
  current: string | null
  fonts: string[]
}

let user: TestUser
let wsId = ''
let brandId = ''

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(
    ...fixtureHandlers,
    // sajt iza Cloudflare provere: Sova ne može da ga otvori
    http.get('https://down-site.test/*', () =>
      HttpResponse.text('<html><title>Just a moment...</title></html>', {
        status: 503,
        headers: { 'content-type': 'text/html' },
      }),
    ),
  )
  setCrawlDepsForTests({
    fetch: (input, options) =>
      safeFetch(input, { ...options, resolve: async () => ['93.184.216.34'], fetchImpl: fetch }),
    now: Date.now,
  })
  configureFontLoader({ remote: false })
  user = await createTestUser('looks')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Izgled test', type: 'business', websiteUrl: 'fixture-site.test' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => resetMemoryRateLimit())

afterAll(async () => {
  setCrawlDepsForTests(null)
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

const looks = (method: 'GET' | 'POST') =>
  call<LooksView>(method === 'GET' ? looksGet : looksPost, `/api/brands/${brandId}/design/looks`, {
    method,
    token: user.token,
    params: { id: brandId },
  })

describe('izgled brenda sa sajta (D-123)', () => {
  it('pre posete: predloga nema, birač zna da treba da poseti sajt; sopstveni izgled je u Okviru', async () => {
    const r = await looks('GET')
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ site: null, visit: true, current: null, siteError: null })
    expect(r.json.data!.website).toContain('fixture-site.test')
    expect(r.json.data!.custom.styleId).toBe('framed')
    expect(r.json.data!.fonts).toEqual(expect.arrayContaining([...LOOK_FONTS]))
  })

  it('poseta sajtu: tri predloga u bojama i fontovima sajta, zapamćeni za sledeći put', async () => {
    const r = await looks('POST')
    expect(r.status).toBe(200)
    const view = r.json.data!
    expect(view.site?.source).toBe('site')
    expect(view.visit).toBe(false)
    const options = view.site!.options
    expect(options.map((o) => o.id)).toEqual(['site-1', 'site-2', 'site-3'])
    expect(new Set(options.map((o) => o.styleId)).size).toBe(3)
    // boje sa sajta: narandžasta je podloga trećeg, teget ili narandžasta su naglasci
    expect(options[2]!.colors.background).toBe('#FF6600')
    expect(options.flatMap((o) => [o.colors.primary, o.colors.secondary])).toContain('#FF6600')
    for (const o of options) {
      expect(contrast(o.colors.text, o.colors.background)).toBeGreaterThanOrEqual(4.5)
      // naslovi i tekst sa sajta ostaju razdvojeni
      expect(o.fonts).toEqual({ headings: 'Playfair Display', body: 'Poppins' })
    }
    expect(view.fonts.slice(0, 2)).toEqual(['Playfair Display', 'Poppins'])
    const { data } = await admin.from('brands').select('design').eq('id', brandId).single()
    expect((data!.design as { siteVisual: { source: string; primary: string } }).siteVisual).toMatchObject({
      source: 'site',
      primary: '#FF6600',
    })
    const again = await looks('GET')
    expect(again.json.data!.site?.source).toBe('site')
    expect(again.json.data!.visit).toBe(false)
  })

  it('izbor predloga menja stil, boje i font brenda; font važi i u stilu sa svojim fontom', async () => {
    const view = (await looks('GET')).json.data!
    const dark = view.site!.options[1]!
    const r = await call<{ styleId: string; look: string; fontsLocked: boolean }>(
      designPatch,
      `/api/brands/${brandId}/design`,
      {
        method: 'PATCH',
        token: user.token,
        params: { id: brandId },
        body: { look: dark.id, styleId: dark.styleId, colors: dark.colors, fonts: dark.fonts },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ styleId: dark.styleId, look: 'site-2', fontsLocked: true })
    expect((await looks('GET')).json.data!.current).toBe('site-2')
    const { data: brand } = await admin.from('brands').select('*').eq('id', brandId).single()
    const design = await resolveDesign(brand!)
    expect(design.fonts).toEqual({ headings: 'Playfair Display', body: 'Poppins' })
    // stil podešen za uski Oswald crta se fontom brenda bez greške (širina naslova se prilagođava)
    const rendered = await renderDesignSlides({
      workspaceId: wsId,
      brandId,
      design,
      styleId: 'magazine',
      format: 'portrait',
      slides: [{ kind: 'cover', title: 'Tri promene koje donose više upita i poziva', body: 'Kratko.' }],
      photoSource: 'none',
      query: 'office',
      uploadedBy: null,
    })
    expect(rendered.assetIds).toHaveLength(1)
    // nov plan podrazumevano pravi objave u izgledu brenda
    const page = await call<{ options: { brandLook: boolean } }>(plansGet, '/api/plans', {
      token: user.token,
      query: { brandId },
    })
    expect(page.json.data!.options.brandLook).toBe(true)
  })

  it('sopstveni izgled: tri boje i font; pogrešno ime fonta se odbija; pregled prima font', async () => {
    const bad = await call(designPatch, `/api/brands/${brandId}/design`, {
      method: 'PATCH',
      token: user.token,
      params: { id: brandId },
      body: { fonts: { headings: 'Inter;drop', body: 'Inter' } },
    })
    expect(bad.status).toBe(400)
    const ok = await call<{ look: string; colors: { background: string }; fonts: { headings: string } }>(
      designPatch,
      `/api/brands/${brandId}/design`,
      {
        method: 'PATCH',
        token: user.token,
        params: { id: brandId },
        body: {
          look: 'custom',
          styleId: 'framed',
          colors: {
            primary: '#E11D48',
            secondary: '#0EA5E9',
            background: '#FEF3C7',
            text: '#111111',
            muted: '#6B6B5A',
          },
          fonts: { headings: 'Lora', body: 'Lora' },
        },
      },
    )
    expect(ok.status).toBe(200)
    expect(ok.json.data).toMatchObject({
      look: 'custom',
      colors: { background: '#FEF3C7' },
      fonts: { headings: 'Lora' },
    })
    const view = (await looks('GET')).json.data!
    expect(view.custom).toMatchObject({
      styleId: 'framed',
      primary: '#E11D48',
      tertiary: '#FEF3C7',
      font: 'Lora',
    })

    const { NextRequest } = await import('next/server')
    const app = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    const res = await previewGet(
      new NextRequest(
        new URL(
          `/api/visuals/preview?brandId=${brandId}&styleId=framed&kind=cover&format=story&c=E11D48-0EA5E9-FEF3C7-111111-6B6B5A&f=Lora`,
          app,
        ),
        { headers: { authorization: `Bearer ${user.token}`, origin: app } },
      ),
      { params: Promise.resolve({}) },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')

    // vraćanje na podrazumevano briše izbor, a pamti poslednju posetu sajtu
    await call(designPatch, `/api/brands/${brandId}/design`, {
      method: 'PATCH',
      token: user.token,
      params: { id: brandId },
      body: { reset: true },
    })
    const { data } = await admin.from('brands').select('design').eq('id', brandId).single()
    expect(Object.keys(data!.design as object)).toEqual(['siteVisual'])
  })

  it('sajt koji ne može da se otvori: poruka, a predlozi iz poslednje posete ostaju', async () => {
    await admin.from('brands').update({ website_url: 'https://down-site.test' }).eq('id', brandId)
    const r = await looks('POST')
    expect(r.status).toBe(200)
    expect(r.json.data!.siteError).toMatch(/nije mogao da se otvori/)
    expect(r.json.data!.site?.options).toHaveLength(3)
    await admin.from('brands').update({ website_url: null }).eq('id', brandId)
    const none = await looks('POST')
    expect(none.status).toBe(400)
  })
})
