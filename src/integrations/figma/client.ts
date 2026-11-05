import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import type { FigmaNode } from '@/lib/figma/brand'
import { logger } from '@/lib/logger'

/**
 * Figma REST API (D-161, developers.figma.com pročitano 5.11.2026): OAuth sa PKCE (S256) na
 * `www.figma.com/oauth`, token `POST api.figma.com/v1/oauth/token` (form-urlencoded, Basic auth),
 * pristup važi 90 dana, obnova `POST /v1/oauth/refresh` sa istim refresh tokenom (ne menja se).
 * Čitanje fajla i izvoz slike su najstrože ograničeni zahtevi (Tier 1), pa se zovu što ređe.
 */
export const FIGMA_AUTHORIZE_URL = 'https://www.figma.com/oauth'
export const FIGMA_TOKEN_URL = 'https://api.figma.com/v1/oauth/token'
export const FIGMA_REFRESH_URL = 'https://api.figma.com/v1/oauth/refresh'
export const FIGMA_API = 'https://api.figma.com/v1'

/** Samo čitanje: sadržaj fajla (i izvoz slika) i podaci o fajlu. */
export const FIGMA_SCOPES = ['file_content:read', 'file_metadata:read'] as const

export function isFigmaConfigured(): boolean {
  return Boolean(env.FIGMA_CLIENT_ID && env.FIGMA_CLIENT_SECRET)
}

export { createPkce } from '@/lib/crypto/pkce'

export function buildAuthorizeUrl(params: { challenge: string; state: string; redirectUri: string }): string {
  const u = new URL(FIGMA_AUTHORIZE_URL)
  u.searchParams.set('client_id', env.FIGMA_CLIENT_ID ?? '')
  u.searchParams.set('redirect_uri', params.redirectUri)
  u.searchParams.set('scope', FIGMA_SCOPES.join(' '))
  u.searchParams.set('state', params.state)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('code_challenge', params.challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

export interface FigmaTokens {
  accessToken: string
  /** obnova ne vraća nov refresh token: stari ostaje */
  refreshToken: string | null
  expiresAt: string
  userId: string | null
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${env.FIGMA_CLIENT_ID}:${env.FIGMA_CLIENT_SECRET}`).toString('base64')}`
}

async function tokenRequest(url: string, body: Record<string, string>): Promise<FigmaTokens> {
  if (!isFigmaConfigured()) throw new ApiError('AI_UNAVAILABLE', 'Figma integracija nije podešena.')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authorization: basicAuth(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new ApiError('PROVIDER_ERROR', 'Figma nije dostupna. Pokušajte ponovo.', { cause: error })
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    user_id_string?: string
    user_id?: number
    error?: string
    message?: string
  }
  if (!res.ok || !json.access_token) {
    logger.warn('figma_token_error', { status: res.status, error: json.error })
    if (res.status === 400 || res.status === 401 || res.status === 403)
      throw new ApiError('FORBIDDEN', 'Figma veza je istekla ili je opozvana. Povežite Figmu ponovo.')
    throw new ApiError('PROVIDER_ERROR', `Figma nije izdala token (${json.error ?? res.status}).`)
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 90 * 86_400) * 1000).toISOString(),
    userId: json.user_id_string ?? (json.user_id ? String(json.user_id) : null),
  }
}

export function exchangeCode(params: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<FigmaTokens> {
  return tokenRequest(FIGMA_TOKEN_URL, {
    redirect_uri: params.redirectUri,
    code: params.code,
    grant_type: 'authorization_code',
    code_verifier: params.codeVerifier,
  })
}

export function refreshAccessToken(refreshToken: string): Promise<FigmaTokens> {
  return tokenRequest(FIGMA_REFRESH_URL, { refresh_token: refreshToken })
}

async function api<T>(accessToken: string, path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${FIGMA_API}${path}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    })
  } catch (error) {
    throw new ApiError('PROVIDER_ERROR', 'Figma nije dostupna. Pokušajte ponovo.', { cause: error })
  }
  const body = (await res.json().catch(() => ({}))) as T & { err?: string; message?: string }
  if (res.status === 401) throw new ApiError('FORBIDDEN', 'Figma pristup je istekao. Povežite Figmu ponovo.')
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 60)
    throw new ApiError(
      'RATE_LIMITED',
      'Figma je privremeno ograničila uvoz za vaš nalog. Sa mestom bez prava uređivanja (View, Collab) Figma dozvoljava malo uvoza mesečno.',
      { retryAfterSec: Number.isFinite(retry) ? Math.min(retry, 86_400) : 60 },
    )
  }
  if (res.status === 403 || res.status === 404)
    throw new ApiError(
      'NOT_FOUND',
      'Figma ne daje pristup ovom fajlu. Proverite link i da je fajl podeljen sa vašim Figma nalogom.',
    )
  if (!res.ok) {
    logger.warn('figma_api_error', { status: res.status, path: path.split('?')[0], err: body.err })
    throw new ApiError('PROVIDER_ERROR', 'Figma je vratila grešku. Pokušajte ponovo.')
  }
  return body
}

export interface FigmaFile {
  name: string
  lastModified: string
  document: FigmaNode
}

/** Fajl do okvira (strane, sekcije i okviri u njima); bez dubljih slojeva, da odgovor bude mali. */
export function getFile(accessToken: string, fileKey: string): Promise<FigmaFile> {
  return api<FigmaFile>(accessToken, `/files/${encodeURIComponent(fileKey)}?depth=3`)
}

/** Ceo sadržaj izabranih okvira (boje, tekst, fontovi, slojevi). */
export async function getNodes(
  accessToken: string,
  fileKey: string,
  ids: string[],
): Promise<Record<string, FigmaNode | null>> {
  const r = await api<{ nodes: Record<string, { document: FigmaNode } | null> }>(
    accessToken,
    `/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(ids.join(','))}`,
  )
  return Object.fromEntries(Object.entries(r.nodes ?? {}).map(([id, n]) => [id, n?.document ?? null]))
}

/** Adrese PNG slika okvira (važe 30 dana); okvir koji Figma ne nacrta ima `null`. */
export async function getImages(
  accessToken: string,
  fileKey: string,
  ids: string[],
  scale: number,
): Promise<Record<string, string | null>> {
  const r = await api<{ err: string | null; images: Record<string, string | null> }>(
    accessToken,
    `/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(ids.join(','))}&format=png&scale=${scale}`,
  )
  return r.images ?? {}
}
