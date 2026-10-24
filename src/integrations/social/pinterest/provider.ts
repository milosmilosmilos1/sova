import 'server-only'

import {
  PINTEREST_VIDEO_MAX_MS,
  PINTEREST_VIDEO_MIN_MS,
  pinterestOptionProblems,
  pinterestTitle,
  readPinterestOptions,
} from '@/config/pinterest'
import { validateText } from '@/config/platforms'
import { env } from '@/lib/env'
import { ProviderError, type ProviderErrorCode } from '@/integrations/social/errors'
import type {
  AccountMetrics,
  AccountRef,
  Capabilities,
  ExternalAccount,
  HistoricalPost,
  NormalizedMedia,
  NormalizedMetrics,
  NormalizedPost,
  PollHandle,
  PublishResult,
  PublishStatus,
  SocialProvider,
  TokenSet,
  ValidationResult,
} from '@/integrations/social/types'
import type { Json } from '@/types/database'

/**
 * Pinterest API v5 (docs/INTEGRATIONS.md 9, faza 8c, D-085): OAuth sa Basic autentikacijom aplikacije,
 * pristupni token 30 dana i „continuous” refresh token 60 dana (svako osvežavanje vraća nov). Pin sa
 * slikom (`image_url`), karusel 2–5 slika ili video (registracija medija, upload na S3, ručka dok
 * Pinterest ne obradi video). Pravila Pinterest-a: korisnik bira svaki pin (Autopilot ga ne objavljuje)
 * i podaci iz API-ja se ne čuvaju (bez uvoza istorije i metrika). Trial pristup ide kroz sandbox.
 */
export const PINTEREST_SCOPES = [
  'user_accounts:read',
  'boards:read',
  'boards:write',
  'pins:read',
  'pins:write',
] as const

export interface PinterestProviderOptions {
  fetchImpl?: typeof fetch
  sandbox?: boolean
}

export interface PinterestBoard {
  id: string
  name: string
  privacy: string | null
}

interface PinterestErrorBody {
  code?: number
  message?: string
  detail?: string
}

export function mapPinterestError(status: number, body: PinterestErrorBody | null): ProviderError {
  const message = [body?.message, body?.detail].filter(Boolean).join(' ') || `HTTP ${status}`
  const mk = (code: ProviderErrorCode, retryable?: boolean, userMessage?: string) =>
    new ProviderError(code, {
      message: `Pinterest ${status}${body?.code !== undefined ? ` code ${body.code}` : ''}: ${message}`,
      retryable,
      userMessage,
      raw: body ?? { status },
      status,
    })
  if (status === 401)
    return mk('TOKEN_INVALID', false, 'Pinterest veza je istekla ili je opozvana. Povežite nalog ponovo.')
  if (status === 429) return mk('RATE_LIMITED', true)
  if (status >= 500) return mk('PROVIDER_DOWN', true)
  if (status === 403) return mk('PERMISSION_LOST', false)
  if (status === 404 && /board/i.test(message))
    return mk(
      'CONTENT_REJECTED',
      false,
      'Pinterest tabla ne postoji ili joj nemate pristup. Izaberite drugu tablu.',
    )
  if (/image|video|media|cover/i.test(message)) return mk('MEDIA_REJECTED', false)
  if (status === 400 || status === 422) return mk('CONTENT_REJECTED', false)
  return mk('UNKNOWN', false)
}

export function pinUrl(id: string): string {
  return `https://www.pinterest.com/pin/${id}/`
}

interface PinBody {
  id: string
  title?: string
  description?: string
}

/** Pinterest prima JPEG i PNG; WebP ide kroz našu JPEG varijantu. */
function imageUrl(m: NormalizedMedia): string {
  return m.mimeType === 'image/jpeg' || m.mimeType === 'image/png' ? m.url : (m.publicUrl ?? m.url)
}

export class PinterestProvider implements SocialProvider {
  readonly platforms = ['pinterest'] as const
  private readonly fetchImpl: typeof fetch
  private readonly api: string

  constructor(options: PinterestProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.api =
      (options.sandbox ?? env.PINTEREST_SANDBOX)
        ? 'https://api-sandbox.pinterest.com/v5'
        : 'https://api.pinterest.com/v5'
  }

