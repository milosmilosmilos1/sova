import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as biosPost } from '@/app/api/brands/[id]/profile-kit/bios/route'
import { GET as kitGet } from '@/app/api/brands/[id]/profile-kit/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { emptyProfile } from '@/lib/brand/profile-schema'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Profili na mrežama (D-143): opisi za svih osam mreža iz profila brenda, 3 tokena, sajt u opisima gde
 * ga mreža prikazuje, bez linka u opisu Google profila; neuspeh vraća tokene i ne briše stare opise.
 */
let owner: TestUser
let wsId = ''
let brandId = ''
const SITE = 'https://adaptiko.rs'

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

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
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
})

afterEach(() => {
  resetGeminiMock()
  resetMemoryRateLimit()
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
