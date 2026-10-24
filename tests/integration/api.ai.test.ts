import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', () => ({ enqueueImageJob: vi.fn(async () => {}) }))

import { POST as fromPhotoPost } from '@/app/api/ai/image/from-photo/route'
import { POST as fromPromptPost } from '@/app/api/ai/image/from-prompt/route'
import { GET as jobGet } from '@/app/api/ai/jobs/[id]/route'
import { POST as textPost } from '@/app/api/ai/text/route'
import { POST as uploadPost } from '@/app/api/media/upload/route'
import { GET as balanceGet } from '@/app/api/tokens/balance/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { runImageGeneration } from '@/services/ai/image'

import { calls, defaultTextOutput, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let a: TestUser
let wsA = ''
let brandA = ''

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

async function balance(): Promise<number> {
  const r = await call<{ balance: { available: number } }>(balanceGet, '/api/tokens/balance', {
    token: a.token,
    query: { workspaceId: wsA },
  })
  return r.json.data!.balance.available
}

function textBody(extra: Record<string, unknown> = {}) {
  return {
    brandId: brandA,
    platforms: ['instagram'],
    topic: 'Servis klima uređaja u Beogradu, dolazak na adresu',
    goal: 'sales',
    ...extra,
  }
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  a = await createTestUser('ai')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: a.token,
    body: { name: 'AI test', type: 'business', websiteUrl: 'tangerineseo.rs' },
  })
  wsA = ws.json.data!.workspaceId
  brandA = ws.json.data!.brandId
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  // limit generisanja je 10/min po korisniku; testovi ga dele pa se resetuje između testova
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  await deleteTestUser(a)
})

