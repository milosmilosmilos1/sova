import { Document, Page, renderToBuffer, Text, View } from '@react-pdf/renderer'
import { createElement as h } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueDocumentIndex: vi.fn(async () => {}),
}))

import { POST as textPost } from '@/app/api/ai/text/route'
import { DELETE as documentDelete } from '@/app/api/brands/[id]/documents/[documentId]/route'
import { GET as documentsGet, POST as documentsPost } from '@/app/api/brands/[id]/documents/route'
import { POST as uploadUrlPost } from '@/app/api/brands/[id]/documents/upload-url/route'
import { GET as setupGet, POST as setupPost } from '@/app/api/brands/[id]/setup/route'
import { POST as draftPost } from '@/app/api/brands/[id]/voice/draft/route'
import { GET as voiceGet, PUT as voicePut } from '@/app/api/brands/[id]/voice/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { emptyField, emptyProfile } from '@/lib/brand/profile-schema'
import { enqueueDocumentIndex } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { indexDocument } from '@/services/brand-brain/documents'

import { embedHandler } from './fixture-site'
import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Glas brenda, dokumenti o brendu i uvod u sedam koraka (D-112). */
let owner: TestUser
let viewer: TestUser
let other: TestUser
let wsId = ''
let brandId = ''

interface VoiceView {
  voice: { offer: string; tone: string; cta: string; topics: string[] }
  saved: boolean
  fromProfile: boolean
  sources: { profile: boolean; documents: number; posts: number }
  draftPrice: number
}

interface DocumentView {
  id: string
  name: string
  status: 'processing' | 'ready' | 'failed'
  pages: number | null
  chunks: number
  error: string | null
}

const voiceBody = {
  offer: 'Ugradnja i servis klima uređaja u Beogradu.',
  audience: 'Vlasnici stanova i malih lokala.',
  tone: 'opušteno i stručno',
  usp: 'Ugradnja za jedan dan.',
  avoid: 'Bez cena u objavama.',
  cta: 'Pozovite 060 123 4567.',
  topics: ['Saveti za održavanje klime', 'Iza scene ugradnje', 'Pitanja kupaca'],
}

function pdfWithText(lines: string[]): Promise<Buffer> {
  return renderToBuffer(
    h(
      Document,
      null,
      h(
        Page,
        { size: 'A4' },
        lines.map((l, i) => h(Text, { key: i }, l)),
      ),
    ),
  )
}

async function uploadDocument(bytes: Buffer, name: string, token = owner.token) {
  const target = await call<{ uploadId: string; signedUrl: string }>(
    uploadUrlPost,
    `/api/brands/${brandId}/documents/upload-url`,
    { token, params: { id: brandId }, body: { name, sizeBytes: bytes.length } },
  )
  expect(target.status).toBe(200)
  const put = await fetch(target.json.data!.signedUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
    body: new Uint8Array(bytes),
  })
  expect(put.ok).toBe(true)
  return call<DocumentView>(documentsPost, `/api/brands/${brandId}/documents`, {
    token,
    params: { id: brandId },
    body: { uploadId: target.json.data!.uploadId, name },
  })
}

function voice(token = owner.token) {
  return call<VoiceView>(voiceGet, `/api/brands/${brandId}/voice`, { token, params: { id: brandId } })
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(embedHandler)
  owner = await createTestUser('setup')
  viewer = await createTestUser('setup-viewer')
  other = await createTestUser('setup-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Uvod test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: viewer.id, role: 'viewer', all_brands: true })
  const { error } = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 100,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  if (error) throw new Error(error.message)
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  vi.mocked(enqueueDocumentIndex).mockClear()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(owner)
  await deleteTestUser(viewer)
  await deleteTestUser(other)
})

