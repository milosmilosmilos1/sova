import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueDocumentIndex: vi.fn(async () => {}),
}))

import { POST as textPost } from '@/app/api/ai/text/route'
import { POST as insightsPost } from '@/app/api/analytics/insights/generate/route'
import { GET as brainGet } from '@/app/api/brands/[id]/brain/route'
import { PATCH as designPatch } from '@/app/api/brands/[id]/design/route'
import { DELETE as documentDelete } from '@/app/api/brands/[id]/documents/[documentId]/route'
import { POST as notesPost } from '@/app/api/brands/[id]/notes/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { enqueueDocumentIndex } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { indexDocument } from '@/services/brand-brain/documents'

import { embedHandler } from './fixture-site'
import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Brain: pregled, beleške, playbook iz uvida i sopstveni logo (D-113). */
let owner: TestUser
let viewer: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let otherWs = ''
let accountId = ''

interface BrainView {
  active: boolean
  knows: { items: Array<{ key: string; value: string | null }>; filled: number; source: string | null }
  sources: {
    accounts: number
    posts: number
    documents: number
    results: number
    notes: Array<{ id: string; name: string; status: string; excerpt: string | null }>
  }
  playbook: { summary: string; works: string[]; avoid: string[]; basedOn: { posts: number } | null } | null
  refresh: { possible: boolean; needed: number }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

function brain(token = owner.token) {
  return call<BrainView>(brainGet, `/api/brands/${brandId}/brain`, { token, params: { id: brandId } })
}

async function publishedWithMetrics(text: string, reach: number, reactions: number, ago: number) {
  const { data: post, error } = await admin
    .from('posts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      master_text: text,
      status: 'published',
      created_by: owner.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const { data: target, error: tErr } = await admin
    .from('post_targets')
    .insert({
      post_id: post!.id,
      brand_id: brandId,
      social_account_id: accountId,
      platform: 'facebook',
      status: 'published',
      external_post_id: `ext-${crypto.randomUUID()}`,
      published_at: daysAgo(ago),
    })
    .select('id')
    .single()
  if (tErr) throw new Error(tErr.message)
  const { error: sErr } = await admin.from('post_metrics_snapshots').insert({
    target_id: target!.id,
    brand_id: brandId,
    social_account_id: accountId,
    horizon: '24h',
    captured_at: daysAgo(ago - 1),
    reach,
    impressions: reach * 2,
    reactions,
    comments: 2,
    shares: 1,
  })
  if (sErr) throw new Error(sErr.message)
  return target!.id
}

function insightsReply(playbook: { summary: string; works: string[]; avoid: string[] }) {
  return {
    kind: 'text' as const,
    json: {
      items: [
        {
          claim: 'Objave sa savetima imaju najveći doseg u periodu.',
          recommendation: 'Nastavite sa kratkim savetima utorkom.',
          evidence_post_ids: [],
          confidence: 0.6,
          suggestion_kind: '',
          suggestion_title: '',
          suggestion_body: '',
        },
      ],
      playbook,
    },
  }
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(embedHandler)
  owner = await createTestUser('brain')
  viewer = await createTestUser('brain-viewer')
  other = await createTestUser('brain-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Brain test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const foreign = await call<{ workspaceId: string }>(workspacesPost, '/api/workspaces', {
    token: other.token,
    body: { name: 'Tuđi prostor', type: 'business' },
  })
  otherWs = foreign.json.data!.workspaceId
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
  const { data: account } = await admin
    .from('social_accounts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      platform: 'facebook',
      external_id: `fb-brain-${Date.now()}`,
      name: 'Strana',
      status: 'active',
      capabilities: { publish: true },
      metadata: {},
      account_type: 'facebook_page',
    })
    .select('id')
    .single()
  accountId = account!.id
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  vi.mocked(enqueueDocumentIndex).mockClear()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().in('id', [wsId, otherWs])
  await deleteTestUser(owner)
  await deleteTestUser(viewer)
  await deleteTestUser(other)
})

