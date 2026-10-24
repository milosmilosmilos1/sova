import { ProviderError, type ProviderErrorCode } from '@/integrations/social/errors'

/**
 * Tanki klijent za LinkedIn API. Verzionisani `/rest/*` pozivi nose `Linkedin-Version` (YYYYMM, env
 * `LINKEDIN_API_VERSION`, 24.10.2026: 202610) i `X-Restli-Protocol-Version: 2.0.0`; `/v2/userinfo`
 * (OpenID Connect) nije verzionisan. Greške se mapiraju na ProviderError.
 */
export interface LinkedInErrorBody {
  status?: number
  serviceErrorCode?: number
  code?: string
  message?: string
  /** OAuth endpoint (`/oauth/v2/accessToken`) */
  error?: string
  error_description?: string
}

export function mapLinkedInError(status: number, body: LinkedInErrorBody | null): ProviderError {
  const code = body?.code ?? body?.error ?? ''
  const message = body?.message ?? body?.error_description ?? `HTTP ${status}`
  const mk = (c: ProviderErrorCode, retryable?: boolean) =>
    new ProviderError(c, {
      message: `LinkedIn ${status}${code ? ` ${code}` : ''}: ${message}`,
      retryable,
      raw: body ?? { status },
      status,
    })
  if (status === 401 || code === 'EMPTY_ACCESS_TOKEN' || code === 'invalid_grant' || code === 'invalid_token')
    return mk('TOKEN_INVALID', false)
  if (status === 429 || code === 'TOO_MANY_REQUESTS') return mk('RATE_LIMITED', true)
  if (status >= 500) return mk('PROVIDER_DOWN', true)
  if (/duplicate/i.test(message) || /DUPLICATE/.test(code)) return mk('DUPLICATE', false)
  if (status === 403 || code === 'ACCESS_DENIED') return mk('PERMISSION_LOST', false)
  // 409 = sukob upisa na strani LinkedIn-a; dokumentacija kaže da se zahtev ponovi
  if (status === 409) return mk('PROVIDER_DOWN', true)
  if (status === 400 || status === 422) {
    if (/image|media|upload|asset/i.test(message)) return mk('MEDIA_REJECTED', false)
    return mk('CONTENT_REJECTED', false)
  }
  return mk('UNKNOWN', false)
}

export interface LinkedInClientOptions {
  version: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface LinkedInResponse<T> {
  status: number
  headers: Headers
  body: T
}

const API = 'https://api.linkedin.com'

export class LinkedInClient {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(
    private readonly accessToken: string,
    private readonly options: LinkedInClientOptions,
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  /** `path` sadrži i query (Rest.li liste i URN-ovi se kodiraju na mestu poziva). */
  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    init: { json?: unknown; restliMethod?: string } = {},
  ): Promise<LinkedInResponse<T>> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.accessToken}` }
    if (path.startsWith('/rest/')) {
      headers['linkedin-version'] = this.options.version
      headers['x-restli-protocol-version'] = '2.0.0'
    }
    if (init.restliMethod) headers['x-restli-method'] = init.restliMethod
    if (init.json !== undefined) headers['content-type'] = 'application/json'
    let res: Response
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        method,
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'LinkedIn API nije dostupan.',
        raw: error,
        retryable: true,
      })
    }
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    if (!res.ok) throw mapLinkedInError(res.status, body as LinkedInErrorBody | null)
    return { status: res.status, headers: res.headers, body: body as T }
  }

  async get<T>(path: string, restliMethod?: string): Promise<T> {
    return (await this.request<T>('GET', path, { restliMethod })).body
  }

  post<T>(path: string, json: unknown): Promise<LinkedInResponse<T>> {
    return this.request<T>('POST', path, { json })
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path, { restliMethod: 'DELETE' })
  }
}

/** `urn:li:share:1` → `urn%3Ali%3Ashare%3A1` (URN u putanji i u Rest.li listama mora biti kodiran). */
export const encUrn = (urn: string) => encodeURIComponent(urn)
