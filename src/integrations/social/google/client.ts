import { env } from '@/lib/env'
import { ProviderError, type ProviderErrorCode } from '@/integrations/social/errors'
import type { TokenSet } from '@/integrations/social/types'

/**
 * Google OAuth 2.0 za web server i tanki klijent za Google API-je (YouTube i Google Business Profile,
 * faza 8c, D-084). Isti OAuth klijent kao Google prijava (`GOOGLE_CLIENT_ID/SECRET`), sa redirect
 * URI-jima `/api/integrations/{youtube|google_business}/callback`. `access_type=offline` i
 * `prompt=consent`, jer Google refresh token daje samo pri prvom pristanku; `scope` iz odgovora može
 * biti podskup traženog (granularni pristanak), pa provider proverava šta je odobreno.
 */
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
export const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const IDENTITY_SCOPES = ['openid', 'email', 'profile']

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export function googleAuthUrl(
  scopes: readonly string[],
  ctx: { state: string; redirectUri: string },
): string {
  const u = new URL(GOOGLE_AUTH_URL)
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID ?? '')
  u.searchParams.set('redirect_uri', ctx.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', [...IDENTITY_SCOPES, ...scopes].join(' '))
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('state', ctx.state)
  return u.toString()
}

export interface GoogleErrorBody {
  error?:
    | string
    | {
        code?: number
        status?: string
        message?: string
        details?: Array<{ reason?: string; errorDetails?: Array<{ code?: string; message?: string }> }>
        /** YouTube Data API: `errors[0].reason` */
        errors?: Array<{ reason?: string; message?: string }>
      }
  error_description?: string
}

function reasonsOf(body: GoogleErrorBody | null): string[] {
  const e = body?.error
  if (!e || typeof e === 'string') return typeof e === 'string' ? [e] : []
  return [
    ...(e.errors ?? []).map((x) => x.reason ?? ''),
    ...(e.details ?? []).flatMap((d) => [d.reason ?? '', ...(d.errorDetails ?? []).map((x) => x.code ?? '')]),
    e.status ?? '',
  ].filter(Boolean)
}

/** Greške Google API-ja (google.rpc.Status, YouTube `errors[].reason`, OAuth `error`) → ProviderError. */
export function mapGoogleError(
  status: number,
  body: GoogleErrorBody | null,
  service = 'Google',
): ProviderError {
  const reasons = reasonsOf(body)
  const has = (...r: string[]) => reasons.some((x) => r.includes(x))
  const e = body?.error
  const message =
    (typeof e === 'object' ? e.message : undefined) ??
    body?.error_description ??
    (typeof e === 'string' ? e : '')
  const mk = (code: ProviderErrorCode, retryable?: boolean, userMessage?: string) =>
    new ProviderError(code, {
      message: `${service} ${status}${reasons.length ? ` ${reasons.join(',')}` : ''}: ${message || `HTTP ${status}`}`,
      retryable,
      userMessage,
      raw: body ?? { status },
      status,
    })
  if (has('invalid_grant') || status === 401 || has('authError', 'expired', 'UNAUTHENTICATED'))
    return mk('TOKEN_INVALID', false, `${service} veza je istekla ili je opozvana. Povežite nalog ponovo.`)
  if (has('quotaExceeded', 'uploadLimitExceeded', 'dailyLimitExceeded')) return mk('QUOTA_EXCEEDED', false)
  if (
    status === 429 ||
    has('rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED')
  )
    return mk('RATE_LIMITED', true)
  if (status >= 500 || has('temporarily_unavailable', 'backendError')) return mk('PROVIDER_DOWN', true)
  if (
    has('channelSuspended', 'channelClosed', 'LOCATION_DISABLED_FOR_LOCAL_POST_API', 'youtubeSignupRequired')
  )
    return mk('ACCOUNT_RESTRICTED', false)
  if (has('PHOTO_FETCH_FAILED', 'PHOTO_UPLOAD_FAILED', 'mediaBodyRequired', 'invalidVideo'))
    return mk('MEDIA_REJECTED', false)
  if (
    status === 403 ||
    has('insufficientPermissions', 'forbidden', 'PERMISSION_DENIED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
  )
    return mk('PERMISSION_LOST', false)
  if (status === 400 || status === 422) return mk('CONTENT_REJECTED', false)
  return mk('UNKNOWN', false)
}

interface TokenBody extends GoogleErrorBody {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

export async function googleTokenRequest(
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenSet> {
  let res: Response
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        client_id: env.GOOGLE_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      }).toString(),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new ProviderError('PROVIDER_DOWN', {
      message: 'Google OAuth nije dostupan.',
      raw: error,
      retryable: true,
    })
  }
  const body = (await res.json().catch(() => null)) as TokenBody | null
  if (!res.ok || !body?.access_token) throw mapGoogleError(res.status, body)
  const now = Date.now()
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000).toISOString() : null,
    refreshExpiresAt: body.refresh_token_expires_in
      ? new Date(now + body.refresh_token_expires_in * 1000).toISOString()
      : null,
    scopes: (body.scope ?? '').split(/\s+/).filter(Boolean),
  }
}