describe('AI tekst (POST /api/ai/text)', () => {
  it('bez Idempotency-Key → 400', async () => {
    const r = await call(textPost, '/api/ai/text', { token: a.token, body: textBody() })
    expect(r.status).toBe(400)
    expect(r.json.error?.code).toBe('VALIDATION')
  })

  it('srećan put: 2 tokena skinuta tek posle uspeha, generacija succeeded sa troškom', async () => {
    expect(await balance()).toBe(50)
    const r = await call<{
      generationId: string
      tokensCharged: number
      output: typeof defaultTextOutput
      model: string
    }>(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': `k-${Date.now()}-1` },
    })
    expect(r.status).toBe(200)
    expect(r.json.data?.tokensCharged).toBe(2)
    expect(r.json.data?.output.variants[0]?.platform).toBe('instagram')
    expect(r.json.data?.model).toBe(process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.6-flash')
    expect(await balance()).toBe(48)

    const { data: gen } = await admin
      .from('ai_generations')
      .select('status, tokens_charged, cost_usd, model, provider_input_tokens')
      .eq('id', r.json.data!.generationId)
      .single()
    expect(gen?.status).toBe('succeeded')
    expect(gen?.tokens_charged).toBe(2)
    expect(Number(gen?.cost_usd)).toBeGreaterThan(0)
    expect(gen?.provider_input_tokens).toBe(1200)
    expect(calls).toHaveLength(1)
    // prompt šalje sistemsku instrukciju i JSON šemu
    const body = calls[0]!.body as {
      systemInstruction?: unknown
      generationConfig?: { responseMimeType?: string }
    }
    expect(body.systemInstruction).toBeTruthy()
    expect(body.generationConfig?.responseMimeType).toBe('application/json')
  })

  it('isti Idempotency-Key vraća isti rezultat bez nove naplate', async () => {
    const key = `k-${Date.now()}-2`
    const before = await balance()
    const first = await call<{ generationId: string }>(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': key },
    })
    const second = await call<{ generationId: string }>(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': key },
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.json.data?.generationId).toBe(first.json.data?.generationId)
    expect(await balance()).toBe(before - 2)
    expect(calls).toHaveLength(1)
    const other = await call(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody({ topic: 'drugačije' }),
      headers: { 'idempotency-key': key },
    })
    expect(other.status).toBe(409)
  })

  it('privremena greška (500) pa uspeh: retry prolazi, naplata jednom', async () => {
    enqueueReply({ kind: 'status', status: 503 }, { kind: 'text', json: defaultTextOutput })
    const before = await balance()
    const r = await call(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': `k-${Date.now()}-3` },
    })
    expect(r.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(await balance()).toBe(before - 2)
  }, 20_000)

  it('safety blokada → 422 AI_BLOCKED, tokeni oslobođeni, bez fallback-a', async () => {
    enqueueReply({ kind: 'blocked' })
    const before = await balance()
    const r = await call(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': `k-${Date.now()}-4` },
    })
    expect(r.status).toBe(422)
    expect(r.json.error?.code).toBe('AI_BLOCKED')
    expect(calls).toHaveLength(1)
    expect(await balance()).toBe(before)
  })

  it('model nije pronađen → fallback model preuzima', async () => {
    enqueueReply({
      kind: 'status',
      status: 404,
      body: { error: { code: 404, message: 'models/x is not found', status: 'NOT_FOUND' } },
    })
    const r = await call<{ model: string; fallbackUsed: boolean }>(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': `k-${Date.now()}-5` },
    })
    expect(r.status).toBe(200)
    expect(r.json.data?.fallbackUsed).toBe(true)
    expect(calls.map((c) => c.model)).toEqual([
      process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.6-flash',
      process.env.GEMINI_TEXT_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite',
    ])
  })

  it('istek roka (504 DEADLINE_EXCEEDED) → odmah fallback, bez ponavljanja sporog modela', async () => {
    enqueueReply({
      kind: 'status',
      status: 504,
      body: {
        error: {
          code: 504,
          message: 'Deadline expired before operation could complete.',
          status: 'DEADLINE_EXCEEDED',
        },
      },
    })
    const r = await call<{ model: string; fallbackUsed: boolean }>(textPost, '/api/ai/text', {
      token: a.token,
      body: textBody(),
      headers: { 'idempotency-key': `k-${Date.now()}-deadline` },
    })
    expect(r.status).toBe(200)
    expect(r.json.data?.fallbackUsed).toBe(true)
    expect(calls.map((c) => c.model)).toEqual([
      process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.6-flash',
      process.env.GEMINI_TEXT_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite',
    ])
  })

  it('nedovoljno tokena → 402 i nema poziva modela', async () => {
    const { data: grants } = await admin.from('token_grants').select('id, remaining').eq('workspace_id', wsA)
    const saved = grants ?? []
    await admin.from('token_grants').update({ remaining: 1 }).eq('workspace_id', wsA)
    try {
      const r = await call(textPost, '/api/ai/text', {
        token: a.token,
        body: textBody(),
        headers: { 'idempotency-key': `k-${Date.now()}-6` },
      })
      expect(r.status).toBe(402)
      expect(r.json.error?.code).toBe('INSUFFICIENT_TOKENS')
      expect(calls).toHaveLength(0)
    } finally {
      for (const g of saved)
        await admin.from('token_grants').update({ remaining: g.remaining }).eq('id', g.id)
    }
  })
})