describe('glas brenda', () => {
  it('nov brend nema glas ni izvore; predlog bez izvora ne troši tokene', async () => {
    const r = await voice()
    expect(r.status).toBe(200)
    expect(r.json.data!.saved).toBe(false)
    expect(r.json.data!.voice.topics).toEqual([])
    expect(r.json.data!.sources).toEqual({ profile: false, documents: 0, posts: 0 })
    expect(r.json.data!.draftPrice).toBe(2)

    const draft = await call(draftPost, `/api/brands/${brandId}/voice/draft`, {
      token: owner.token,
      params: { id: brandId },
      headers: { 'idempotency-key': crypto.randomUUID() },
    })
    expect(draft.status).toBe(400)
    expect(draft.json.error!.code).toBe('VALIDATION')
    expect(calls).toHaveLength(0)

    // tuđ brend se ne vidi
    const foreign = await voice(other.token)
    expect(foreign.status).toBe(404)
  })

  it('dok vlasnik ne sačuva svoj, glas je predlog iz profila sa sajta', async () => {
    const profile = emptyProfile({ name: 'Klima Plus', contentLocale: 'sr-Latn', websiteUrl: null })
    profile.identity.description = emptyField('Montaža klima uređaja u Beogradu i okolini.', 0.9)
    profile.voice.tone = emptyField(['prijateljski', 'stručno'], 0.7)
    profile.content.content_pillars = emptyField(
      [{ name: 'Održavanje pred leto', description: 'saveti' }],
      0.6,
    )
    const { error } = await admin
      .from('brand_profiles')
      .insert({ brand_id: brandId, version: 1, is_current: true, data: profile, locked_fields: [] })
    if (error) throw new Error(error.message)
    const r = await voice()
    expect(r.json.data!.fromProfile).toBe(true)
    expect(r.json.data!.saved).toBe(false)
    expect(r.json.data!.voice.offer).toBe('Montaža klima uređaja u Beogradu i okolini.')
    expect(r.json.data!.voice.tone).toBe('prijateljski, stručno')
    expect(r.json.data!.voice.topics).toEqual(['Održavanje pred leto'])
    expect(r.json.data!.sources.profile).toBe(true)
  })

  it('urednik čuva glas, posmatrač ne može, a predugačak unos se odbija', async () => {
    const denied = await call(voicePut, `/api/brands/${brandId}/voice`, {
      token: viewer.token,
      method: 'PUT',
      params: { id: brandId },
      body: voiceBody,
    })
    expect(denied.status).toBe(403)

    const invalid = await call(voicePut, `/api/brands/${brandId}/voice`, {
      token: owner.token,
      method: 'PUT',
      params: { id: brandId },
      body: { ...voiceBody, topics: Array.from({ length: 9 }, (_, i) => `Tema broj ${i}`) },
    })
    expect(invalid.status).toBe(400)

    const saved = await call<VoiceView>(voicePut, `/api/brands/${brandId}/voice`, {
      token: owner.token,
      method: 'PUT',
      params: { id: brandId },
      body: voiceBody,
    })
    expect(saved.status).toBe(200)
    expect(saved.json.data!.saved).toBe(true)
    expect(saved.json.data!.fromProfile).toBe(false)
    expect(saved.json.data!.voice.topics).toEqual(voiceBody.topics)
    const { data: row } = await admin.from('brands').select('voice').eq('id', brandId).single()
    expect((row!.voice as { updated_by: string }).updated_by).toBe(owner.id)
  })

  it('sačuvan glas ide u prompt svake objave, ispred profila sa sajta', async () => {
    const r = await call(textPost, '/api/ai/text', {
      token: owner.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { brandId, platforms: ['facebook'], topic: 'Zašto servisirati klimu pre leta' },
    })
    expect(r.status).toBe(200)
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain('GLAS BRENDA')
    expect(prompt).toContain('Šta nikad ne piše: Bez cena u objavama.')
    expect(prompt).toContain('Uobičajen poziv na akciju')
  })

  it('predlog čita ranije objave, troši 2 tokena i ništa ne čuva', async () => {
    const { data: account } = await admin
      .from('social_accounts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: `fb-setup-${Date.now()}`,
        name: 'Strana',
        status: 'active',
        capabilities: { publish: true },
        metadata: {},
        account_type: 'facebook_page',
      })
      .select('id')
      .single()
    await admin.from('historical_posts').insert([
      {
        brand_id: brandId,
        social_account_id: account!.id,
        external_id: 'p1',
        text_content: 'Leto stiže, a klima posle zime traži servis. Javite se na vreme i preskočite gužvu.',
        published_at: new Date().toISOString(),
      },
    ])
    enqueueReply({
      kind: 'text',
      json: {
        offer: 'Servis i ugradnja klima.',
        audience: 'Domaćinstva u Beogradu.',
        tone: 'opušteno',
        usp: '',
        avoid: 'bez cena',
        cta: 'Pozovite nas.',
        topics: ['1. Servis pred leto #klima', 'Iza scene', 'iza scene', 'Saveti za uštedu struje'],
      },
    })
    const before = await admin.from('brands').select('voice').eq('id', brandId).single()
    const r = await call<{ draft: VoiceView['voice']; tokensCharged: number; generationId: string }>(
      draftPost,
      `/api/brands/${brandId}/voice/draft`,
      { token: owner.token, params: { id: brandId }, headers: { 'idempotency-key': crypto.randomUUID() } },
    )
    expect(r.status).toBe(200)
    expect(r.json.data!.tokensCharged).toBe(2)
    expect(r.json.data!.draft.topics).toEqual(['Servis pred leto', 'Iza scene', 'Saveti za uštedu struje'])
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain('RANIJE OBJAVE BRENDA')
    expect(prompt).toContain('PROFIL SA SAJTA')
    const { data: gen } = await admin
      .from('ai_generations')
      .select('status, type, tokens_charged')
      .eq('id', r.json.data!.generationId)
      .single()
    expect(gen).toMatchObject({ status: 'succeeded', type: 'brand_profile' })
    const after = await admin.from('brands').select('voice').eq('id', brandId).single()
    expect(after.data!.voice).toEqual(before.data!.voice)
    expect((await voice()).json.data!.sources.posts).toBe(1)
  })
})

