import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('@/lib/auth/viewer', () => ({ getViewer: vi.fn(async () => null) }))

import { ApiError } from './errors'
import { createHandler } from './handler'

const routeCtx = { params: Promise.resolve({}) }

function req(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; json?: unknown } = {},
) {
  const headers = new Headers(init.headers)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(init.json)
  }
  return new NextRequest(`http://localhost:3001${path}`, {
    method: init.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
  })
}

describe('createHandler', () => {
  it('vraća { ok: true, data } i x-request-id', async () => {
    const handler = createHandler({ auth: 'none' }, async () => ({ hello: 'svet' }))
    const res = await handler(req('/api/x', { headers: { 'x-request-id': 'rid-1' } }), routeCtx)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toBe('rid-1')
    expect(res.headers.get('cache-control')).toBe('no-store')
    await expect(res.json()).resolves.toEqual({ ok: true, data: { hello: 'svet' } })
  })

  it('validira telo Zod šemom i vraća 400 sa poljima', async () => {
    const handler = createHandler(
      { auth: 'none', body: z.object({ name: z.string().min(2), age: z.number().int() }) },
      async ({ body }) => body,
    )
    const res = await handler(req('/api/x', { method: 'POST', json: { name: 'a', age: 'x' } }), routeCtx)
    expect(res.status).toBe(400)
    const json = (await res.json()) as {
      ok: false
      error: { code: string; fields: Record<string, string[]>; requestId: string }
    }
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('VALIDATION')
    expect(Object.keys(json.error.fields).sort()).toEqual(['age', 'name'])
    expect(json.error.requestId).toBeTruthy()
  })

  it('odbija telo koje nije JSON', async () => {
    const handler = createHandler({ auth: 'none', body: z.object({}) }, async () => 1)
    const res = await handler(req('/api/x', { method: 'POST', body: '{nije json' }), routeCtx)
    expect(res.status).toBe(400)
  })

  it('validira query parametre', async () => {
    const handler = createHandler(
      { auth: 'none', query: z.object({ page: z.coerce.number().int().min(1) }) },
      async ({ query }) => query,
    )
    const ok = await handler(req('/api/x?page=2'), routeCtx)
    await expect(ok.json()).resolves.toEqual({ ok: true, data: { page: 2 } })
    const bad = await handler(req('/api/x?page=0'), routeCtx)
    expect(bad.status).toBe(400)
  })

  it('cron auth traži Bearer CRON_SECRET', async () => {
    const handler = createHandler({ auth: 'cron' }, async () => 'ran')
    const no = await handler(req('/api/cron'), routeCtx)
    expect(no.status).toBe(401)
    const yes = await handler(
      req('/api/cron', { headers: { authorization: 'Bearer test-cron-secret-123456' } }),
      routeCtx,
    )
    expect(yes.status).toBe(200)
  })

  it('user auth bez sesije vraća 401', async () => {
    const handler = createHandler({ auth: 'user' }, async () => 'x')
    const res = await handler(req('/api/me'), routeCtx)
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('UNAUTHENTICATED')
  })

  it('ApiError prolazi sa svojim statusom i porukom na srpskom', async () => {
    const handler = createHandler({ auth: 'none' }, async () => {
      throw new ApiError('INSUFFICIENT_TOKENS')
    })
    const res = await handler(req('/api/x'), routeCtx)
    expect(res.status).toBe(402)
    const json = (await res.json()) as { error: { message: string } }
    expect(json.error.message).toMatch(/tokena/)
  })

  it('nepoznata greška postaje 500 INTERNAL bez detalja', async () => {
    const handler = createHandler({ auth: 'none' }, async () => {
      throw new Error('tajna interna poruka')
    })
    const res = await handler(req('/api/x'), routeCtx)
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: { code: string; message: string } }
    expect(json.error.code).toBe('INTERNAL')
    expect(json.error.message).not.toContain('tajna')
  })

  it('rate limit vraća 429 sa Retry-After', async () => {
    const handler = createHandler(
      { auth: 'none', rateLimit: { name: 'test-rl', limit: 1, windowSec: 60 } },
      async () => 'ok',
    )
    const first = await handler(req('/api/x', { headers: { 'x-forwarded-for': '9.9.9.9' } }), routeCtx)
    expect(first.status).toBe(200)
    const second = await handler(req('/api/x', { headers: { 'x-forwarded-for': '9.9.9.9' } }), routeCtx)
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('vraća prosleđen Response bez omotavanja', async () => {
    const handler = createHandler({ auth: 'none' }, async () => new Response('plain', { status: 201 }))
    const res = await handler(req('/api/x'), routeCtx)
    expect(res.status).toBe(201)
    await expect(res.text()).resolves.toBe('plain')
  })
})
