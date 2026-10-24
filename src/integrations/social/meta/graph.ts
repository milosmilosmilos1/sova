import { ProviderError, type ProviderErrorCode } from '@/integrations/social/errors'

/**
 * Tanki klijent za Meta Graph API (Facebook stranice i Instagram sa Facebook Login-om).
 * Verzija iz env-a (`META_GRAPH_VERSION`, 24.10.2026: v26.0); greške se mapiraju na ProviderError.
 */
export interface GraphErrorBody {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    error_user_msg?: string
    error_user_title?: string
    fbtrace_id?: string
    is_transient?: boolean
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80007])
const TOKEN_CODES = new Set([102, 190, 467])
const PERMISSION_CODES = new Set([
  10, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220,
  221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241,
  242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262,
  263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283,
  284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299,
])
const MEDIA_CODES = new Set([
  9004, 9005, 36000, 36001, 36003, 36004, 2207003, 2207004, 2207005, 2207006, 2207008, 2207009, 2207010,
  2207026, 2207032, 2207051, 2207052, 2207053, 2207057,
])

export function mapGraphError(status: number, body: GraphErrorBody | null): ProviderError {
  const e = body?.error
  const code = e?.code ?? 0
  const sub = e?.error_subcode ?? 0
  const message = e?.message ?? `HTTP ${status}`
  const raw = e ?? { status }
  const mk = (c: ProviderErrorCode, retryable?: boolean, userMessage?: string) =>
    new ProviderError(c, {
      message: `Graph ${code}${sub ? `/${sub}` : ''}: ${message}`,
      retryable,
      raw,
      status,
      userMessage,
    })

  if (TOKEN_CODES.has(code)) return mk('TOKEN_INVALID', false)
  if (code === 368) return mk('ACCOUNT_RESTRICTED', false)
  if (code === 506) return mk('DUPLICATE', false)
  if (RATE_LIMIT_CODES.has(code)) return mk('RATE_LIMITED', true)
  if (code === 9 || sub === 2207042 || (/limit/i.test(message) && /publish|post/i.test(message)))
    return mk('QUOTA_EXCEEDED', false)
  if (MEDIA_CODES.has(code) || MEDIA_CODES.has(sub)) return mk('MEDIA_REJECTED', false, e?.error_user_msg)
  if (PERMISSION_CODES.has(code)) return mk('PERMISSION_LOST', false)
  if (code === 100 || code === 1500) return mk('CONTENT_REJECTED', false, e?.error_user_msg)
  if (code === 1 || code === 2 || e?.is_transient || status >= 500) return mk('PROVIDER_DOWN', true)
  if (status === 429) return mk('RATE_LIMITED', true)
  return mk('UNKNOWN', false)
}

export interface GraphClientOptions {
  version: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class GraphClient {
  private readonly base: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(
    private readonly accessToken: string | null,
    options: GraphClientOptions,
  ) {
    this.base = `https://graph.facebook.com/${options.version}`
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  private url(path: string, params: Record<string, string | number | boolean | undefined | null>): string {
    const u = new URL(`${this.base}/${path.replace(/^\//, '')}`)
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v))
    if (this.accessToken && !u.searchParams.has('access_token'))
      u.searchParams.set('access_token', this.accessToken)
    return u.toString()
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(this.url(path, method === 'GET' || method === 'DELETE' ? params : {}), {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
        body:
          method === 'POST'
            ? new URLSearchParams(
                Object.fromEntries(
                  Object.entries(params)
                    .filter(([, v]) => v !== undefined && v !== null && v !== '')
                    .map(([k, v]) => [k, String(v)]),
                ),
              ).toString()
            : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Graph API nije dostupan.',
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
    if (!res.ok || (body && typeof body === 'object' && 'error' in (body as object))) {
      throw mapGraphError(res.status, (body as GraphErrorBody | null) ?? null)
    }
    return body as T
  }

  get<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  post<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<T> {
    return this.request<T>('POST', path, params)
  }

  delete<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<T> {
    return this.request<T>('DELETE', path, params)
  }
}