  static isConfigured(): boolean {
    return Boolean(env.PINTEREST_APP_ID && env.PINTEREST_APP_SECRET)
  }

  private async request<T>(
    accessToken: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    json?: unknown,
  ): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.api}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Pinterest API nije dostupan.',
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
    if (!res.ok) throw mapPinterestError(res.status, body as PinterestErrorBody | null)
    return body as T
  }

  getAuthUrl(ctx: { state: string; redirectUri: string }): string {
    const u = new URL('https://www.pinterest.com/oauth/')
    u.searchParams.set('client_id', env.PINTEREST_APP_ID ?? '')
    u.searchParams.set('redirect_uri', ctx.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', PINTEREST_SCOPES.join(','))
    u.searchParams.set('state', ctx.state)
    return u.toString()
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenSet> {
    const basic = Buffer.from(`${env.PINTEREST_APP_ID ?? ''}:${env.PINTEREST_APP_SECRET ?? ''}`).toString(
      'base64',
    )
    let res: Response
    try {
      res = await this.fetchImpl(`${this.api}/oauth/token`, {
        method: 'POST',
        headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Pinterest OAuth nije dostupan.',
        raw: error,
        retryable: true,
      })
    }
    const body = (await res.json().catch(() => null)) as
      | (PinterestErrorBody & {
          access_token?: string
          refresh_token?: string
          expires_in?: number
          refresh_token_expires_in?: number
          refresh_token_expires_at?: number
          scope?: string
        })
      | null
    if (!res.ok || !body?.access_token) {
      // pogrešan ili istekao refresh token Pinterest vraća kao 400/401
      if (params.grant_type === 'refresh_token' && res.status < 500)
        throw new ProviderError('TOKEN_INVALID', {
          message: `Pinterest refresh ${res.status}: ${body?.message ?? ''}`,
          userMessage: 'Pinterest veza je istekla. Povežite nalog ponovo.',
          raw: body,
          status: res.status,
        })
      throw mapPinterestError(res.status, body)
    }
    const now = Date.now()
    const refreshExp = body.refresh_token_expires_at
      ? new Date(body.refresh_token_expires_at * 1000).toISOString()
      : body.refresh_token_expires_in
        ? new Date(now + body.refresh_token_expires_in * 1000).toISOString()
        : null
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000).toISOString() : null,
      refreshExpiresAt: refreshExp,
      scopes: (body.scope ?? '').split(/[ ,]+/).filter(Boolean),
    }
  }

  private me(accessToken: string) {
    return this.request<{
      id?: string
      username?: string
      profile_image?: string
      follower_count?: number
      account_type?: string
      business_name?: string
    }>(accessToken, 'GET', '/user_account')
  }

  async exchangeCode(code: string, ctx: { redirectUri: string }) {
    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ctx.redirectUri,
    })
    const me = await this.me(tokens.accessToken)
    return {
      ...tokens,
      externalUserId: me.id ?? me.username ?? 'pinterest',
      externalUserName: me.username ?? null,
    }
  }

  /** Continuous refresh: svaki odgovor nosi nov refresh token sa novih 60 dana. */
  async refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken)
      throw new ProviderError('TOKEN_INVALID', {
        message: 'Pinterest veza nema refresh token.',
        userMessage: 'Pinterest veza je istekla. Povežite nalog ponovo.',
      })
    const fresh = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
    return {
      ...fresh,
      refreshToken: fresh.refreshToken ?? tokens.refreshToken,
      refreshExpiresAt: fresh.refreshExpiresAt ?? tokens.refreshExpiresAt,
      scopes: fresh.scopes.length ? fresh.scopes : tokens.scopes,
    }
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const me = await this.me(tokens.accessToken)
    if (!me.id && !me.username) return []
    const granted = tokens.scopes
    const canPost = !granted.length || (granted.includes('pins:write') && granted.includes('boards:write'))
    return [
      {
        platform: 'pinterest',
        externalId: me.id ?? me.username!,
        parentExternalId: null,
        name: me.business_name || me.username || 'Pinterest nalog',
        username: me.username ?? null,
        avatarUrl: me.profile_image ?? null,
        accountType: me.account_type === 'BUSINESS' ? 'pinterest_business' : 'pinterest_personal',
        token: tokens,
        capabilities: this.caps(canPost),
        metadata: {
          scopes: granted,
          sandbox: this.api.includes('sandbox'),
          ...(typeof me.follower_count === 'number' ? { followers: me.follower_count } : {}),
        },
      },
    ]
  }

  /** Table za izbor u editoru; čitaju se uživo, ne čuvaju (pravila Pinterest-a). */
  async listBoards(accessToken: string): Promise<PinterestBoard[]> {
    const out: PinterestBoard[] = []
    let bookmark: string | null = null
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({ page_size: '250' })
      if (bookmark) q.set('bookmark', bookmark)
      const res: {
        items?: Array<{ id: string; name?: string; privacy?: string }>
        bookmark?: string | null
      } = await this.request(accessToken, 'GET', `/boards?${q.toString()}`)
      for (const b of res.items ?? [])
        out.push({ id: b.id, name: b.name ?? b.id, privacy: b.privacy ?? null })
      bookmark = res.bookmark ?? null
      if (!bookmark) break
    }
    return out
  }

  private caps(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: true,
      video: true,
      reels: false,
      stories: false,
      link: true,
      text: false,
      firstComment: false,
      aiLabel: false,
      publish,
    }
  }

  capabilities(account: AccountRef): Capabilities {
    const scopes = Array.isArray(account.metadata.scopes) ? (account.metadata.scopes as string[]) : []
    return this.caps(!scopes.length || (scopes.includes('pins:write') && scopes.includes('boards:write')))
  }

  validatePost(input: NormalizedPost): ValidationResult {
    const problems = [...validateText('pinterest', input.text).problems]
    const images = input.media.filter((m) => m.mimeType.startsWith('image/'))
    const videos = input.media.filter((m) => m.mimeType.startsWith('video/'))
    if (!images.length && !videos.length) problems.push('Pin mora imati sliku ili video.')
    if (videos.length > 1) problems.push('Pin može imati samo jedan video.')
    if (videos.length && images.length > 1)
      problems.push('Uz video pin ide najviše jedna slika (naslovna slika videa).')
    if (!videos.length && images.length > 5) problems.push('Pinterest karusel ima najviše 5 slika.')
    const v = videos[0]
    if (v?.durationMs && (v.durationMs < PINTEREST_VIDEO_MIN_MS || v.durationMs > PINTEREST_VIDEO_MAX_MS))
      problems.push('Video pin traje od 4 sekunde do 15 minuta.')
    if (v?.width && v.height) {
      const ratio = v.width / v.height
      if (ratio < 0.5 - 0.01 || ratio > 1.91 + 0.01)
        problems.push('Odnos stranica videa mora biti između 1:2 i 1,91:1.')
    }
    problems.push(...pinterestOptionProblems(readPinterestOptions(input.options)))
    return { ok: problems.length === 0, problems }
  }

  private pinBase(input: NormalizedPost): Record<string, Json> {
    const o = readPinterestOptions(input.options)
    const alt = input.media.find((m) => m.alt)?.alt ?? null
    return {
      board_id: o.boardId,
      title: pinterestTitle(o, input.title, input.text),
      description: input.text.slice(0, 800),
      ...(input.link ? { link: input.link.slice(0, 2048) } : {}),
      ...(alt ? { alt_text: alt.slice(0, 500) } : {}),
    }
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const base = this.pinBase(input)
    const video = input.media.find((m) => m.mimeType.startsWith('video/'))
    const images = input.media.filter((m) => m.mimeType.startsWith('image/'))
    if (video) {
      const mediaId = await this.uploadVideo(video, accessToken)
      // naslovna slika: slika iz objave ako postoji, inače kadar iz videa
      const cover = images[0] ? { cover_image_url: imageUrl(images[0]) } : { cover_image_key_frame_time: 1 }
      return {
        externalId: null,
        permalink: null,
        pending: {
          kind: 'pinterest_media',
          mediaId,
          pin: { ...base, media_source: { source_type: 'video_id', media_id: mediaId, ...cover } },
          accountExternalId: account.externalId,
        },
      }
    }
    const media_source =
      images.length === 1
        ? { source_type: 'image_url', url: imageUrl(images[0]!) }
        : { source_type: 'multiple_image_urls', items: images.map((m) => ({ url: imageUrl(m) })) }
    const pin = await this.request<PinBody>(accessToken, 'POST', '/pins', { ...base, media_source })
    return { externalId: pin.id, permalink: pinUrl(pin.id), pending: null }
  }

  /** Registracija medija, pa multipart upload na S3 sa svim poljima koja Pinterest vrati (bez Bearer-a). */
  private async uploadVideo(video: NormalizedMedia, accessToken: string): Promise<string> {
    const reg = await this.request<{
      media_id?: string
      upload_url?: string
      upload_parameters?: Record<string, string>
    }>(accessToken, 'POST', '/media', { media_type: 'video' })
    if (!reg.media_id || !reg.upload_url)
      throw new ProviderError('UNKNOWN', { message: 'Pinterest nije vratio adresu za upload videa.' })
    let bytes: ArrayBuffer
    try {
      const src = await this.fetchImpl(video.url, { signal: AbortSignal.timeout(120_000) })
      if (!src.ok) throw new Error(`skladište ${src.status}`)
      bytes = await src.arrayBuffer()
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Video nije preuzet iz skladišta.',
        raw: error,
        retryable: true,
      })
    }
    const form = new FormData()
    for (const [k, v] of Object.entries(reg.upload_parameters ?? {})) form.set(k, v)
    form.set('file', new Blob([bytes], { type: video.mimeType }), 'video.mp4')
    let res: Response
    try {
      res = await this.fetchImpl(reg.upload_url, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(300_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Upload videa na Pinterest je prekinut.',
        raw: error,
        retryable: true,
      })
    }
    if (!res.ok)
      throw new ProviderError(res.status >= 500 ? 'PROVIDER_DOWN' : 'MEDIA_REJECTED', {
        message: `Pinterest upload ${res.status}`,
        status: res.status,
      })
    return reg.media_id
  }

  async getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus> {
    if (handle.kind !== 'pinterest_media')
      throw new ProviderError('NOT_SUPPORTED', { message: `Pinterest ne obrađuje ručku ${handle.kind}.` })
    const m = await this.request<{ status?: string }>(
      accessToken,
      'GET',
      `/media/${encodeURIComponent(handle.mediaId)}`,
    )
    if (m.status === 'failed')
      return {
        state: 'failed',
        message: 'Pinterest nije mogao da obradi video (format ili kodek).',
        retryable: false,
      }
    if (m.status !== 'succeeded') return { state: 'pending' }
    const pin = await this.request<PinBody>(accessToken, 'POST', '/pins', handle.pin)
    return { state: 'published', externalId: pin.id, permalink: pinUrl(pin.id) }
  }

  /** Posle pada: pin sa istim naslovom i opisom među poslednjim pinovima (čita se, ne čuva). */
  async findExistingPost(
    input: NormalizedPost,
    _account: AccountRef,
    accessToken: string,
  ): Promise<string | null> {
    const base = this.pinBase(input)
    const res = await this.request<{ items?: PinBody[] }>(accessToken, 'GET', '/pins?page_size=10')
    return (
      (res.items ?? []).find(
        (p) => (p.title ?? '') === base.title && (p.description ?? '') === base.description,
      )?.id ?? null
    )
  }

  async deletePost(externalId: string, accessToken: string): Promise<void> {
    await this.request(accessToken, 'DELETE', `/pins/${encodeURIComponent(externalId)}`)
  }

  /** Pravila Pinterest-a ne dozvoljavaju čuvanje podataka iz API-ja, pa nema uvoza istorije. */
  async fetchHistory(): Promise<HistoricalPost[]> {
    return []
  }

  async fetchPostMetrics(): Promise<NormalizedMetrics> {
    return {
      impressions: null,
      reach: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      clicks: null,
      engagement: null,
      raw: { unavailable: 'pinterest_storage_policy' },
    }
  }

  async fetchAccountMetrics(
    _account: AccountRef,
    _accessToken: string,
    date: string,
  ): Promise<AccountMetrics> {
    return {
      date,
      followers: null,
      reach: null,
      impressions: null,
      engagement: null,
      profileViews: null,
      raw: { unavailable: 'pinterest_storage_policy' },
    }
  }

  /** Pinterest opoziv radi samo za sistemske korisnike; veza se prekida brisanjem tokena kod nas. */
  async revoke(): Promise<void> {}
}