describe('Mediji i slike', () => {
  let assetId = ''

  it('upload odbija fajl koji nije slika, prihvata PNG i briše EXIF', async () => {
    const bad = new FormData()
    bad.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'x.png', { type: 'image/png' }))
    bad.set('workspaceId', wsA)
    const badReq = new (await import('next/server')).NextRequest(`${APP}/api/media/upload`, {
      method: 'POST',
      body: bad,
      headers: { origin: APP, authorization: `Bearer ${a.token}` },
    })
    const badRes = await uploadPost(badReq, { params: Promise.resolve({}) })
    expect(badRes.status).toBe(400)

    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2563eb' } })
      .png()
      .toBuffer()
    const form = new FormData()
    form.set('file', new File([new Uint8Array(png)], 'test.png', { type: 'image/png' }))
    form.set('workspaceId', wsA)
    form.set('brandId', brandA)
    const req = new (await import('next/server')).NextRequest(`${APP}/api/media/upload`, {
      method: 'POST',
      body: form,
      headers: { origin: APP, authorization: `Bearer ${a.token}` },
    })
    const res = await uploadPost(req, { params: Promise.resolve({}) })
    const json = (await res.json()) as {
      ok: boolean
      data: { id: string; width: number; height: number; url: string }
    }
    expect(res.status).toBe(200)
    expect(json.data.width).toBe(64)
    expect(json.data.url).toContain('/storage/v1/object/sign/uploads/')
    assetId = json.data.id
  })

  it('slika iz prompta: 202, posao završava, 8 tokena, media_assets red, potpisan URL', async () => {
    const before = await balance()
    const r = await call<{ generationId: string; status: string; tokensReserved: number }>(
      fromPromptPost,
      '/api/ai/image/from-prompt',
      {
        token: a.token,
        body: { brandId: brandA, prompt: 'Čista klima u svetlom dnevnom boravku', aspectRatio: '4:5' },
        headers: { 'idempotency-key': `img-${Date.now()}-1` },
      },
    )
    expect(r.status).toBe(202)
    expect(r.json.data?.tokensReserved).toBe(8)
    const id = r.json.data!.generationId
    expect(await balance()).toBe(before - 8) // rezervisano

    const png = await sharp({ create: { width: 32, height: 40, channels: 3, background: '#16a34a' } })
      .png()
      .toBuffer()
    enqueueReply({ kind: 'image', base64: png.toString('base64'), note: 'Svetao dnevni boravak sa klimom' })
    const run = await runImageGeneration(id)
    expect(run.status).toBe('succeeded')
    expect(calls[0]?.model).toBe(process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image')
    const cfg = calls[0]?.body as {
      generationConfig?: { responseModalities?: string[]; imageConfig?: { aspectRatio?: string } }
    }
    expect(cfg.generationConfig?.imageConfig?.aspectRatio).toBe('4:5')

    const job = await call<{ status: string; assetUrl: string | null; tokensCharged: number }>(
      jobGet,
      `/api/ai/jobs/${id}`,
      { token: a.token, params: { id } },
    )
    expect(job.json.data?.status).toBe('succeeded')
    expect(job.json.data?.tokensCharged).toBe(8)
    expect(job.json.data?.assetUrl).toContain('/generated/')
    expect(await balance()).toBe(before - 8)
    expect(await runImageGeneration(id)).toEqual({ status: 'skipped' })
  })

  it('slika iz fotografije: šalje fotografiju modelu; neuspeh oslobađa tokene', async () => {
    const before = await balance()
    const r = await call<{ generationId: string }>(fromPhotoPost, '/api/ai/image/from-photo', {
      token: a.token,
      body: {
        brandId: brandA,
        mediaAssetId: assetId,
        instruction: 'Dodaj natpis Akcija',
        quality: 'premium',
      },
      headers: { 'idempotency-key': `img-${Date.now()}-2` },
    })
    expect(r.status).toBe(202)
    const id = r.json.data!.generationId
    expect(await balance()).toBe(before - 15)

    enqueueReply({ kind: 'blocked' })
    const run = await runImageGeneration(id)
    expect(run.status).toBe('failed')
    const body = calls[0]?.body as { contents?: Array<{ parts?: Array<{ inlineData?: unknown }> }> }
    expect(body.contents?.[0]?.parts?.some((p) => p.inlineData)).toBe(true)
    expect(calls[0]?.model).toBe(process.env.GEMINI_IMAGE_PREMIUM_MODEL ?? 'gemini-3-pro-image')

    const job = await call<{ status: string; errorMessage: string | null }>(jobGet, `/api/ai/jobs/${id}`, {
      token: a.token,
      params: { id },
    })
    expect(job.json.data?.status).toBe('failed')
    expect(job.json.data?.errorMessage).toMatch(/proveru/)
    expect(await balance()).toBe(before)
  })
})
