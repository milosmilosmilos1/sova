import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as biosPost } from '@/app/api/brands/[id]/profile-kit/bios/route'
import { GET as coverGet } from '@/app/api/brands/[id]/profile-kit/highlights/[index]/cover/route'
import { POST as storyPost } from '@/app/api/brands/[id]/profile-kit/highlights/[index]/story/route'
import { GET as coversGet } from '@/app/api/brands/[id]/profile-kit/highlights/covers/route'
import { POST as highlightsPost } from '@/app/api/brands/[id]/profile-kit/highlights/route'
import { GET as kitGet } from '@/app/api/brands/[id]/profile-kit/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetPexelsCacheForTests } from '@/integrations/pexels/client'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { emptyProfile } from '@/lib/brand/profile-schema'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { pexelsHandlers, resetVisualsState, unsplashHandlers } from './visuals-mock'

/**
 * Profili na mrežama (D-143): opisi za svih osam mreža iz profila brenda, 3 tokena, sajt u opisima gde
 * ga mreža prikazuje, bez linka u opisu Google profila; neuspeh vraća tokene i ne briše stare opise.
 * Instagram highlights (D-144): naslovi i kadrovi za 3 tokena, naslovne 1080×1920 i priča u Odobravanju.
 */
let owner: TestUser
let wsId = ''
let brandId = ''
let instagramId = ''
const SITE = 'https://adaptiko.rs'
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

const reply = {
  instagram: {
    name: 'Adaptiko | Adaptacija stanova',
    short: 'Adaptacija stanova po fiksnoj ceni 🏠\nBeograd\n👇 Zakažite procenu',
  },
  facebook: {
    short: 'Adaptacija stanova po fiksnoj ceni.',
    long: 'Renoviramo stanove od projekta do ključa, po fiksnoj ceni.',
  },
  linkedin: {
    short: 'Adaptacija stanova od projekta do ključa',
    long: 'Adaptiko vodi adaptacije stanova u Beogradu od projekta do ključa.',
    keywords: ['Adaptacija stanova', 'Renoviranje', '#Enterijer'],
  },
  tiktok: { name: 'Adaptiko', short: 'Pre i posle adaptacije 🔨' },
  x: { name: 'Adaptiko', short: 'Adaptacija stanova u Beogradu, po fiksnoj ceni.' },
  youtube: {
    long: 'Pre i posle adaptacija stanova i saveti za renoviranje.',
    keywords: ['adaptacija', 'renoviranje'],
  },
  pinterest: { name: 'Adaptiko adaptacija stanova', long: 'Ideje za adaptaciju i enterijer stanova.' },
  google_business: { long: 'Adaptacija stanova u Beogradu po fiksnoj ceni. Više na https://adaptiko.rs.' },
}

async function balance(): Promise<number> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${owner.token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  const { data, error } = await client.rpc('workspace_token_balance', { p_workspace_id: wsId })
  if (error || !data) throw new Error(`balance: ${error?.message ?? 'null'}`)
  return (data as { available: number }).available
}

const generate = () =>
  call<{ kit: ProfileKitView; tokensCharged: number }>(biosPost, `/api/brands/${brandId}/profile-kit/bios`, {
    token: owner.token,
    params: { id: brandId },
    headers: { 'idempotency-key': crypto.randomUUID() },
  })

const frame = (title: string, body: string) => ({ title, body })
const highlightsReply = {
  highlights: [
    {
      title: 'Usluge',
      icon: 'services',
      visual_query: 'apartment renovation',
      frames: [
        frame('Adaptacija od projekta do ključa', 'Jedan koordinator vodi ceo posao.'),
        frame('Kupatila i kuhinje', 'Radimo i delimične adaptacije.'),
        frame('Zakažite procenu', 'Pišite nam u poruke ili posetite adaptiko.rs.'),
      ],
    },
    {
      title: 'Kako radimo',
      icon: 'process',
      visual_query: 'construction workers apartment',
      frames: [
        frame('Procena na licu mesta', 'Dolazimo, merimo i dajemo fiksnu ponudu.'),
        frame('Javite nam se', 'Pošaljite poruku sa adresom stana.'),
      ],
    },
    // isti naslov kao prvi, drugačija veličina slova
    { title: 'usluge', icon: 'prices', visual_query: 'x', frames: [frame('Ponovljen', '')] },
    {
      title: 'Kontakt i radno vreme',
      icon: 'contact',
      visual_query: 'phone call',
      frames: [frame('Pozovite nas', '')],
    },
  ],
}

const generateHighlights = () =>
  call<{ kit: ProfileKitView; tokensCharged: number }>(
    highlightsPost,
    `/api/brands/${brandId}/profile-kit/highlights`,
    {
      token: owner.token,
      params: { id: brandId },
      headers: { 'idempotency-key': crypto.randomUUID() },
    },
  )