describe('dokumenti o brendu', () => {
  it('PDF se otprema, čita u pozadini i ulazi u bazu znanja; brisanje ga uklanja svuda', async () => {
    const bytes = await pdfWithText([
      'Klima Plus radi ugradnju i servis klima uređaja u Beogradu od 2015. godine.',
      'Ugradnja traje jedan dan, a garancija na rad je dve godine.',
      'Dubinsko pranje i dezinfekcija rade se jednom godišnje, pre sezone.',
    ])
    const r = await uploadDocument(bytes, 'Klima Plus profil.pdf')
    expect(r.status).toBe(202)
    expect(r.json.data!.status).toBe('processing')
    const id = r.json.data!.id
    expect(vi.mocked(enqueueDocumentIndex)).toHaveBeenCalledWith(id, brandId)

    const indexed = await indexDocument(id)
    expect(indexed.status).toBe('ready')
    expect(indexed.chunks).toBeGreaterThan(0)
    const list = await call<DocumentView[]>(documentsGet, `/api/brands/${brandId}/documents`, {
      token: viewer.token,
      params: { id: brandId },
    })
    expect(list.json.data![0]).toMatchObject({ id, status: 'ready', pages: 1 })
    const { data: chunks } = await admin
      .from('knowledge_chunks')
      .select('content, source_type')
      .eq('brand_id', brandId)
      .eq('source_id', id)
    expect(chunks!.length).toBe(indexed.chunks)
    expect(chunks![0]!.source_type).toBe('manual')
    expect(chunks![0]!.content).toContain('garancija na rad je dve godine')
    expect((await voice()).json.data!.sources.documents).toBe(1)

    // ponovljen završetak istog otpremanja vraća isti red
    const { data: row } = await admin.from('brand_documents').select('storage_path').eq('id', id).single()
    const again = await call<DocumentView>(documentsPost, `/api/brands/${brandId}/documents`, {
      token: owner.token,
      params: { id: brandId },
      body: { uploadId: id, name: 'Klima Plus profil.pdf' },
    })
    expect(again.json.data!.id).toBe(id)

    const denied = await call(documentDelete, `/api/brands/${brandId}/documents/${id}`, {
      token: viewer.token,
      method: 'DELETE',
      params: { id: brandId, documentId: id },
    })
    expect(denied.status).toBe(403)
    const del = await call(documentDelete, `/api/brands/${brandId}/documents/${id}`, {
      token: owner.token,
      method: 'DELETE',
      params: { id: brandId, documentId: id },
    })
    expect(del.status).toBe(200)
    const { count } = await admin
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', id)
    expect(count).toBe(0)
    const { data: stored } = await admin.storage.from('brand-assets').download(row!.storage_path)
    expect(stored).toBeNull()
    const empty = await call<DocumentView[]>(documentsGet, `/api/brands/${brandId}/documents`, {
      token: owner.token,
      params: { id: brandId },
    })
    expect(empty.json.data).toEqual([])
  })

  it('fajl koji nije PDF se odbija i briše iz skladišta', async () => {
    const fake = Buffer.from('ovo nije pdf, samo tekst koji se pretvara da jeste')
    const target = await call<{ uploadId: string; signedUrl: string }>(
      uploadUrlPost,
      `/api/brands/${brandId}/documents/upload-url`,
      { token: owner.token, params: { id: brandId }, body: { name: 'lazni.pdf', sizeBytes: fake.length } },
    )
    await fetch(target.json.data!.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
      body: new Uint8Array(fake),
    })
    const r = await call(documentsPost, `/api/brands/${brandId}/documents`, {
      token: owner.token,
      params: { id: brandId },
      body: { uploadId: target.json.data!.uploadId, name: 'lazni.pdf' },
    })
    expect(r.status).toBe(400)
    expect(r.json.error!.message).toBe('Fajl nije PDF.')
    const { count } = await admin
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('id', target.json.data!.uploadId)
    expect(count).toBe(0)

    const big = await call(uploadUrlPost, `/api/brands/${brandId}/documents/upload-url`, {
      token: owner.token,
      params: { id: brandId },
      body: { name: 'veliki.pdf', sizeBytes: 11 * 1024 * 1024 },
    })
    expect(big.status).toBe(400)
  })

  it('PDF bez teksta (skenirane strane) završava kao nepročitan, sa porukom', async () => {
    const bytes = await renderToBuffer(
      h(
        Document,
        null,
        h(Page, { size: 'A4' }, h(View, { style: { width: 200, height: 200, backgroundColor: '#eee' } })),
      ),
    )
    const r = await uploadDocument(bytes, 'sken.pdf')
    expect(r.status).toBe(202)
    const indexed = await indexDocument(r.json.data!.id)
    expect(indexed.status).toBe('failed')
    const { data: row } = await admin
      .from('brand_documents')
      .select('status, error')
      .eq('id', r.json.data!.id)
      .single()
    expect(row).toMatchObject({ status: 'failed' })
    expect(row!.error).toContain('nema teksta')
    // drugi prolaz istog posla ne radi ništa
    expect((await indexDocument(r.json.data!.id)).status).toBe('skipped')
  })
})

