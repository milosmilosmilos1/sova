import 'server-only'

import sharp from 'sharp'

import { validateText } from '@/config/platforms'
import { env } from '@/lib/env'
import { findUrls } from '@/lib/x-text'
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
 * X API v2 (docs/INTEGRATIONS.md 7, faza 8d, D-086): OAuth 2.0 sa PKCE, poverljiv klijent (Basic),
 * pristupni token 2 h, refresh token jednokratan (svako osvežavanje vraća nov). Objava `POST /2/tweets`
 * sa do 4 slike ili jednim videom (mediji v2: slika jednim zahtevom, video u delovima pa obrada).
 * Pay-per-use: objava se naplaćuje u Sova tokenima u publisheru (1, a sa linkom 6, D-083); čitanja
 * se štede (metrike samo 24 h i 7 dana, istorija do 20 objava, bez dnevnih metrika naloga).
 */
export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'] as const
const API = 'https://api.x.com/2'
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const CHUNK_BYTES = 4 * 1024 * 1024
const HISTORY_MAX = 20

export interface XProviderOptions {
  fetchImpl?: typeof fetch
}

interface XErrorBody {
  title?: string
  detail?: string
  type?: string
  status?: number
  errors?: Array<{ message?: string; code?: number }>
  /** OAuth endpoint */
  error?: string
  error_description?: string
}

interface XUser {
  id: string
  name?: string
  username?: string
  profile_image_url?: string
  verified_type?: string
  public_metrics?: { followers_count?: number }
}

interface XPost {
  id: string
  text?: string
  created_at?: string
  public_metrics?: Record<string, number>
  non_public_metrics?: Record<string, number>
}

interface ProcessingInfo {
  state?: string
  check_after_secs?: number
  error?: { message?: string }
}

export function mapXError(status: number, body: XErrorBody | null): ProviderError {
  const detail =
    body?.detail ?? body?.error_description ?? body?.errors?.[0]?.message ?? body?.title ?? `HTTP ${status}`
  const type = body?.type ?? body?.error ?? ''
  const mk = (code: ProviderErrorCode, retryable?: boolean, userMessage?: string) =>
    new ProviderError(code, {
      message: `X ${status}${type ? ` ${type}` : ''}: ${detail}`,
      retryable,
      userMessage,
      raw: body ?? { status },
      status,
    })
  if (status === 401 || type === 'invalid_grant')
    return mk('TOKEN_INVALID', false, 'X veza je istekla ili je opozvana. Povežite nalog ponovo.')
  if (status === 402 || /credits-depleted/.test(type))
    return mk('QUOTA_EXCEEDED', false, 'X krediti Sove su potrošeni; objava je pomerena dok se ne dopune.')
  if (/usage-capped/.test(type)) return mk('QUOTA_EXCEEDED', false)
  if (status === 429) return mk('RATE_LIMITED', true)
  if (status >= 500 || type === 'temporarily_unavailable') return mk('PROVIDER_DOWN', true)
  if (/duplicate/i.test(detail)) return mk('DUPLICATE', false)
  if (status === 403)
    return mk(
      'PERMISSION_LOST',
      false,
      /not-authorized-for-resource/.test(type)
        ? 'X dozvoljava odgovor samo na sopstvene objave ili kad vas pomenu.'
        : undefined,
    )
  if (/media/i.test(detail)) return mk('MEDIA_REJECTED', false)
  if (status === 400 || status === 422) return mk('CONTENT_REJECTED', false)
  return mk('UNKNOWN', false)
}

/** Tekst objave na X-u: link objave ide na kraj teksta (X nema posebno polje za link). */
export function composeXText(input: Pick<NormalizedPost, 'text' | 'link'>): string {
  const text = input.text.trim()
  if (!input.link || text.includes(input.link)) return text
  return text ? `${text}\n\n${input.link}` : input.link
}

/** Poređenje bez linkova: X u odgovoru menja linkove u t.co. */
function withoutUrls(text: string): string {
  let out = text.normalize('NFC')
  for (const u of findUrls(out)) out = out.replace(u, '')
  return out.replace(/\s+/g, ' ').trim()
}

