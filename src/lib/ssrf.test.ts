import { describe, expect, it } from 'vitest'

import {
  assertHostnameSyntax,
  assertPublicHost,
  isPrivateIPv4,
  isPrivateIPv6,
  normalizeUrl,
  safeFetch,
  SsrfError,
} from './ssrf'

const publicResolve = async () => ['93.184.216.34']

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    if (!key) return new Response('not found', { status: 404 })
    return routes[key]!()
  }) as typeof fetch
}

describe('normalizeUrl', () => {
  it('dodaje https, spušta host, briše fragment i tracking parametre', () => {
    const u = normalizeUrl('Primer.RS/Usluge?utm_source=x&fbclid=1&id=5#top')
    expect(u.toString()).toBe('https://primer.rs/Usluge?id=5')
  })
  it('odbija druge protokole i kredencijale', () => {
    expect(() => normalizeUrl('ftp://primer.rs')).toThrow(SsrfError)
    expect(() => normalizeUrl('https://user:pass@primer.rs')).toThrow(SsrfError)
    expect(() => normalizeUrl('   ')).toThrow(SsrfError)
  })
})

describe('privatne adrese', () => {
  it('IPv4', () => {
    for (const ip of [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.5.5',
      '192.168.1.1',
      '100.64.0.1',
      '0.0.0.0',
    ])
      expect(isPrivateIPv4(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '93.184.216.34', '1.1.1.1']) expect(isPrivateIPv4(ip), ip).toBe(false)
  })
  it('IPv6 uključujući mapirane IPv4', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      'ff02::1',
    ])
      expect(isPrivateIPv6(ip), ip).toBe(true)
    for (const ip of ['2606:4700::1111', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8'])
      expect(isPrivateIPv6(ip), ip).toBe(false)
  })
})

describe('assertPublicHost', () => {
  it('blokira lokalna i interna imena bez DNS-a', async () => {
    for (const h of [
      'localhost',
      'app.localhost',
      'metadata.google.internal',
      'db.internal',
      'printer.local',
      '127.0.0.1',
      '[::1]',
    ])
      await expect(assertPublicHost(h, publicResolve), h).rejects.toMatchObject({ code: 'BLOCKED_HOST' })
  })
  it('traži pun domen', () => {
    expect(() => assertHostnameSyntax('intranet')).toThrow(/pun naziv domena/)
  })
  it('blokira domen koji se razrešava u privatnu adresu (DNS rebinding)', async () => {
    await expect(
      assertPublicHost('evil.example', async () => ['93.184.216.34', '10.0.0.5']),
    ).rejects.toMatchObject({
      code: 'BLOCKED_HOST',
    })
    await expect(assertPublicHost('ok.example', publicResolve)).resolves.toEqual(['93.184.216.34'])
  })
  it('nepostojeći domen daje FETCH_FAILED', async () => {
    await expect(
      assertPublicHost('nema.example', async () => {
        throw new Error('ENOTFOUND')
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' })
  })
})

describe('safeFetch', () => {
  it('prati redirect i proverava svaki hop', async () => {
    const hosts: string[] = []
    const res = await safeFetch('http://a.example/', {
      fetchImpl: fakeFetch({
        'http://a.example/': () =>
          new Response(null, { status: 301, headers: { location: 'https://b.example/final' } }),
        'https://b.example/final': () =>
          new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      }),
      resolve: async (h) => {
        hosts.push(h)
        return ['93.184.216.34']
      },
    })
    expect(res.url).toBe('https://b.example/final')
    expect(res.redirected).toBe(true)
    expect(res.body.toString()).toContain('ok')
    expect(hosts).toEqual(['a.example', 'b.example'])
  })
  it('blokira redirect na privatnu adresu', async () => {
    await expect(
      safeFetch('https://a.example/', {
        fetchImpl: fakeFetch({
          'https://a.example/': () =>
            new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/admin' } }),
        }),
        resolve: publicResolve,
      }),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' })
  })
  it('ograničava broj redirecta', async () => {
    await expect(
      safeFetch('https://loop.example/', {
        fetchImpl: fakeFetch({
          'https://loop.example/': () => new Response(null, { status: 302, headers: { location: '/' } }),
        }),
        resolve: publicResolve,
        maxRedirects: 3,
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' })
  })
  it('odbija prevelik odgovor po headeru i po toku', async () => {
    await expect(
      safeFetch('https://big.example/', {
        fetchImpl: fakeFetch({
          'https://big.example/': () =>
            new Response('x', { status: 200, headers: { 'content-length': '999999' } }),
        }),
        resolve: publicResolve,
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
    await expect(
      safeFetch('https://stream.example/', {
        fetchImpl: fakeFetch({
          'https://stream.example/': () => new Response('a'.repeat(5000), { status: 200 }),
        }),
        resolve: publicResolve,
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })
  it('timeout postaje TIMEOUT greška', async () => {
    const timeoutFetch = (async () => {
      const e = new Error('aborted')
      e.name = 'TimeoutError'
      throw e
    }) as unknown as typeof fetch
    await expect(
      safeFetch('https://slow.example/', { fetchImpl: timeoutFetch, resolve: publicResolve }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })
})