describe('uvod u sedam koraka', () => {
  it('bez povezane mreže teme postaju pauzirani tokovi, a ponovljen kraj ne pravi duplikate', async () => {
    // mreža iz testa za predlog glasa je jedina aktivna; ovde je isključena
    await admin.from('social_accounts').update({ status: 'disabled' }).eq('brand_id', brandId)
    const state = await call<{ completedAt: string | null; accounts: number }>(
      setupGet,
      `/api/brands/${brandId}/setup`,
      { token: owner.token, params: { id: brandId } },
    )
    expect(state.json.data).toMatchObject({ completedAt: null, accounts: 0 })

    const denied = await call(setupPost, `/api/brands/${brandId}/setup`, {
      token: viewer.token,
      params: { id: brandId },
      body: { flows: [{ topic: 'Saveti za održavanje klime', active: true }] },
    })
    expect(denied.status).toBe(403)

    const first = await call<{
      completedAt: string
      pausedForAccounts: boolean
      flows: Array<{ name: string; active: boolean; days: number[]; format: string }>
    }>(setupPost, `/api/brands/${brandId}/setup`, {
      token: owner.token,
      params: { id: brandId },
      body: {
        flows: [
          { topic: 'Saveti za održavanje klime', active: true },
          { topic: 'Iza scene ugradnje', active: true },
        ],
      },
    })
    expect(first.status).toBe(200)
    expect(first.json.data!.pausedForAccounts).toBe(true)
    expect(first.json.data!.flows.map((f) => [f.active, f.days, f.format])).toEqual([
      [false, [1, 4], 'carousel'],
      [false, [2, 5], 'carousel'],
    ])
    const { data: brand } = await admin.from('brands').select('setup_completed_at').eq('id', brandId).single()
    expect(brand!.setup_completed_at).not.toBeNull()

    await admin.from('social_accounts').update({ status: 'active' }).eq('brand_id', brandId)
    const second = await call<{
      pausedForAccounts: boolean
      flows: Array<{ name: string; active: boolean }>
    }>(setupPost, `/api/brands/${brandId}/setup`, {
      token: owner.token,
      params: { id: brandId },
      body: {
        flows: [
          { topic: 'saveti za održavanje klime', active: true },
          { topic: 'Pitanja kupaca', active: true },
        ],
      },
    })
    expect(second.json.data!.pausedForAccounts).toBe(false)
    expect(second.json.data!.flows).toHaveLength(1)
    expect(second.json.data!.flows[0]).toMatchObject({ name: 'Pitanja kupaca', active: true })
    const { data: flows } = await admin
      .from('content_flows')
      .select('topic, cta, auto_time')
      .eq('brand_id', brandId)
      .is('deleted_at', null)
    expect(flows).toHaveLength(3)
    // poziv na akciju dolazi iz glasa brenda, vreme bira Sova
    expect(flows!.every((f) => f.cta === voiceBody.cta && f.auto_time)).toBe(true)
  })

  it('preskok uvoda samo označava uvod kao završen', async () => {
    const before = await admin
      .from('content_flows')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
    const r = await call<{ flows: unknown[] }>(setupPost, `/api/brands/${brandId}/setup`, {
      token: owner.token,
      params: { id: brandId },
      body: { skip: true, flows: [{ topic: 'Nova tema koja se ne pravi', active: true }] },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.flows).toEqual([])
    const after = await admin
      .from('content_flows')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
    expect(after.count).toBe(before.count)
  })
})
