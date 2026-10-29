import 'server-only'

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

export { createPkce } from '@/lib/crypto/pkce'

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
  if (res.status === 404)
    throw new ApiError(
      'NOT_FOUND',
      'Canva nije pronašla dizajn. Možda je obrisan ili vam više nije podeljen.',
    )
  if (!res.ok) {
    // bez query stringa: u njemu je pretraga korisnika
    logger.warn('canva_api_error', { status: res.status, path: path.split('?')[0], code: body.code })
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

/** Poruka za neuspeo Canva posao ili odbijen export (`license_required` znači Pro elemente u dizajnu). */
export function canvaJobFailureMessage(code: string | null | undefined): string {
  if (code === 'license_required')
    return 'Dizajn ima plaćene (Pro) elemente. Uklonite ih u Canvi ili ih kupite, pa uvezite ponovo.'
  if (code === 'approval_required') return 'Dizajn čeka odobrenje u Canvi. Kad ga odobre, uvezite ponovo.'
  return `Canva posao nije uspeo (${code ?? 'failed'}).`
}

async function pollJob<
  T extends { status: 'in_progress' | 'success' | 'failed'; error?: { code: string; message: string } },
>(accessToken: string, path: string, options: { intervalMs?: number; maxWaitMs?: number } = {}): Promise<T> {
  const started = Date.now()
  const interval = options.intervalMs ?? 1500
  for (;;) {
    const { body } = await api<{ job: T }>(accessToken, path)
    if (body.job.status === 'success') return body.job
    if (body.job.status === 'failed') {
      throw new ApiError('PROVIDER_ERROR', canvaJobFailureMessage(body.job.error?.code))
    }
    // Netlify prekida funkciju posle 60 s, pa poruka mora da stigne pre toga
    if (Date.now() - started > (options.maxWaitMs ?? 45_000)) {
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

export interface CanvaDesignSummary {
  id: string
  title: string | null
  /** sličica važi 15 minuta; njen odnos stranica je odnos prve strane dizajna */
  thumbnail: { url: string; width: number; height: number } | null
  pageCount: number | null
  updatedAt: string | null
}

interface RawDesign {
  id: string
  title?: string
  thumbnail?: { url: string; width: number; height: number }
  page_count?: number
  updated_at?: number
}

function toDesignSummary(d: RawDesign): CanvaDesignSummary {
  return {
    id: d.id,
    title: d.title?.trim() || null,
    thumbnail: d.thumbnail?.url
      ? { url: d.thumbnail.url, width: d.thumbnail.width, height: d.thumbnail.height }
      : null,
    pageCount: d.page_count ?? null,
    updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null,
  }
}

/** Dizajni korisnika i oni podeljeni sa njim; bez pretrage prvo poslednji menjani. */
export async function listDesigns(
  accessToken: string,
  input: { query?: string; continuation?: string; limit?: number } = {},
): Promise<{ items: CanvaDesignSummary[]; continuation: string | null }> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 24) })
  if (input.query) params.set('query', input.query.slice(0, 255))
  else params.set('sort_by', 'modified_descending')
  if (input.continuation) params.set('continuation', input.continuation)
  const { status, body } = await api<{ items?: RawDesign[]; continuation?: string }>(
    accessToken,
    `/designs?${params}`,
  )
  if (status === 403)
    throw new ApiError('FORBIDDEN', 'Canva nije dozvolila čitanje dizajna. Povežite Canvu ponovo.')
  return { items: (body.items ?? []).map(toDesignSummary), continuation: body.continuation ?? null }
}

export async function getDesign(accessToken: string, designId: string): Promise<CanvaDesignSummary> {
  const { status, body } = await api<{ design?: RawDesign }>(
    accessToken,
    `/designs/${encodeURIComponent(designId)}`,
  )
  if (status === 403 || !body.design)
    throw new ApiError('FORBIDDEN', 'Canva nije dozvolila pristup ovom dizajnu.')
  return toDesignSummary(body.design)
}

/** Ciljna rezolucija videa; izlaz uvek prati odnos stranica dizajna, bez sečenja i rotiranja. */
export type CanvaVideoQuality = `${'horizontal' | 'vertical'}_${'720p' | '1080p'}`

/**
 * Slike bez širine, u veličini dizajna: na besplatnom Canva planu export ne sme da uveća dizajn
 * fiksnih dimenzija više od 1,125 puta, pa bi 2048 px od dizajna od 1080 px pao.
 */
export type CanvaExportFormat =
  { type: 'png' } | { type: 'jpg' } | { type: 'mp4'; quality: CanvaVideoQuality }

export interface CanvaExportJob {
  id: string
  status: 'in_progress' | 'success' | 'failed'
  urls: string[]
  errorCode: string | null
}

interface RawExportJob {
  id: string
  status: 'in_progress' | 'success' | 'failed'
  urls?: string[]
  error?: { code: string; message: string }
}

function toExportJob(job: RawExportJob): CanvaExportJob {
  return { id: job.id, status: job.status, urls: job.urls ?? [], errorCode: job.error?.code ?? null }
}

/** Pokreće export bez čekanja; video prati pozadinski posao kroz `getExportJob`. */
export async function startExport(
  accessToken: string,
  input: { designId: string; format: CanvaExportFormat },
): Promise<CanvaExportJob> {
  const format = input.format.type === 'jpg' ? { type: 'jpg', quality: 90 } : input.format
  const { status, body } = await api<{ job?: RawExportJob; code?: string }>(accessToken, '/exports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ design_id: input.designId, format }),
  })
  if (status === 403 || !body.job) {
    throw new ApiError(
      'FORBIDDEN',
      body.code === 'license_required'
        ? canvaJobFailureMessage(body.code)
        : 'Canva nije dozvolila export ovog dizajna.',
    )
  }
  return toExportJob(body.job)
}

export async function getExportJob(accessToken: string, jobId: string): Promise<CanvaExportJob> {
  const { body } = await api<{ job: RawExportJob }>(accessToken, `/exports/${encodeURIComponent(jobId)}`)
  return toExportJob(body.job)
}

/** Slika: export i čekanje u istom zahtevu, jer PNG i JPG Canva završi za nekoliko sekundi. */
export async function exportDesign(
  accessToken: string,
  input: { designId: string; format: 'png' | 'jpg' },
): Promise<string[]> {
  const job = await startExport(accessToken, { designId: input.designId, format: { type: input.format } })
  if (job.status === 'success' && job.urls.length) return job.urls
  const done = await pollJob<RawExportJob>(accessToken, `/exports/${encodeURIComponent(job.id)}`)
  if (!done.urls?.length) throw new ApiError('PROVIDER_ERROR', 'Canva export nema fajlove.')
  return done.urls
}