export function xPermalink(username: string | null, id: string): string {
  return username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/web/status/${id}`
}

export class XProvider implements SocialProvider {
  readonly platforms = ['x'] as const
  readonly usesPkce = true
  private readonly fetchImpl: typeof fetch

  constructor(options: XProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  static isConfigured(): boolean {
    return Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET)
  }

  private basic(): string {
    return `Basic ${Buffer.from(`${env.X_CLIENT_ID ?? ''}:${env.X_CLIENT_SECRET ?? ''}`).toString('base64')}`
  }

  private async request<T>(
    accessToken: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    init: { json?: unknown; form?: FormData; timeoutMs?: number } = {},
  ): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : init.form,
        signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'X API nije dostupan.',
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
    if (!res.ok) throw mapXError(res.status, body as XErrorBody | null)
    return body as T
  }

  getAuthUrl(ctx: { state: string; redirectUri: string; codeChallenge?: string }): string {
    if (!ctx.codeChallenge) throw new ProviderError('UNKNOWN', { message: 'X OAuth traži PKCE izazov.' })
    const u = new URL('https://x.com/i/oauth2/authorize')
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', env.X_CLIENT_ID ?? '')
    u.searchParams.set('redirect_uri', ctx.redirectUri)
    u.searchParams.set('scope', X_SCOPES.join(' '))
    u.searchParams.set('state', ctx.state)
    u.searchParams.set('code_challenge', ctx.codeChallenge)
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenSet> {
    let res: Response
    try {
      res = await this.fetchImpl(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { authorization: this.basic(), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'X OAuth nije dostupan.',
        raw: error,
        retryable: true,
      })
    }
    const body = (await res.json().catch(() => null)) as
      | (XErrorBody & { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string })
      | null
    if (!res.ok || !body?.access_token) throw mapXError(res.status, body)
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      refreshExpiresAt: null,
      scopes: (body.scope ?? '').split(/\s+/).filter(Boolean),
    }
  }

  private async me(accessToken: string): Promise<XUser> {
    const res = await this.request<{ data?: XUser }>(
      accessToken,
      'GET',
      '/users/me?user.fields=id,name,username,profile_image_url,public_metrics,verified_type',
    )
    if (!res.data?.id) throw new ProviderError('UNKNOWN', { message: 'X nije vratio korisnika.' })
    return res.data
  }

  async exchangeCode(code: string, ctx: { redirectUri: string; codeVerifier?: string }) {
    if (!ctx.codeVerifier) throw new ProviderError('UNKNOWN', { message: 'X OAuth traži PKCE verifier.' })
    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ctx.redirectUri,
      code_verifier: ctx.codeVerifier,
    })
    const me = await this.me(tokens.accessToken)
    return { ...tokens, externalUserId: me.id, externalUserName: me.username ?? me.name ?? null }
  }

  /** Refresh token je jednokratan: odgovor nosi nov, a stari više ne važi. */
  async refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken)
      throw new ProviderError('TOKEN_INVALID', {
        message: 'X veza nema refresh token.',
        userMessage: 'X veza je istekla. Povežite nalog ponovo.',
      })
    const fresh = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
    return {
      ...fresh,
      refreshToken: fresh.refreshToken ?? tokens.refreshToken,
      scopes: fresh.scopes.length ? fresh.scopes : tokens.scopes,
    }
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const me = await this.me(tokens.accessToken)
    const granted = tokens.scopes
    const followers = me.public_metrics?.followers_count
    return [
      {
        platform: 'x',
        externalId: me.id,
        parentExternalId: null,
        name: me.name ?? me.username ?? 'X nalog',
        username: me.username ?? null,
        avatarUrl: me.profile_image_url ?? null,
        accountType: 'x_user',
        token: tokens,
        capabilities: this.caps(
          !granted.length || (granted.includes('tweet.write') && granted.includes('media.write')),
        ),
        metadata: {
          username: me.username ?? null,
          verifiedType: me.verified_type ?? null,
          scopes: granted,
          ...(typeof followers === 'number' ? { followers } : {}),
        },
      },
    ]
  }

  private caps(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: true,
      video: true,
      reels: false,
      stories: false,
      link: true,
      text: true,
      firstComment: false,
      aiLabel: false,
      publish,
    }
  }

  capabilities(account: AccountRef): Capabilities {
    const scopes = Array.isArray(account.metadata.scopes) ? (account.metadata.scopes as string[]) : []
    return this.caps(!scopes.length || (scopes.includes('tweet.write') && scopes.includes('media.write')))
  }

  validatePost(input: NormalizedPost): ValidationResult {
    const text = composeXText(input)
    const problems = [...validateText('x', text).problems]
    const images = input.media.filter((m) => m.mimeType.startsWith('image/'))
    const videos = input.media.filter((m) => m.mimeType.startsWith('video/'))
    if (!text && !input.media.length) problems.push('Objava nema ni tekst ni medij.')
    if (images.length > 4) problems.push('X dozvoljava najviše 4 slike u objavi.')
    if (videos.length > 1) problems.push('X dozvoljava jedan video u objavi.')
    if (videos.length && images.length) problems.push('X ne meša slike i video u istoj objavi.')
    const v = videos[0]
    if (v?.width && v.height) {
      const ratio = v.width / v.height
      if (ratio < 1 / 3 - 0.01 || ratio > 3 + 0.01)
        problems.push('Odnos stranica videa za X mora biti između 1:3 i 3:1.')
    }
    if (v?.durationMs && v.durationMs > 20 * 60_000)
      problems.push('Video na X-u može trajati najviše 20 minuta.')
    return { ok: problems.length === 0, problems }
  }

  private async download(media: NormalizedMedia): Promise<Buffer> {
    let res: Response
    try {
      res = await this.fetchImpl(media.url, { signal: AbortSignal.timeout(120_000) })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Medij nije preuzet iz skladišta.',
        raw: error,
        retryable: true,
      })
    }
    if (!res.ok)
      throw new ProviderError('MEDIA_REJECTED', {
        message: `Skladište je vratilo ${res.status}.`,
        status: res.status,
      })
    return Buffer.from(await res.arrayBuffer())
  }

  /** Slika jednim zahtevom; veća od 5 MB se smanjuje u JPEG (X ne prima veće slike). */
  private async uploadImage(media: NormalizedMedia, accessToken: string): Promise<string> {
    let bytes = await this.download(media)
    let type = media.mimeType
    if (bytes.length > IMAGE_MAX_BYTES) {
      bytes = await sharp(bytes)
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
      type = 'image/jpeg'
    }
    const form = new FormData()
    form.set('media', new Blob([new Uint8Array(bytes)], { type }), 'slika')
    form.set('media_category', 'tweet_image')
    const res = await this.request<{ data?: { id?: string } }>(accessToken, 'POST', '/media/upload', {
      form,
      timeoutMs: 60_000,
    })
    if (!res.data?.id) throw new ProviderError('UNKNOWN', { message: 'X nije vratio ID slike.' })
    if (media.alt) {
      await this.request(accessToken, 'POST', '/media/metadata', {
        json: { id: res.data.id, metadata: { alt_text: { text: media.alt.slice(0, 1000) } } },
      })
    }
    return res.data.id
  }

  /** Video u delovima (initialize, append, finalize); vraća ID i da li X još obrađuje video. */
  private async uploadVideo(
    media: NormalizedMedia,
    accessToken: string,
  ): Promise<{ id: string; processing: boolean }> {
    const bytes = await this.download(media)
    const init = await this.request<{ data?: { id?: string } }>(
      accessToken,
      'POST',
      '/media/upload/initialize',
      {
        json: { media_type: media.mimeType, total_bytes: bytes.length, media_category: 'tweet_video' },
      },
    )
    const id = init.data?.id
    if (!id) throw new ProviderError('UNKNOWN', { message: 'X nije vratio ID videa.' })
    for (let i = 0, part = 0; i < bytes.length; i += CHUNK_BYTES, part++) {
      const form = new FormData()
      form.set('segment_index', String(part))
      form.set(
        'media',
        new Blob([new Uint8Array(bytes.subarray(i, i + CHUNK_BYTES))], { type: 'application/octet-stream' }),
      )
      await this.request(accessToken, 'POST', `/media/upload/${encodeURIComponent(id)}/append`, {
        form,
        timeoutMs: 120_000,
      })
    }
    const fin = await this.request<{ data?: { processing_info?: ProcessingInfo } }>(
      accessToken,
      'POST',
      `/media/upload/${encodeURIComponent(id)}/finalize`,
    )
    const state = fin.data?.processing_info?.state
    if (state === 'failed')
      throw new ProviderError('MEDIA_REJECTED', { message: 'X je odbio video pri obradi.' })
    return { id, processing: Boolean(state && state !== 'succeeded') }
  }

  private async createPost(accessToken: string, text: string, mediaIds: string[]): Promise<string> {
    const res = await this.request<{ data?: { id?: string } }>(accessToken, 'POST', '/tweets', {
      json: { ...(text ? { text } : {}), ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
    })
    if (!res.data?.id) throw new ProviderError('UNKNOWN', { message: 'X nije vratio ID objave.' })
    return res.data.id
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const text = composeXText(input)
    const username = typeof account.metadata.username === 'string' ? account.metadata.username : null
    const video = input.media.find((m) => m.mimeType.startsWith('video/'))
    if (video) {
      const v = await this.uploadVideo(video, accessToken)
      if (v.processing)
        return {
          externalId: null,
          permalink: null,
          pending: { kind: 'x_media', mediaId: v.id, text, accountExternalId: account.externalId, username },
        }
      const id = await this.createPost(accessToken, text, [v.id])
      return { externalId: id, permalink: xPermalink(username, id), pending: null }
    }
    const mediaIds: string[] = []
    for (const m of input.media.filter((x) => x.mimeType.startsWith('image/')).slice(0, 4))
      mediaIds.push(await this.uploadImage(m, accessToken))
    const id = await this.createPost(accessToken, text, mediaIds)
    return { externalId: id, permalink: xPermalink(username, id), pending: null }
  }

  async getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus> {
    if (handle.kind !== 'x_media')
      throw new ProviderError('NOT_SUPPORTED', { message: `X ne obrađuje ručku ${handle.kind}.` })
    const res = await this.request<{ data?: { processing_info?: ProcessingInfo } }>(
      accessToken,
      'GET',
      `/media/upload?command=STATUS&media_id=${encodeURIComponent(handle.mediaId)}`,
    )
    const info = res.data?.processing_info
    if (info?.state === 'failed')
      return {
        state: 'failed',
        message: info.error?.message
          ? `X nije obradio video: ${info.error.message}`
          : 'X nije obradio video (format ili kodek).',
        retryable: false,
      }
    if (info && info.state !== 'succeeded') return { state: 'pending' }
    const id = await this.createPost(accessToken, handle.text, [handle.mediaId])
    return { state: 'published', externalId: id, permalink: xPermalink(handle.username, id) }
  }

  /** Posle pada: poslednjih 5 objava naloga (svako čitanje se plaća), poređenje bez linkova. */
  async findExistingPost(
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
  ): Promise<string | null> {
    const want = withoutUrls(composeXText(input))
    if (!want) return null
    const res = await this.request<{ data?: XPost[] }>(
      accessToken,
      'GET',
      `/users/${encodeURIComponent(account.externalId)}/tweets?max_results=5&tweet.fields=text,created_at`,
    )
    return (res.data ?? []).find((p) => withoutUrls(p.text ?? '') === want)?.id ?? null
  }

  async deletePost(externalId: string, accessToken: string): Promise<void> {
    await this.request(accessToken, 'DELETE', `/tweets/${encodeURIComponent(externalId)}`)
  }

  async fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]> {
    const max = Math.min(Math.max(limit, 5), HISTORY_MAX)
    const res = await this.request<{ data?: XPost[] }>(
      accessToken,
      'GET',
      `/users/${encodeURIComponent(account.externalId)}/tweets?max_results=${max}&exclude=replies,retweets&tweet.fields=created_at,public_metrics`,
    )
    const username = typeof account.metadata.username === 'string' ? account.metadata.username : null
    return (res.data ?? []).slice(0, limit).map((p) => {
      const m = p.public_metrics ?? {}
      return {
        externalId: p.id,
        postType: 'post',
        text: p.text ?? null,
        media: null,
        permalink: xPermalink(username, p.id),
        publishedAt: p.created_at ?? null,
        metrics: {
          likes: m.like_count ?? 0,
          comments: m.reply_count ?? 0,
          shares: (m.retweet_count ?? m.repost_count ?? 0) + (m.quote_count ?? 0),
          impressions: m.impression_count ?? 0,
        },
      }
    })
  }

  async fetchPostMetrics(
    externalId: string,
    _account: AccountRef,
    accessToken: string,
  ): Promise<NormalizedMetrics> {
    const res = await this.request<{ data?: XPost[] }>(
      accessToken,
      'GET',
      `/tweets?ids=${encodeURIComponent(externalId)}&tweet.fields=public_metrics,non_public_metrics`,
    )
    const p = res.data?.[0]
    if (!p) throw new ProviderError('UNKNOWN', { message: `X objava ${externalId} not found`, status: 404 })
    const m = p.public_metrics ?? {}
    const np = p.non_public_metrics ?? {}
    const likes = m.like_count ?? 0
    const comments = m.reply_count ?? 0
    const shares = (m.retweet_count ?? m.repost_count ?? 0) + (m.quote_count ?? 0)
    const saves = m.bookmark_count ?? null
    const clicks = np.url_link_clicks ?? null
    return {
      impressions: m.impression_count ?? null,
      reach: null,
      likes,
      comments,
      shares,
      saves,
      clicks,
      engagement: np.engagements ?? likes + comments + shares + (saves ?? 0),
      raw: { public: m, nonPublic: np } as unknown as Record<string, Json>,
    }
  }

  async fetchAccountMetrics(
    _account: AccountRef,
    accessToken: string,
    date: string,
  ): Promise<AccountMetrics> {
    const me = await this.me(accessToken)
    const followers = me.public_metrics?.followers_count ?? null
    return {
      date,
      followers,
      reach: null,
      impressions: null,
      engagement: null,
      profileViews: null,
      raw: { followers },
    }
  }

  async revoke(tokens: TokenSet): Promise<void> {
    const token = tokens.refreshToken ?? tokens.accessToken
    if (!token) return
    await this.fetchImpl(`${API}/oauth2/revoke`, {
      method: 'POST',
      headers: { authorization: this.basic(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        token_type_hint: tokens.refreshToken ? 'refresh_token' : 'access_token',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  }
}
