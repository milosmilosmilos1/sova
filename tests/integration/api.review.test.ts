import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/jobs/enqueue'), async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueFlowRun: vi.fn(async () => {}),
  enqueueTargetScheduled: vi.fn(async () => {}),
  enqueueTargetUnscheduled: vi.fn(async () => {}),
}))

import { GET as detailGet } from '@/app/api/approvals/[id]/route'
import { GET as downloadGet } from '@/app/api/approvals/[id]/download/route'
import { POST as publishPost } from '@/app/api/approvals/[id]/publish/route'
import { POST as regeneratePost } from '@/app/api/approvals/[id]/regenerate/route'
import { POST as savePost } from '@/app/api/approvals/[id]/save/route'
import { POST as schedulePost } from '@/app/api/approvals/[id]/schedule/route'
import { POST as skipPost } from '@/app/api/approvals/[id]/skip/route'
import { GET as listGet } from '@/app/api/approvals/route'
import { POST as flowRunPost } from '@/app/api/flows/[id]/run/route'
import { POST as flowsPost } from '@/app/api/flows/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { enqueueTargetScheduled } from '@/lib/jobs/enqueue'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { configureFontLoader } from '@/lib/visuals/fonts'
import type { StepRunner } from '@/services/autopilot/runner'
import { runFlow } from '@/services/flows/runner'

import { enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Odobravanje (D-108, faza 4). */
let owner: TestUser
let editor: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let igId = ''
let flowId = ''
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const inline: StepRunner = (_name, fn) => fn()

interface Detail {
  post: {
    id: string
    status: string
    version: number
    masterText: string
    targets: Array<{ socialAccountId: string; platform: string; text: string; scheduledAt: string | null }>
    media: Array<{ mediaAssetId: string }>
  }
  flowName: string | null
  canRegenerate: boolean
  suggestedAt: string
  limits: Record<string, number>
}

function reply(n: number, title: string) {
  return {
    kind: 'text' as const,
    json: {
      slides: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'point',
        kicker: null,
        title: i === 0 ? title : `Tačka ${i}`,
        body: 'Kratko objašnjenje.',
        stat: null,
        items: null,
      })),
      caption: `${title}\n\nObjašnjenje i poziv na akciju.`,
      short_caption: title,
      hashtags: ['#seo'],
      first_comment: null,
      visual_query: 'office',
      alt_text: 'Slajdovi.',
    },
  }
}

/** Nacrt na odobravanju iz toka (kao u pravom radu). */
async function draft(title: string, slides = 3): Promise<string> {
  const run = await call<{ id: string }>(flowRunPost, `/api/flows/${flowId}/run`, {
    token: owner.token,
    params: { id: flowId },
  })
  enqueueReply(reply(slides, title))
  const r = await runFlow(run.json.data!.id, inline)
  if (r.status !== 'succeeded') throw new Error(r.error)
  return r.postId!
}

const detail = (id: string, token = owner.token) =>
  call<Detail>(detailGet, `/api/approvals/${id}`, { token, params: { id } })

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  configureFontLoader({ remote: false })
  owner = await createTestUser('review')
  editor = await createTestUser('review-editor')
  other = await createTestUser('review-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: owner.token,
    body: { name: 'Odobravanje test', type: 'agency' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  await admin
    .from('workspace_members')
    .insert({ workspace_id: wsId, user_id: editor.id, role: 'editor', all_brands: true })
  const { error: grantError } = await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 200,
    p_reference_type: 'test',
    p_reference: crypto.randomUUID(),
  })
  if (grantError) throw new Error(grantError.message)
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active',
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
        external_id: `ig-rev-${Date.now()}`,
        name: 'IG',
        username: 'brend',
        account_type: 'instagram_business',
      },
      {
        ...base,
        platform: 'facebook',
        external_id: `fb-rev-${Date.now()}`,
        name: 'Strana',
        account_type: 'facebook_page',
      },
    ])
    .select('id, platform')
  if (error) throw new Error(error.message)
  igId = data!.find((a) => a.platform === 'instagram')!.id
  const flow = await call<{ id: string }>(flowsPost, '/api/flows', {
    token: owner.token,
    body: {
      brandId,
      name: 'Studije slučaja',
      topic: 'Kratak prikaz izazova i rezultata za klijenta',
      photoSource: 'none',
      styleId: 'headline',
    },
  })
  flowId = flow.json.data!.id
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  vi.mocked(enqueueTargetScheduled).mockClear()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(owner)
  await deleteTestUser(editor)
  await deleteTestUser(other)
})

