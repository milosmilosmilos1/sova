import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as textPost } from '@/app/api/ai/text/route'
import { GET as setupGet, POST as setupPost } from '@/app/api/brands/[id]/setup/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { brandReadinessById } from '@/services/brand-readiness'

import { geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, COMPLETE_VOICE, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Kompletan brend (D-174): pre prve objave brend mora imati Brain sa bar jednim izvorom, ceo glas i
 * tri teme, logo, izabrane boje i stil. Dok nešto fali, uvod ne može da se završi, a Sova ne pravi
 * sadržaj (409 SETUP_INCOMPLETE, bez naplate). Ostali integracioni testovi ovu proveru isključuju,
 * pa je ovde vraćena.
 */
let owner: TestUser
let wsId = ''
let brandId = ''

interface State {
  readiness: { complete: boolean; missing: string[]; missingVoice: string[]; topics: number }
}

const state = async () =>
  (
    await call<State>(setupGet, `/api/brands/${brandId}/setup`, {
      token: owner.token,
      params: { id: brandId },
    })
  ).json.data!.readiness

const patchBrand = async (patch: Record<string, unknown>) => {
  const { error } = await admin.from('brands').update(patch).eq('id', brandId)
  if (error) throw new Error(error.message)
}

const balance = async () => {
  const r = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
    token: owner.token,
    query: { workspaceId: wsId },
  })
  return r.json.data!.balance.available
}

const askText = (key: string) =>
  call(textPost, '/api/ai/text', {
    token: owner.token,
    body: { brandId, platforms: ['linkedin'], topic: 'Saveti za održavanje klime pred leto', goal: 'sales' },
    headers: { 'idempotency-key': key },
  })

beforeAll(async () => {
  process.env.SOVA_BRAND_GATE = 'on'
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  owner = await createTestUser('readiness')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Kompletan brend', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
})

afterAll(async () => {
  process.env.SOVA_BRAND_GATE = 'off'
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(owner)
})

describe('kompletan brend pre prve objave (D-174)', () => {
  it('nov brend: fali sve, uvod ne može da se završi, a tekst objave se odbija bez naplate', async () => {
    expect(await state()).toMatchObject({
      complete: false,
      missing: ['brain', 'voice', 'topics', 'logo', 'colors', 'style'],
      topics: 0,
    })
    const finish = await call(setupPost, `/api/brands/${brandId}/setup`, {
      token: owner.token,
      params: { id: brandId },
      body: { flows: [] },
    })
    expect(finish.status).toBe(409)
    expect(finish.json.error!.code).toBe('SETUP_INCOMPLETE')

    const before = await balance()
    const text = await askText(`ready-${Date.now()}-1`)
    expect(text.status).toBe(409)
    expect(text.json.error!.code).toBe('SETUP_INCOMPLETE')
    expect(await balance()).toBe(before)
    const { count } = await admin
      .from('ai_generations')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('type', 'text')
    expect(count).toBe(0)
  })

  it('stavka po stavka: beleška uči Brain, glas traži sva polja i tri teme, pa logo, boje i stil', async () => {
    const { error } = await admin.from('brand_documents').insert({
      brand_id: brandId,
      workspace_id: wsId,
      kind: 'note',
      name: 'O nama',
      content: 'Radimo od 2015. godine.',
      size_bytes: 23,
      status: 'processing',
    })
    expect(error).toBeNull()
    // beleška važi čim je napisana, i pre nego što je pročitana u pozadini
    expect((await state()).missing).not.toContain('brain')

    await patchBrand({ voice: { ...COMPLETE_VOICE, avoid: '  ', topics: COMPLETE_VOICE.topics.slice(0, 2) } })
    expect(await state()).toMatchObject({ missingVoice: ['avoid'], topics: 2 })
    expect((await state()).missing).toEqual(expect.arrayContaining(['voice', 'topics']))

    await patchBrand({ voice: COMPLETE_VOICE })
    expect((await state()).missing).toEqual(['logo', 'colors', 'style'])

    // predlog sa sajta nije izbor: boje i stil važe tek kad ih korisnik sačuva
    await patchBrand({ design: { logoAssetId: crypto.randomUUID() } })
    expect((await state()).missing).toEqual(['colors', 'style'])
    await patchBrand({ design: { logoAssetId: crypto.randomUUID(), look: 'dark-2' } })
    expect((await state()).missing).toEqual(['style'])
    await patchBrand({ design: { logoAssetId: crypto.randomUUID(), look: 'dark-2', styleId: 'headline' } })
    expect(await state()).toMatchObject({ complete: true, missing: [] })
  })

  it('PDF koji nije pročitan ne računa se, a pročitan da', async () => {
    await admin
      .from('brand_documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('brand_id', brandId)
    expect((await brandReadinessById(brandId))!.missing).toEqual(['brain'])
    const pdf = {
      brand_id: brandId,
      workspace_id: wsId,
      kind: 'pdf',
      name: 'cenovnik.pdf',
      storage_path: `${wsId}/${brandId}/docs/x.pdf`,
      size_bytes: 1000,
    }
    await admin.from('brand_documents').insert({ ...pdf, status: 'failed' })
    expect((await brandReadinessById(brandId))!.missing).toEqual(['brain'])
    await admin.from('brand_documents').insert({ ...pdf, status: 'ready' })
    expect((await brandReadinessById(brandId))!.complete).toBe(true)
  })

  it('kompletan brend: uvod se završava i Sova ponovo prihvata zahtev za objavu', async () => {
    const finish = await call<{ completedAt: string }>(setupPost, `/api/brands/${brandId}/setup`, {
      token: owner.token,
      params: { id: brandId },
      body: { flows: [] },
    })
    expect(finish.status).toBe(200)
    // dalje ide do modela: bez odgovora u redu lažni Gemini ne daje ispravan tekst, ali to više nije 409
    const text = await askText(`ready-${Date.now()}-2`)
    expect(text.json.error?.code).not.toBe('SETUP_INCOMPLETE')
  })
})
