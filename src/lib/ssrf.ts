import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF zaštita (brif 4): samo http/https, DNS provera svake adrese (IPv4 i IPv6),
 * blokada privatnih, loopback, link-local, multicast i cloud-metadata opsega,
 * najviše 5 redirecta uz ponovnu proveru, timeout i gornja granica veličine.
 * Bez `server-only` da bi se testirao u Vitest-u; koristi se samo na serveru.
 */
export type SsrfErrorCode =
  'INVALID_URL' | 'BLOCKED_HOST' | 'TOO_MANY_REDIRECTS' | 'TOO_LARGE' | 'TIMEOUT' | 'FETCH_FAILED'

export class SsrfError extends Error {
  constructor(
    readonly code: SsrfErrorCode,
    message: string,
    readonly url?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'SsrfError'
  }
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$|ref$|yclid$|_hs|igshid$)/i

/** Normalizacija URL-a koji je uneo korisnik: protokol, mala slova u hostu, bez fragmenta i tracking parametara. */
export function normalizeUrl(input: string): URL {
  let raw = input.trim()
  if (!raw) throw new SsrfError('INVALID_URL', 'URL je prazan.')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SsrfError('INVALID_URL', 'URL nije ispravan.', input)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('INVALID_URL', 'Dozvoljeni su samo http i https linkovi.', input)
  }
  if (url.username || url.password)
    throw new SsrfError('INVALID_URL', 'URL ne sme da sadrži korisničko ime.', input)
  url.hostname = url.hostname.toLowerCase()
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80'))
    url.port = ''
  return url
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0) >>> 0
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return PRIVATE_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) === (ipv4ToInt(base) & mask)
  })
}

function expandIPv6(ip: string): number[] | null {
  const clean = ip.replace(/^\[|\]$/g, '').split('%')[0]!
  const halves = clean.split('::')
  if (halves.length > 2) return null
  const toGroups = (s: string) => (s ? s.split(':') : [])
  const head = toGroups(halves[0]!)
  const tail = halves.length === 2 ? toGroups(halves[1]!) : []
  // IPv4-mapped suffix (::ffff:1.2.3.4)
  const last = tail[tail.length - 1] ?? head[head.length - 1]
  let v4: number[] | null = null
  if (last && last.includes('.')) {
    const parts = last.split('.').map(Number)
    if (parts.length !== 4) return null
    v4 = [(parts[0]! << 8) | parts[1]!, (parts[2]! << 8) | parts[3]!]
    if (tail.length) tail.pop()
    else head.pop()
  }
  const groups = [...head.map((g) => parseInt(g || '0', 16)), ...(v4 ?? [])]
  const tailGroups = tail.map((g) => parseInt(g || '0', 16))
  const missing = 8 - groups.length - tailGroups.length
  if (missing < 0) return null
  const full = [...groups, ...Array<number>(missing).fill(0), ...tailGroups]
  if (v4 && halves.length === 2) {
    // v4 belongs at the end
    const idx = full.indexOf(v4[0]!)
    if (idx !== -1 && idx !== 6) {
      full.splice(idx, 2)
      full.push(v4[0]!, v4[1]!)
    }
  }
  return full.length === 8 ? full : null
}

