import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Canva Connect API (docs/INTEGRATIONS.md 11, provereno 24.10.2026):
 * OAuth Authorization Code + PKCE (S256), token endpoint form-urlencoded sa Basic auth,
 * refresh token jednokratan (rotira se). REST baza https://api.canva.com/rest/v1.
 */
export const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize'
export const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'
export const CANVA_API = 'https://api.canva.com/rest/v1'

export const CANVA_SCOPES = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'asset:read',
  'asset:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'profile:read',
] as const

export function isCanvaConfigured(): boolean {
  return Boolean(env.CANVA_CLIENT_ID && env.CANVA_CLIENT_SECRET)
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildAuthorizeUrl(params: { challenge: string; state: string; redirectUri: string }): string {
  const u = new URL(CANVA_AUTHORIZE_URL)
  u.searchParams.set('code_challenge', params.challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', env.CANVA_CLIENT_ID ?? '')
  u.searchParams.set('scope', CANVA_SCOPES.join(' '))
  u.searchParams.set('state', params.state)
  u.searchParams.set('redirect_uri', params.redirectUri)
  return u.toString()
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: string
  scopes: string[]
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`).toString('base64')}`
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  if (!isCanvaConfigured()) throw new ApiError('AI_UNAVAILABLE', 'Canva integracija nije podešena.')
  let res: Response
  try {
    res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: { authorization: basicAuth(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new ApiError('PROVIDER_ERROR', 'Canva nije dostupna. Pokušajte ponovo.', { cause: error })
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    code?: string
    message?: string
  }
  if (!res.ok || !json.access_token || !json.refresh_token) {
    logger.warn('canva_token_error', { status: res.status, code: json.code })
    if (json.code === 'invalid_grant') {
      throw new ApiError('FORBIDDEN', 'Canva veza je istekla ili je opozvana. Povežite Canvu ponovo.')
    }
    throw new ApiError('PROVIDER_ERROR', `Canva nije izdala token (${json.code ?? res.status}).`)
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 14_400) * 1000).toISOString(),
    scopes: (json.scope ?? '').split(' ').filter(Boolean),
  }
}

export function exchangeCode(params: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<TokenSet> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  })
}

export function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

async function api<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  let res: Response
  try {
    res = await fetch(`${CANVA_API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new ApiError('PROVIDER_ERROR', 'Canva nije dostupna. Pokušajte ponovo.', { cause: error })
  }
  const body = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string }
  if (res.status === 401) throw new ApiError('FORBIDDEN', 'Canva pristup je istekao. Povežite Canvu ponovo.')
  if (res.status === 429)
    throw new ApiError('RATE_LIMITED', 'Canva limit zahteva. Sačekajte minut.', { retryAfterSec: 60 })
  if (res.status === 403) return { status: 403, body }
  if (!res.ok) {
    logger.warn('canva_api_error', { status: res.status, path, code: body.code })
    throw new ApiError('PROVIDER_ERROR', `Canva je vratila grešku (${body.code ?? res.status}).`)
  }
  return { status: res.status, body }
}

export async function getMe(accessToken: string): Promise<{ userId: string; teamId: string | null }> {
  const { body } = await api<{ team_user?: { user_id: string; team_id?: string } }>(accessToken, '/users/me')
  if (!body.team_user?.user_id)
    throw new ApiError('PROVIDER_ERROR', 'Canva nije vratila podatke o korisniku.')
  return { userId: body.team_user.user_id, teamId: body.team_user.team_id ?? null }
}

/** Autofill postoji samo na planovima sa brand template-ima: 403 znači nema. */
export async function probeAutofill(accessToken: string): Promise<boolean> {
  try {
    const { status } = await api(accessToken, '/brand-templates?limit=1')
    return status !== 403
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pollJob<
  T extends { status: 'in_progress' | 'success' | 'failed'; error?: { code: string; message: string } },
>(accessToken: string, path: string, options: { intervalMs?: number; maxWaitMs?: number } = {}): Promise<T> {
  const started = Date.now()
  const interval = options.intervalMs ?? 1500
  for (;;) {
    const { body } = await api<{ job: T }>(accessToken, path)
    if (body.job.status === 'success') return body.job
    if (body.job.status === 'failed') {
      const code = body.job.error?.code ?? 'failed'
      const text =
        code === 'license_required' || code === 'approval_required'
          ? 'Canva traži plaćeni plan ili odobrenje za ovaj export.'
          : `Canva posao nije uspeo (${code}).`
      throw new ApiError('PROVIDER_ERROR', text)
    }
    if (Date.now() - started > (options.maxWaitMs ?? 120_000)) {
      throw new ApiError('PROVIDER_ERROR', 'Canva posao traje predugo. Pokušajte ponovo za minut.')
    }
    await sleep(interval)
  }
}

export async function uploadAsset(
  accessToken: string,
  input: { bytes: Buffer; name: string },
): Promise<string> {
  const name = input.name.slice(0, 50) || 'Sova'
  const { body } = await api<{ job: { id: string; status: string; asset?: { id: string } } }>(
    accessToken,
    '/asset-uploads',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'asset-upload-metadata': JSON.stringify({
          name_base64: Buffer.from(name, 'utf8').toString('base64'),
        }),
      },
      body: new Uint8Array(input.bytes),
    },
  )
  if (body.job.status === 'success' && body.job.asset?.id) return body.job.asset.id
  const job = await pollJob<{
    status: 'in_progress' | 'success' | 'failed'
    asset?: { id: string }
    error?: { code: string; message: string }
  }>(accessToken, `/asset-uploads/${body.job.id}`)
  if (!job.asset?.id) throw new ApiError('PROVIDER_ERROR', 'Canva nije vratila ID otpremljene slike.')
  return job.asset.id
}

export interface CanvaDesign {
  id: string
  title: string | null
  editUrl: string
  viewUrl: string
  thumbnailUrl: string | null
}

export async function createDesign(
  accessToken: string,
  input: { assetId?: string | null; title: string; width?: number; height?: number },
): Promise<CanvaDesign> {
  const payload: Record<string, unknown> = { title: input.title.slice(0, 255) }
  if (input.width && input.height)
    payload.design_type = { type: 'custom', width: input.width, height: input.height }
  if (input.assetId) payload.asset_id = input.assetId
  const { body } = await api<{
    design: {
      id: string
      title?: string
      urls: { edit_url: string; view_url: string }
      thumbnail?: { url: string }
    }
  }>(accessToken, '/designs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return {
    id: body.design.id,
    title: body.design.title ?? null,
    editUrl: body.design.urls.edit_url,
    viewUrl: body.design.urls.view_url,
    thumbnailUrl: body.design.thumbnail?.url ?? null,
  }
}

export async function exportDesign(
  accessToken: string,
  input: { designId: string; format: 'png' | 'jpg'; width?: number },
): Promise<string[]> {
  const format: Record<string, unknown> =
    input.format === 'jpg' ? { type: 'jpg', quality: 90 } : { type: 'png' }
  if (input.width) format.width = input.width
  const { body } = await api<{ job: { id: string; status: string; urls?: string[] } }>(
    accessToken,
    '/exports',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ design_id: input.designId, format }),
    },
  )
  if (body.job.status === 'success' && body.job.urls?.length) return body.job.urls
  const job = await pollJob<{
    status: 'in_progress' | 'success' | 'failed'
    urls?: string[]
    error?: { code: string; message: string }
  }>(accessToken, `/exports/${body.job.id}`)
  if (!job.urls?.length) throw new ApiError('PROVIDER_ERROR', 'Canva export nema fajlove.')
  return job.urls
}