/** Odgovor sa bajtovima (PNG, ZIP), bez čitanja JSON-a. */
async function raw(handler: typeof coversGet, path: string, params: Record<string, string>) {
  const res = await handler(
    new NextRequest(new URL(path, APP), { headers: { authorization: `Bearer ${owner.token}`, origin: APP } }),
    { params: Promise.resolve(params) },
  )
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) }
}

const story = (index: number) =>
  call<{ postId: string; status: string; notes: string[] }>(
    storyPost,
    `/api/brands/${brandId}/profile-kit/highlights/${index}/story`,
    { token: owner.token, params: { id: brandId, index: String(index) }, method: 'POST' },
  )

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers, ...pexelsHandlers)
  configureFontLoader({ remote: false })
  owner = await createTestUser('profile-kit')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Adaptiko', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const profile = emptyProfile({ name: 'Adaptiko', contentLocale: 'sr-Latn', websiteUrl: SITE })
  profile.identity.description.value = 'Adaptacija stanova od projekta do ključa, po fiksnoj ceni.'
  const inserted = await admin
    .from('brand_profiles')
    .insert({ brand_id: brandId, version: 1, data: profile, is_current: true })
  if (inserted.error) throw new Error(inserted.error.message)
  // ostala podešavanja brenda moraju ostati posle čuvanja opisa
  await admin
    .from('brands')
    .update({ website_url: SITE, settings: { autopilot: { level3AccountIds: [] } } })
    .eq('id', brandId)
  const ig = await admin
    .from('social_accounts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      platform: 'instagram',
      external_id: `ig-profile-kit-${Date.now()}`,
      name: 'Adaptiko',
      username: 'adaptiko',
      account_type: 'instagram_business',
      status: 'active',
      capabilities: { publish: true },
      metadata: {},
      assisted_only: false,
    })
    .select('id')
    .single()
  if (ig.error) throw new Error(ig.error.message)
  instagramId = ig.data.id
})

afterEach(() => {
  resetGeminiMock()
  resetMemoryRateLimit()
  resetVisualsState()
  resetPexelsCacheForTests()
  resetUnsplashCacheForTests()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(owner)
})

describe('profili na mrežama: opisi (D-143)', () => {
  it('pravi opise za svih osam mreža za 3 tokena, sa sajtom gde mreža to prikazuje', async () => {
    const before = await balance()
    enqueueReply({ kind: 'text', json: reply })
    const r = await generate()
    expect(r.status).toBe(200)
    expect(r.json.data!.tokensCharged).toBe(3)
    expect(await balance()).toBe(before - 3)
    const bios = r.json.data!.kit.bios!
    expect(bios.facebook.long!.endsWith(SITE)).toBe(true)
    expect(bios.linkedin.long!.endsWith(SITE)).toBe(true)
    expect(bios.google_business.long).not.toContain('https://')
    expect(bios.linkedin.keywords).toEqual(['Adaptacija stanova', 'Renoviranje', 'Enterijer'])
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain(`Sajt: ${SITE}`)
    expect(prompt).toContain('Adaptacija stanova od projekta do ključa')

    const { data: stored } = await admin.from('brands').select('settings').eq('id', brandId).single()
    const settings = stored!.settings as {
      autopilot?: unknown
      profileKit?: { bios?: unknown; biosAt?: string }
    }
    expect(settings.autopilot).toEqual({ level3AccountIds: [] })
    expect(settings.profileKit?.bios).toEqual(bios)

    const kit = await call<ProfileKitView>(kitGet, `/api/brands/${brandId}/profile-kit`, {
      token: owner.token,
      params: { id: brandId },
    })
    expect(kit.json.data).toMatchObject({
      website: SITE,
      hasProfile: true,
      canEdit: true,
      prices: { bios: 3 },
    })
    expect(kit.json.data!.bios).toEqual(bios)
  })

  it('neispravan odgovor modela vraća tokene i ne briše sačuvane opise', async () => {
    const before = await balance()
    const { data: was } = await admin.from('brands').select('settings').eq('id', brandId).single()
    enqueueReply({ kind: 'text', json: { instagram: { name: 'samo jedna mreža' } } })
    const r = await generate()
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(await balance()).toBe(before)
    const { data: now } = await admin.from('brands').select('settings').eq('id', brandId).single()
    expect(now!.settings).toEqual(was!.settings)
  })

  it('brend bez profila ne troši tokene i dobija jasnu poruku', async () => {
    await admin.from('brand_profiles').update({ is_current: false }).eq('brand_id', brandId)
    try {
      const before = await balance()
      const r = await generate()
      expect(r.status).toBe(400)
      expect(r.json.error?.message).toMatch(/profil brenda/)
      expect(await balance()).toBe(before)
      expect(calls).toHaveLength(0)
    } finally {
      await admin.from('brand_profiles').update({ is_current: true }).eq('brand_id', brandId).eq('version', 1)
    }
  })
})