export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip)
  if (!g) return true
  const [g0, g1] = [g[0]!, g[1]!]
  if (g.every((x) => x === 0)) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true // fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true // fe80::/10
  if ((g0 & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // dokumentacija
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff
  const nat64 = g0 === 0x0064 && g1 === 0xff9b && g.slice(2, 6).every((x) => x === 0)
  if (mapped || nat64) {
    const v4 = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`
    return isPrivateIPv4(v4)
  }
  return false
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return isPrivateIPv4(ip)
  if (kind === 6) return isPrivateIPv6(ip)
  return true
}

export type ResolveFn = (hostname: string) => Promise<string[]>

export const defaultResolve: ResolveFn = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map((r) => r.address)
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data'])

/**
 * Statičke provere imena hosta (bez DNS-a): lokalna imena, interni sufiksi, privatni IP literal.
 * Vraća IP adresu ako je host literal, inače null.
 */
export function assertHostnameSyntax(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    throw new SsrfError('BLOCKED_HOST', 'Adresa pokazuje na lokalnu ili internu mrežu.', hostname)
  }
  if (!host.includes('.') && !host.startsWith('[')) {
    throw new SsrfError('INVALID_URL', 'Unesite pun naziv domena, npr. primer.rs.', hostname)
  }
  const literal = host.replace(/^\[|\]$/g, '')
  if (isIP(literal)) {
    if (isPrivateAddress(literal)) throw new SsrfError('BLOCKED_HOST', 'IP adresa nije javna.', hostname)
    return literal
  }
  return null
}

/** Baca SsrfError ako host nije javan; vraća razrešene adrese. */
export async function assertPublicHost(
  hostname: string,
  resolve: ResolveFn = defaultResolve,
): Promise<string[]> {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const literal = assertHostnameSyntax(hostname)
  if (literal) return [literal]
  let addresses: string[]
  try {
    addresses = await resolve(host)
  } catch (error) {
    throw new SsrfError('FETCH_FAILED', 'Domen ne postoji ili DNS ne odgovara.', hostname, { cause: error })
  }
  if (!addresses.length) throw new SsrfError('FETCH_FAILED', 'Domen nema adresu.', hostname)
  if (addresses.some(isPrivateAddress)) {
    throw new SsrfError('BLOCKED_HOST', 'Domen pokazuje na privatnu adresu.', hostname)
  }
  return addresses
}

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  resolve?: ResolveFn
  fetchImpl?: typeof fetch
  userAgent?: string
}

export interface SafeFetchResult {
  url: string
  status: number
  ok: boolean
  headers: Headers
  body: Buffer
  contentType: string
  redirected: boolean
  elapsedMs: number
}

export type SafeFetchFn = (input: string | URL, options?: SafeFetchOptions) => Promise<SafeFetchResult>

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

async function readWithCap(res: Response, maxBytes: number, url: string): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes)
    throw new SsrfError('TOO_LARGE', `Odgovor je veći od ${Math.round(maxBytes / 1024)} KB.`, url)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new SsrfError('TOO_LARGE', `Odgovor je veći od ${Math.round(maxBytes / 1024)} KB.`, url)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** Fetch sa SSRF proverom svakog hop-a, timeout-om i ograničenjem veličine. */
export const safeFetch: SafeFetchFn = async (input, options = {}) => {
  const started = Date.now()
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  const maxRedirects = options.maxRedirects ?? 5
  const fetchImpl = options.fetchImpl ?? fetch
  const userAgent =
    options.userAgent ?? `SovaBot/1.0 (+${process.env.BOT_INFO_URL ?? 'https://sovaai.rs/bot'})`

  let url = typeof input === 'string' ? normalizeUrl(input) : new URL(input.toString())
  let redirects = 0
  for (;;) {
    await assertPublicHost(url.hostname, options.resolve)
    let res: Response
    try {
      res = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...options.headers,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new SsrfError(
          'TIMEOUT',
          `Sajt nije odgovorio za ${Math.round(timeoutMs / 1000)} s.`,
          url.toString(),
          { cause: error },
        )
      }
      throw new SsrfError('FETCH_FAILED', 'Sajt nije dostupan.', url.toString(), { cause: error })
    }
    if (REDIRECT_STATUS.has(res.status)) {
      const location = res.headers.get('location')
      await res.body?.cancel().catch(() => undefined)
      if (!location) throw new SsrfError('FETCH_FAILED', 'Preusmerenje bez odredišta.', url.toString())
      if (++redirects > maxRedirects)
        throw new SsrfError('TOO_MANY_REDIRECTS', 'Previše preusmerenja.', url.toString())
      const next = new URL(location, url)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new SsrfError('INVALID_URL', 'Preusmerenje na nedozvoljen protokol.', next.toString())
      }
      url = next
      continue
    }
    const body = await readWithCap(res, maxBytes, url.toString())
    return {
      url: url.toString(),
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      redirected: redirects > 0,
      elapsedMs: Date.now() - started,
    }
  }
}