describe('Brain', () => {
  it('nov brend: zna samo naziv, bez rezultata i playbook-a; tuđ brend se ne vidi', async () => {
    const r = await brain(viewer.token)
    expect(r.status).toBe(200)
    expect(r.json.data!.active).toBe(false)
    expect(r.json.data!.knows.filled).toBe(1)
    expect(r.json.data!.knows.items[0]).toMatchObject({ key: 'name', value: 'Brain test' })
    expect(r.json.data!.sources).toMatchObject({ accounts: 1, posts: 0, documents: 0, results: 0, notes: [] })
    expect(r.json.data!.playbook).toBeNull()
    expect(r.json.data!.refresh).toEqual({ possible: false, needed: 3 })
    expect((await brain(other.token)).status).toBe(404)
  })

  it('beleška ide u bazu znanja kao izvor, i kratka; posmatrač ne može da je doda', async () => {
    const denied = await call(notesPost, `/api/brands/${brandId}/notes`, {
      token: viewer.token,
      params: { id: brandId },
      body: { title: 'Radno vreme', content: 'Radimo od 8 do 20 h.' },
    })
    expect(denied.status).toBe(403)
    const empty = await call(notesPost, `/api/brands/${brandId}/notes`, {
      token: owner.token,
      params: { id: brandId },
      body: { title: 'Prazno', content: '   ' },
    })
    expect(empty.status).toBe(400)

    const r = await call<{ id: string; kind: string; status: string }>(
      notesPost,
      `/api/brands/${brandId}/notes`,
      {
        token: owner.token,
        params: { id: brandId },
        body: { title: 'Radno vreme', content: 'Radimo od 8 do 20 h.' },
      },
    )
    expect(r.status).toBe(202)
    expect(r.json.data).toMatchObject({ kind: 'note', status: 'processing' })
    expect(vi.mocked(enqueueDocumentIndex)).toHaveBeenCalledWith(r.json.data!.id, brandId)
    expect(await indexDocument(r.json.data!.id)).toEqual({ status: 'ready', chunks: 1 })
    const { data: chunks } = await admin
      .from('knowledge_chunks')
      .select('content, source_type')
      .eq('source_id', r.json.data!.id)
    expect(chunks).toEqual([{ content: 'Radimo od 8 do 20 h.', source_type: 'manual' }])

    const view = await brain()
    expect(view.json.data!.sources.notes).toEqual([
      expect.objectContaining({ name: 'Radno vreme', status: 'ready', excerpt: 'Radimo od 8 do 20 h.' }),
    ])

    const del = await call(documentDelete, `/api/brands/${brandId}/documents/${r.json.data!.id}`, {
      token: owner.token,
      method: 'DELETE',
      params: { id: brandId, documentId: r.json.data!.id },
    })
    expect(del.status).toBe(200)
    expect((await brain()).json.data!.sources.notes).toEqual([])
    const { count } = await admin
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', r.json.data!.id)
    expect(count).toBe(0)
  })

  it('uvidi pišu playbook u istom pozivu; nov zaključak ide na vrh, a suprotno pravilo se briše', async () => {
    await publishedWithMetrics('Tri saveta za održavanje klime pre leta.', 900, 80, 6)
    await publishedWithMetrics('Iza scene: naša ekipa na ugradnji.', 400, 30, 5)
    await publishedWithMetrics('Akcija: servis klime uz popust.', 150, 4, 4)
    expect((await brain()).json.data!.refresh.possible).toBe(true)

    enqueueReply(
      insightsReply({
        summary: 'Kratki saveti u karuselu donose najviše dosega.',
        works: ['1. Karusel sa tri kratka saveta', 'Iza scene sa ekipom na terenu'],
        avoid: ['Objave koje počinju popustom'],
      }),
    )
    const first = await call<{ status: string }>(insightsPost, '/api/analytics/insights/generate', {
      token: owner.token,
      body: { brandId, periodStart: daysAgo(30).slice(0, 10) },
    })
    expect(first.json.data!.status).toBe('created')
    let view = (await brain()).json.data!
    expect(view.playbook).toMatchObject({
      summary: 'Kratki saveti u karuselu donose najviše dosega.',
      works: ['Karusel sa tri kratka saveta', 'Iza scene sa ekipom na terenu'],
      avoid: ['Objave koje počinju popustom'],
      basedOn: { posts: 3 },
    })

    enqueueReply(
      insightsReply({
        summary: '',
        works: ['Objave koje počinju popustom', 'Pitanje publici na kraju opisa'],
        avoid: ['Iza scene sa ekipom na terenu'],
      }),
    )
    await call(insightsPost, '/api/analytics/insights/generate', {
      token: owner.token,
      body: { brandId, periodStart: daysAgo(30).slice(0, 10) },
    })
    view = (await brain()).json.data!
    expect(view.playbook!.summary).toBe('Kratki saveti u karuselu donose najviše dosega.')
    expect(view.playbook!.works).toEqual([
      'Objave koje počinju popustom',
      'Pitanje publici na kraju opisa',
      'Karusel sa tri kratka saveta',
    ])
    expect(view.playbook!.avoid).toEqual(['Iza scene sa ekipom na terenu'])
  })

  it('playbook ide u prompt sledeće objave', async () => {
    const r = await call(textPost, '/api/ai/text', {
      token: owner.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { brandId, platforms: ['facebook'], topic: 'Zašto servisirati klimu pre leta' },
    })
    expect(r.status).toBe(200)
    const prompt = JSON.stringify(calls[0]!.body)
    expect(prompt).toContain('PLAYBOOK (naučeno iz rezultata')
    expect(prompt).toContain('Ponavljaj: Pitanje publici na kraju opisa')
    expect(prompt).toContain('Izbegavaj: Iza scene sa ekipom na terenu')
  })
})

describe('sopstveni logo', () => {
  async function imageAsset(workspaceId: string, brand: string | null) {
    const { data, error } = await admin
      .from('media_assets')
      .insert({
        workspace_id: workspaceId,
        brand_id: brand,
        kind: 'image',
        source: 'upload',
        bucket: 'uploads',
        storage_path: `ws/${workspaceId}/brand/${brand ?? 'x'}/uploads/${crypto.randomUUID()}.png`,
        mime_type: 'image/png',
        size_bytes: 1200,
        width: 200,
        height: 200,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data!.id
  }

  it('logo iz biblioteke brenda ima prednost; tuđ fajl se odbija; null vraća logo sa sajta', async () => {
    const mine = await imageAsset(wsId, brandId)
    const set = await call<{ logoAssetId: string | null; logoSource: string | null }>(
      designPatch,
      `/api/brands/${brandId}/design`,
      { token: owner.token, method: 'PATCH', params: { id: brandId }, body: { logoAssetId: mine } },
    )
    expect(set.status).toBe(200)
    expect(set.json.data).toMatchObject({ logoAssetId: mine, logoSource: 'custom' })

    const foreign = await imageAsset(otherWs, null)
    const denied = await call(designPatch, `/api/brands/${brandId}/design`, {
      token: owner.token,
      method: 'PATCH',
      params: { id: brandId },
      body: { logoAssetId: foreign },
    })
    expect(denied.status).toBe(404)

    const back = await call<{ logoAssetId: string | null; logoSource: string | null }>(
      designPatch,
      `/api/brands/${brandId}/design`,
      { token: owner.token, method: 'PATCH', params: { id: brandId }, body: { logoAssetId: null } },
    )
    expect(back.json.data).toMatchObject({ logoAssetId: null, logoSource: null })
  })
})
