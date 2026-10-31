import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, bulkRequest, HttpError } from './api-client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('vraća podatke, a grešku servera baca sa njegovom porukom', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ ok: true, data: { n: 1 } }))
        .mockResolvedValueOnce(json({ ok: false, error: { code: 'CONFLICT', message: 'Zauzeto.' } }, 409)),
    )
    expect(await api('/api/x')).toEqual({ n: 1 })
    await expect(api('/api/x')).rejects.toThrow('Zauzeto.')
  })

  it('telo koje nije od Sove (Netlify posle 30 sekundi) daje HttpError, ne TypeError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ errorType: 'Sandbox.Timedout', errorMessage: 'Task timed out' }, 502))
        .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 504 })),
    )
    const first = await api('/api/x').catch((e: unknown) => e)
    expect(first).toBeInstanceOf(HttpError)
    expect(first).toMatchObject({ status: 502, message: '' })
    await expect(api('/api/x')).rejects.toMatchObject({ status: 504 })
  })
})

describe('bulkRequest', () => {
  it('šalje ostatak koji server nije stigao i spaja rezultate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          ok: true,
          data: { done: ['a'], failed: [{ id: 'b', message: 'Ne može.' }], rest: ['c', 'd'] },
        }),
      )
      .mockResolvedValueOnce(json({ ok: true, data: { done: ['c', 'd'], failed: [], rest: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await bulkRequest('/api/posts/bulk', { action: 'delete' }, ['a', 'b', 'c', 'd'])
    expect(r).toEqual({ done: ['a', 'c', 'd'], failed: [{ id: 'b', message: 'Ne može.' }] })
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string)).toEqual({
      action: 'delete',
      ids: ['c', 'd'],
    })
  })

  it('više od 100 stavki ide u više zahteva, a server bez napretka ne vrti petlju', async () => {
    const ids = Array.from({ length: 130 }, (_, i) => `id-${i}`)
    const fetchMock = vi.fn(async (_path: string, init: RequestInit) => {
      const sent = (JSON.parse(init.body as string) as { ids: string[] }).ids
      return json({ ok: true, data: { done: sent, failed: [], rest: [] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await bulkRequest('/api/gallery/delete', { brandId: 'b' }, ids)).done).toEqual(ids)
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string).ids.length)).toEqual([
      100, 30,
    ])

    const stuck = vi.fn(async () => json({ ok: true, data: { done: [], failed: [], rest: ['x'] } }))
    vi.stubGlobal('fetch', stuck)
    expect(await bulkRequest('/api/posts/bulk', { action: 'skip' }, ['x'])).toEqual({ done: [], failed: [] })
    expect(stuck).toHaveBeenCalledTimes(1)
  })
})