describe('Odobravanje: lista i detalj', () => {
  it('kartica „čekaju” ima nacrt iz toka sa sličicom, formatom i brojem slajdova; tuđ brend 404', async () => {
    const id = await draft('Zašto sajtovi padaju posle migracije', 4)
    const r = await call<{
      items: Array<{
        id: string
        format: string
        slides: number
        thumb: string | null
        flowName: string | null
        platforms: string[]
      }>
      counts: Record<string, number>
    }>(listGet, '/api/approvals', { token: owner.token, query: { brandId, tab: 'waiting' } })
    expect(r.status).toBe(200)
    const item = r.json.data!.items.find((i) => i.id === id)!
    expect(item).toMatchObject({ format: 'carousel', slides: 4, flowName: 'Studije slučaja' })
    expect(item.thumb).toMatch(/^http/)
    expect(item.platforms.sort()).toEqual(['facebook', 'instagram'])
    expect(r.json.data!.counts.waiting).toBeGreaterThanOrEqual(1)
    const filtered = await call<{ items: unknown[] }>(listGet, '/api/approvals', {
      token: owner.token,
      query: { brandId, tab: 'waiting', format: 'story' },
    })
    expect(filtered.json.data!.items).toHaveLength(0)
    expect((await call(listGet, '/api/approvals', { token: other.token, query: { brandId } })).status).toBe(
      404,
    )
  })

  it('detalj: može ponovo da se generiše, predlog termina je u budućnosti, granice teksta po mreži', async () => {
    const id = await draft('Detalj nacrta')
    const d = await detail(id)
    expect(d.status).toBe(200)
    expect(d.json.data).toMatchObject({
      canRegenerate: true,
      flowName: 'Studije slučaja',
      limits: { instagram: 2200 },
    })
    expect(new Date(d.json.data!.suggestedAt).getTime()).toBeGreaterThan(Date.now())
    expect((await detail(id, other.token)).status).toBe(404)
  })
})