describe('profili na mrežama: Instagram highlights (D-144)', () => {
  it('pravi highlights za 3 tokena, bez ponovljenih, sa naslovom u granici Instagrama', async () => {
    const before = await balance()
    enqueueReply({ kind: 'text', json: highlightsReply })
    const r = await generateHighlights()
    expect(r.status).toBe(200)
    expect(r.json.data!.tokensCharged).toBe(3)
    expect(await balance()).toBe(before - 3)
    const kit = r.json.data!.kit
    expect(kit).toMatchObject({ hasInstagram: true, prices: { highlights: 3 } })
    const titles = kit.highlights!.map((h) => h.title)
    expect(titles.slice(0, 2)).toEqual(['Usluge', 'Kako radimo'])
    expect(titles).toHaveLength(3)
    expect(Array.from(titles[2]!).length).toBeLessThanOrEqual(15)
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain(`Sajt: ${SITE}`)
    expect(prompt).toContain('highlights')

    const { data: stored } = await admin.from('brands').select('settings').eq('id', brandId).single()
    const settings = stored!.settings as { autopilot?: unknown; profileKit?: { highlights?: unknown } }
    expect(settings.autopilot).toEqual({ level3AccountIds: [] })
    expect(settings.profileKit?.highlights).toEqual(kit.highlights)
  })

  it('naslovna je PNG 1080×1920; preuzimanje i ZIP nose ime fajla', async () => {
    const base = `/api/brands/${brandId}/profile-kit/highlights`
    const cover = await raw(coverGet, `${base}/0/cover`, { id: brandId, index: '0' })
    expect(cover.status).toBe(200)
    expect(cover.headers.get('content-type')).toBe('image/png')
    expect(cover.headers.get('content-disposition')).toBeNull()
    expect(await sharp(cover.bytes).metadata()).toMatchObject({ width: 1080, height: 1920, format: 'png' })

    const download = await raw(coverGet, `${base}/0/cover?download=1`, { id: brandId, index: '0' })
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="1-usluge.png"')

    const zip = await raw(coversGet, `${base}/covers`, { id: brandId })
    expect(zip.status).toBe(200)
    expect(zip.headers.get('content-type')).toBe('application/zip')
    expect(zip.headers.get('content-disposition')).toContain('adaptiko-highlights.zip')
    expect(zip.bytes.subarray(0, 2).toString()).toBe('PK')
    expect(zip.bytes.includes(Buffer.from('2-kako-radimo.png'))).toBe(true)

    const missing = await raw(coverGet, `${base}/5/cover`, { id: brandId, index: '5' })
    expect(missing.status).toBe(404)
  })

  it('priča od kadrova ide u Odobravanje kao Instagram priča, bez tokena', async () => {
    const before = await balance()
    const r = await story(1)
    expect(r.status).toBe(200)
    expect(r.json.data!.status).toBe('in_review')
    const postId = r.json.data!.postId
    const { data: post } = await admin.from('posts').select('status, title, design').eq('id', postId).single()
    expect(post).toMatchObject({ status: 'in_review', title: 'Highlight: Kako radimo' })
    expect((post!.design as { format?: string }).format).toBe('story')
    const { data: targets } = await admin
      .from('post_targets')
      .select('social_account_id, options')
      .eq('post_id', postId)
    expect(targets).toEqual([{ social_account_id: instagramId, options: { format: 'story' } }])
    const { data: media } = await admin
      .from('post_media')
      .select('sort_order, media_assets(source, width, height, source_data)')
      .eq('post_id', postId)
      .order('sort_order')
    expect(media).toHaveLength(2)
    for (const m of media!) {
      const asset = m.media_assets as unknown as {
        source: string
        width: number
        height: number
        source_data: { highlight?: string; format?: string }
      }
      expect(asset).toMatchObject({ source: 'template', width: 1080, height: 1920 })
      expect(asset.source_data).toMatchObject({ highlight: 'Kako radimo', format: 'story' })
    }
    expect(await balance()).toBe(before)
  })

  it('bez povezanog Instagrama priča ostaje nacrt bez naloga, sa napomenom', async () => {
    const off = await admin.from('social_accounts').update({ status: 'disabled' }).eq('id', instagramId)
    expect(off.error).toBeNull()
    try {
      const r = await story(0)
      expect(r.status).toBe(200)
      expect(r.json.data!.status).toBe('draft')
      expect(r.json.data!.notes.join(' ')).toMatch(/Nema povezanog Instagram naloga/)
      const { data: post } = await admin.from('posts').select('status').eq('id', r.json.data!.postId).single()
      expect(post!.status).toBe('draft')
      const { count } = await admin
        .from('post_targets')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', r.json.data!.postId)
      expect(count).toBe(0)
    } finally {
      await admin.from('social_accounts').update({ status: 'active' }).eq('id', instagramId)
    }
  })

  it('highlight koji ne postoji daje 404, a neispravan odgovor modela vraća tokene', async () => {
    const r = await story(7)
    expect(r.status).toBe(404)
    const before = await balance()
    enqueueReply({ kind: 'text', json: { highlights: [] } })
    const bad = await generateHighlights()
    expect(bad.status).toBeGreaterThanOrEqual(400)
    expect(await balance()).toBe(before)
  })
})