export interface GoogleUser {
  sub: string
  name?: string
  email?: string
  picture?: string
}

export async function googleExchangeCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<TokenSet & { externalUserId: string; externalUserName: string | null }> {
  const tokens = await googleTokenRequest(
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    fetchImpl,
  )
  const me = await new GoogleApiClient(tokens.accessToken, fetchImpl, 'Google').get<GoogleUser>(
    GOOGLE_USERINFO_URL,
  )
  return { ...tokens, externalUserId: me.sub, externalUserName: me.name ?? me.email ?? null }
}

/** Google ne menja refresh token pri osvežavanju; zadržava se postojeći. */
export async function googleRefresh(tokens: TokenSet, fetchImpl: typeof fetch): Promise<TokenSet> {
  if (!tokens.refreshToken) {
    throw new ProviderError('TOKEN_INVALID', {
      message: 'Google veza nema refresh token.',
      userMessage: 'Google veza je istekla. Povežite nalog ponovo.',
    })
  }
  const fresh = await googleTokenRequest(
    { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
    fetchImpl,
  )
  return {
    ...fresh,
    refreshToken: fresh.refreshToken ?? tokens.refreshToken,
    refreshExpiresAt: fresh.refreshExpiresAt ?? tokens.refreshExpiresAt,
    scopes: fresh.scopes.length ? fresh.scopes : tokens.scopes,
  }
}

/**
 * Opoziv ukida sve dozvole koje je korisnik dao projektu (i YouTube i poslovni profil), pa ga
 * `removeSocialAccount` poziva samo kad nijedan drugi nalog ne koristi isti Google identitet.
 */
export async function googleRevoke(tokens: TokenSet, fetchImpl: typeof fetch): Promise<void> {
  const token = tokens.refreshToken ?? tokens.accessToken
  if (!token) return
  await fetchImpl(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(15_000),
  })
}

export interface GoogleResponse<T> {
  status: number
  headers: Headers
  body: T
}

/** Tanki klijent: Bearer token, JSON, mapiranje grešaka; GBP v4 traži detaljne greške (format 2). */
export class GoogleApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch,
    private readonly service: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    init: { json?: unknown; headers?: Record<string, string>; body?: BodyInit; timeoutMs?: number } = {},
  ): Promise<GoogleResponse<T>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.accessToken}`,
      ...(init.headers ?? {}),
    }
    if (url.startsWith('https://mybusiness.googleapis.com/v4/')) headers['x-goog-api-format-version'] = '2'
    if (init.json !== undefined) headers['content-type'] = 'application/json; charset=UTF-8'
    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
        signal: AbortSignal.timeout(init.timeoutMs ?? this.timeoutMs),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: `${this.service} API nije dostupan.`,
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
    if (!res.ok) throw mapGoogleError(res.status, body as GoogleErrorBody | null, this.service)
    return { status: res.status, headers: res.headers, body: body as T }
  }

  async get<T>(url: string): Promise<T> {
    return (await this.request<T>('GET', url)).body
  }

  async post<T>(url: string, json: unknown): Promise<T> {
    return (await this.request<T>('POST', url, { json })).body
  }

  async delete(url: string): Promise<void> {
    await this.request('DELETE', url)
  }
}