describe('Odobravanje: odluke', () => {
  it('izmena opisa za Instagram čuva novu verziju; urednik sme da menja, ali ne i da zakaže', async () => {
    const id = await draft('Izmene urednika')
    const before = (await detail(id)).json.data!.post
    const saved = await call<{ version: number; targets: Array<{ socialAccountId: string; text: string }> }>(
      savePost,
      `/api/approvals/${id}/save`,
      {
        token: editor.token,
        params: { id },
        body: { version: before.version, texts: { [igId]: 'Novi opis za Instagram #seo' } },
      },
    )
    expect(saved.status).toBe(200)
    expect(saved.json.data!.version).toBe(before.version + 1)
    expect(saved.json.data!.targets.find((t) => t.socialAccountId === igId)!.text).toBe(
      'Novi opis za Instagram #seo',
    )
    const tomorrow = new Date(Date.now() + 26 * 3600_000)
    tomorrow.setSeconds(0, 0)
    const denied = await call(schedulePost, `/api/approvals/${id}/schedule`, {
      token: editor.token,
      params: { id },
      body: { version: saved.json.data!.version, scheduledFor: tomorrow.toISOString() },
    })
    expect([403, 409]).toContain(denied.status)
    const stale = await call(savePost, `/api/approvals/${id}/save`, {
      token: owner.token,
      params: { id },
      body: { version: before.version, masterText: 'zastarelo' },
    })
    expect(stale.status).toBe(409)
  })

  it('„Sačuvaj i zakaži”: odobrenje i termin u jednom potezu, publisher dobija targete', async () => {
    const id = await draft('Zakazivanje')
    const d = (await detail(id)).json.data!
    const when = new Date(Date.now() + 30 * 3600_000)
    when.setSeconds(0, 0)
    const r = await call<{ status: string; targets: Array<{ scheduledAt: string | null }> }>(
      schedulePost,
      `/api/approvals/${id}/schedule`,
      {
        token: owner.token,
        params: { id },
        body: { version: d.post.version, scheduledFor: when.toISOString(), masterText: 'Konačan opis #seo' },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data!.status).toBe('scheduled')
    expect(r.json.data!.targets.every((t) => t.scheduledAt)).toBe(true)
    expect(vi.mocked(enqueueTargetScheduled)).toHaveBeenCalledTimes(2)
    const approved = await call<{ items: Array<{ id: string }> }>(listGet, '/api/approvals', {
      token: owner.token,
      query: { brandId, tab: 'approved' },
    })
    expect(approved.json.data!.items.map((i) => i.id)).toContain(id)
  })

  it('„Objavi odmah” zakazuje za sada; „Preskoči” otkazuje i nacrt prelazi u preskočene', async () => {
    const now = await draft('Objavi odmah')
    const d = (await detail(now)).json.data!
    const published = await call<{ status: string }>(publishPost, `/api/approvals/${now}/publish`, {
      token: owner.token,
      params: { id: now },
      body: { version: d.post.version },
    })
    expect(published.status).toBe(200)
    expect(['scheduled', 'publishing']).toContain(published.json.data!.status)

    const skip = await draft('Preskoči me')
    const s = (await detail(skip)).json.data!
    const r = await call<{ status: string }>(skipPost, `/api/approvals/${skip}/skip`, {
      token: owner.token,
      params: { id: skip },
      body: { version: s.post.version },
    })
    expect(r.json.data!.status).toBe('canceled')
    const skipped = await call<{ items: Array<{ id: string }> }>(listGet, '/api/approvals', {
      token: owner.token,
      query: { brandId, tab: 'skipped' },
    })
    expect(skipped.json.data!.items.map((i) => i.id)).toContain(skip)
  })

  it('„Generiši ponovo” daje nov tekst i nove slajdove istim stilom (2 tokena); zakazana objava ne može', async () => {
    const id = await draft('Prva verzija', 3)
    const d = (await detail(id)).json.data!
    enqueueReply(reply(3, 'Druga verzija'))
    const r = await call<{ version: number; title: string; media: Array<{ mediaAssetId: string }> }>(
      regeneratePost,
      `/api/approvals/${id}/regenerate`,
      {
        token: owner.token,
        params: { id },
        body: { version: d.post.version },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data!.title).toBe('Druga verzija')
    expect(r.json.data!.media).toHaveLength(3)
    const oldIds = new Set(d.post.media.map((m) => m.mediaAssetId))
    expect(r.json.data!.media.every((m) => !oldIds.has(m.mediaAssetId))).toBe(true)
    const { data: assets } = await admin
      .from('media_assets')
      .select('source_data')
      .in(
        'id',
        r.json.data!.media.map((m) => m.mediaAssetId),
      )
    expect(assets!.every((a) => (a.source_data as { styleId: string }).styleId === 'headline')).toBe(true)
    // dvostruki klik: stara verzija daje 409, bez nove naplate
    expect(
      (
        await call(regeneratePost, `/api/approvals/${id}/regenerate`, {
          token: owner.token,
          params: { id },
          body: { version: d.post.version },
        })
      ).status,
    ).toBe(409)
  })

  it('„Preuzmi” vraća ZIP sa slajdovima redom (01.jpg …)', async () => {
    const id = await draft('Preuzimanje', 3)
    const { NextRequest } = await import('next/server')
    const res = await downloadGet(
      new NextRequest(new URL(`/api/approvals/${id}/download`, APP), {
        headers: { authorization: `Bearer ${owner.token}`, origin: APP },
      }),
      { params: Promise.resolve({ id }) },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('preuzimanje.zip')
    const zip = Buffer.from(await res.arrayBuffer())
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    const eocd = zip.subarray(zip.length - 22)
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50)
    expect(eocd.readUInt16LE(10)).toBe(3)
    expect(zip.includes(Buffer.from('01.jpg'))).toBe(true)
    expect(zip.includes(Buffer.from('03.jpg'))).toBe(true)
  })
})
