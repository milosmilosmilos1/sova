import 'server-only'

import { validateText } from '@/config/platforms'
import { readTikTokOptions, tiktokOptionProblems, type TikTokPrivacy } from '@/config/tiktok'
import { env } from '@/lib/env'
import { ProviderError } from '@/integrations/social/errors'
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

import { mapTikTokError, planChunks, TikTokClient, type TikTokErrorBody } from './client'

/**
 * TikTok provider (docs/INTEGRATIONS.md 6, faza 8b): Login Kit za web (OAuth 2.0 bez PKCE-a, koji
 * je obavezan samo za mobilne i desktop aplikacije), Content Posting API Direct Post. Foto objave idu
 * samo kroz PULL_FROM_URL sa domena verifikovanog u TikTok portalu (naš javni URL medija, D-077);
 * video kroz FILE_UPLOAD u delovima. Pristupni token traje 24 h, refresh token 365 dana.
 */
export const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.publish',
  'video.list',
] as const

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const VIDEO_FIELDS =
  'id,title,video_description,create_time,cover_image_url,share_url,like_count,comment_count,share_count,view_count'

export interface CreatorInfo {
  nickname: string | null
  username: string | null
  avatarUrl: string | null
  privacyLevelOptions: TikTokPrivacy[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number | null
}

interface UserInfo {
  open_id: string
  union_id?: string
  display_name?: string
  username?: string
  avatar_url?: string
  follower_count?: number
  following_count?: number
  likes_count?: number
  video_count?: number
}

interface VideoObject {
  id: string
  title?: string
  video_description?: string
  create_time?: number
  cover_image_url?: string
  share_url?: string
  like_count?: number
  comment_count?: number
  share_count?: number
  view_count?: number
}

export interface TikTokProviderOptions {
  fetchImpl?: typeof fetch
}

/** Skraćivanje na najviše `max` UTF-16 jedinica bez cepanja surogat parova (TikTok broji „UTF-16 runes”). */
export function cutUtf16(text: string, max: number): string {
  if (text.length <= max) return text
  let out = ''
  for (const ch of text) {
    if (out.length + ch.length > max) break
    out += ch
  }
  return out
}

function firstLine(text: string): string {
  return (text.split('\n').find((l) => l.trim()) ?? '').trim()
}

export function tiktokPermalink(username: string | null, id: string, kind: 'photo' | 'video'): string | null {
  return username ? `https://www.tiktok.com/@${username}/${kind}/${id}` : null
}

export class TikTokProvider implements SocialProvider {
  readonly platforms = ['tiktok'] as const
  private readonly fetchImpl: typeof fetch

  constructor(options: TikTokProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  static isConfigured(): boolean {
    return Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET)
  }

  private client(accessToken: string): TikTokClient {
    return new TikTokClient(accessToken, { fetchImpl: this.fetchImpl })
  }

  getAuthUrl(ctx: { state: string; redirectUri: string }): string {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/')
    u.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY ?? '')
    u.searchParams.set('scope', TIKTOK_SCOPES.join(','))
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('redirect_uri', ctx.redirectUri)
    u.searchParams.set('state', ctx.state)
    return u.toString()
  }

  private async tokenRequest(path: 'token' | 'revoke', params: Record<string, string>) {
    let res: Response
    try {
      res = await this.fetchImpl(`https://open.tiktokapis.com/v2/oauth/${path}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: env.TIKTOK_CLIENT_KEY ?? '',
          client_secret: env.TIKTOK_CLIENT_SECRET ?? '',
          ...params,
        }).toString(),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'TikTok OAuth nije dostupan.',
        raw: error,
        retryable: true,
      })
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const oauthError = typeof body?.error === 'string' ? (body.error as string) : null
    const nestedError = body?.error && typeof body.error === 'object' ? (body.error as TikTokErrorBody) : null
    if (!res.ok || oauthError || (nestedError?.code && nestedError.code !== 'ok')) {
      throw mapTikTokError(
        res.status,
        nestedError ?? {
          code: oauthError ?? undefined,
          message: (body?.error_description as string) ?? undefined,
        },
      )
    }
    return body ?? {}
  }

  private toTokens(body: Record<string, unknown>, previous?: TokenSet): TokenSet {
    const now = Date.now()
    const expiresIn = Number(body.expires_in ?? 0)
    const refreshIn = Number(body.refresh_expires_in ?? 0)
    if (typeof body.access_token !== 'string')
      throw new ProviderError('UNKNOWN', { message: 'TikTok nije vratio token.' })
    return {
      accessToken: body.access_token,
      // TikTok pri osvežavanju može da vrati nov refresh token; tada važi samo novi
      refreshToken:
        typeof body.refresh_token === 'string' ? body.refresh_token : (previous?.refreshToken ?? null),
      expiresAt: expiresIn ? new Date(now + expiresIn * 1000).toISOString() : null,
      refreshExpiresAt: refreshIn
        ? new Date(now + refreshIn * 1000).toISOString()
        : (previous?.refreshExpiresAt ?? null),
      scopes: String(body.scope ?? '')
        .split(/[ ,]+/)
        .filter(Boolean),
    }
  }

  private async userInfo(accessToken: string, fields: string): Promise<UserInfo> {
    const data = await this.client(accessToken).call<{ user?: UserInfo }>('GET', '/v2/user/info/', {
      query: `fields=${fields}`,
    })
    if (!data.user?.open_id)
      throw new ProviderError('UNKNOWN', { message: 'TikTok nije vratio podatke naloga.' })
    return data.user
  }

  async exchangeCode(code: string, ctx: { redirectUri: string }) {
    const tokens = this.toTokens(
      await this.tokenRequest('token', {
        code,
        grant_type: 'authorization_code',
        redirect_uri: ctx.redirectUri,
      }),
    )
    const me = await this.userInfo(tokens.accessToken, 'open_id,display_name')
    return { ...tokens, externalUserId: me.open_id, externalUserName: me.display_name ?? null }
  }

  async refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken)
      throw new ProviderError('TOKEN_INVALID', { message: 'TikTok nalog nema refresh token.' })
    const fresh = this.toTokens(
      await this.tokenRequest('token', { grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
      tokens,
    )
    return { ...fresh, scopes: fresh.scopes.length ? fresh.scopes : tokens.scopes }
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const me = await this.userInfo(
      tokens.accessToken,
      'open_id,union_id,avatar_url,display_name,username,follower_count,likes_count,video_count',
    )
    return [
      {
        platform: 'tiktok',
        externalId: me.open_id,
        parentExternalId: null,
        name: me.display_name ?? me.username ?? 'TikTok nalog',
        username: me.username ?? null,
        avatarUrl: me.avatar_url ?? null,
        accountType: 'tiktok_account',
        token: tokens,
        capabilities: this.caps(!tokens.scopes.length || tokens.scopes.includes('video.publish')),
        metadata: {
          tiktokUserId: me.open_id,
          scopes: tokens.scopes,
          ...(me.username ? { username: me.username } : {}),
          ...(me.follower_count !== undefined ? { followers: me.follower_count } : {}),
          ...(me.video_count !== undefined ? { videoCount: me.video_count } : {}),
        },
      },
    ]
  }

  /** Obavezno pre svake objave (UX smernice): šta nalog sme i koje privatnosti nudi. */
  async creatorInfo(accessToken: string): Promise<CreatorInfo> {
    const d = await this.client(accessToken).call<{
      creator_avatar_url?: string
      creator_username?: string
      creator_nickname?: string
      privacy_level_options?: string[]
      comment_disabled?: boolean
      duet_disabled?: boolean
      stitch_disabled?: boolean
      max_video_post_duration_sec?: number
    }>('POST', '/v2/post/publish/creator_info/query/', { json: {} })
    return {
      nickname: d.creator_nickname ?? null,
      username: d.creator_username ?? null,
      avatarUrl: d.creator_avatar_url ?? null,
      privacyLevelOptions: (d.privacy_level_options ?? []) as TikTokPrivacy[],
      commentDisabled: d.comment_disabled === true,
      duetDisabled: d.duet_disabled === true,
      stitchDisabled: d.stitch_disabled === true,
      maxVideoPostDurationSec: d.max_video_post_duration_sec ?? null,
    }
  }

  private caps(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: true,
      video: true,
      reels: false,
      stories: false,
      link: false,
      text: false,
      firstComment: false,
      aiLabel: true,
      publish,
    }
  }

  capabilities(account: AccountRef): Capabilities {
    const scopes = Array.isArray(account.metadata.scopes) ? (account.metadata.scopes as string[]) : []
    return this.caps(!scopes.length || scopes.includes('video.publish'))
  }

  validatePost(input: NormalizedPost): ValidationResult {
    const problems = [...validateText('tiktok', input.text).problems]
    const videos = input.media.filter((m) => m.mimeType.startsWith('video/'))
    const images = input.media.filter((m) => m.mimeType.startsWith('image/'))
    if (!input.media.length) problems.push('TikTok objava traži fotografiju ili video.')
    if (videos.length && images.length) problems.push('TikTok objava je ili video ili fotografije, ne oba.')
    if (videos.length > 1) problems.push('TikTok objava može imati jedan video.')
    for (const v of videos) {
      if (!VIDEO_MIME.has(v.mimeType))
        problems.push(`TikTok prima MP4, MOV i WebM video (dobijeno ${v.mimeType}).`)
      if (v.sizeBytes && v.sizeBytes > 4 * 1024 ** 3) problems.push('Video je veći od 4 GB.')
    }
    if (images.length > 35) problems.push('TikTok foto objava može imati najviše 35 fotografija.')
    problems.push(...tiktokOptionProblems(readTikTokOptions(input.options?.tiktok)))
    return { ok: problems.length === 0, problems }
  }

  private async download(media: NormalizedMedia): Promise<Buffer> {
    let res: Response
    try {
      res = await this.fetchImpl(media.url, { signal: AbortSignal.timeout(120_000) })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Video nije preuzet iz skladišta.',
        raw: error,
        retryable: true,
      })
    }
    if (!res.ok)
      throw new ProviderError('MEDIA_REJECTED', { message: `Skladište je vratilo ${res.status} za video.` })
    return Buffer.from(await res.arrayBuffer())
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const opts = readTikTokOptions(input.options?.tiktok)
    const missing = tiktokOptionProblems(opts)
    if (missing.length)
      throw new ProviderError('CONTENT_REJECTED', { message: missing[0], userMessage: missing[0] })
    const info = await this.creatorInfo(accessToken)
    if (!opts.privacyLevel || !info.privacyLevelOptions.includes(opts.privacyLevel)) {
      throw mapTikTokError(400, {
        code: 'privacy_level_option_mismatch',
        message: `privacy ${opts.privacyLevel}`,
      })
    }
    const client = this.client(accessToken)
    const brand = { brand_content_toggle: opts.brandedContent, brand_organic_toggle: opts.brandOrganic }
    const video = input.media.find((m) => m.mimeType.startsWith('video/'))
    const username =
      info.username ?? (typeof account.metadata.username === 'string' ? account.metadata.username : null)

    if (video) {
      if (
        info.maxVideoPostDurationSec &&
        video.durationMs &&
        video.durationMs / 1000 > info.maxVideoPostDurationSec
      ) {
        throw new ProviderError('MEDIA_REJECTED', {
          message: `Video traje ${Math.round(video.durationMs / 1000)} s, nalog dozvoljava ${info.maxVideoPostDurationSec} s.`,
        })
      }
      const bytes = await this.download(video)
      const plan = planChunks(bytes.length)
      const init = await client.call<{ publish_id?: string; upload_url?: string }>(
        'POST',
        '/v2/post/publish/video/init/',
        {
          json: {
            post_info: {
              title: cutUtf16(input.text, 2200),
              privacy_level: opts.privacyLevel,
              disable_comment: !opts.allowComment || info.commentDisabled,
              disable_duet: !opts.allowDuet || info.duetDisabled,
              disable_stitch: !opts.allowStitch || info.stitchDisabled,
              ...brand,
              ...(input.isAiGenerated ? { is_aigc: true } : {}),
            },
            source_info: {
              source: 'FILE_UPLOAD',
              video_size: bytes.length,
              chunk_size: plan.chunkSize,
              total_chunk_count: plan.totalChunks,
            },
          },
        },
      )
      if (!init.publish_id || !init.upload_url)
        throw new ProviderError('UNKNOWN', { message: 'TikTok nije vratio adresu za upload.' })
      for (const r of plan.ranges) {
        let res: Response
        try {
          res = await this.fetchImpl(init.upload_url, {
            method: 'PUT',
            headers: {
              'content-type': video.mimeType,
              'content-length': String(r.end - r.start + 1),
              'content-range': `bytes ${r.start}-${r.end}/${bytes.length}`,
            },
            body: new Uint8Array(bytes.subarray(r.start, r.end + 1)),
            signal: AbortSignal.timeout(300_000),
          })
        } catch (error) {
          throw new ProviderError('PROVIDER_DOWN', {
            message: 'Upload videa na TikTok nije uspeo.',
            raw: error,
            retryable: true,
          })
        }
        if (res.status !== 201 && res.status !== 206)
          throw mapTikTokError(res.status, { code: 'upload_failed', message: `deo ${r.start}-${r.end}` })
      }
      return {
        externalId: null,
        permalink: null,
        pending: {
          kind: 'tiktok_publish',
          publishId: init.publish_id,
          accountExternalId: account.externalId,
          username,
          mediaType: 'video',
        },
      }
    }

    // fotografije: samo PULL_FROM_URL, sa domena verifikovanog u TikTok portalu
    const urls = input.media.map((m) => m.publicUrl ?? null)
    if (!urls.length || urls.some((u) => !u)) {
      throw new ProviderError('MEDIA_REJECTED', {
        message: 'TikTok foto objava traži javni URL medija (PUBLIC_MEDIA_BASE_URL).',
        userMessage:
          'TikTok fotografije još ne mogu da se pošalju: javna adresa medija nije podešena. Javite se podršci.',
      })
    }
    const init = await client.call<{ publish_id?: string }>('POST', '/v2/post/publish/content/init/', {
      json: {
        post_info: {
          title: cutUtf16(input.title?.trim() || firstLine(input.text), 90),
          description: cutUtf16(input.text, 4000),
          privacy_level: opts.privacyLevel,
          disable_comment: !opts.allowComment || info.commentDisabled,
          auto_add_music: true,
          ...brand,
        },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: urls },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
        ...(input.isAiGenerated ? { is_aigc: true } : {}),
      },
    })
    if (!init.publish_id) throw new ProviderError('UNKNOWN', { message: 'TikTok nije vratio publish_id.' })
    return {
      externalId: null,
      permalink: null,
      pending: {
        kind: 'tiktok_publish',
        publishId: init.publish_id,
        accountExternalId: account.externalId,
        username,
        mediaType: 'photo',
      },
    }
  }

  private async fetchStatus(publishId: string, accessToken: string) {
    return this.client(accessToken).call<{
      status?: string
      fail_reason?: string
      publicaly_available_post_id?: Array<string | number>
    }>('POST', '/v2/post/publish/status/fetch/', { json: { publish_id: publishId } })
  }

  async getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus> {
    if (handle.kind !== 'tiktok_publish')
      throw new ProviderError('NOT_SUPPORTED', { message: `TikTok ne obrađuje ručku ${handle.kind}.` })
    const s = await this.fetchStatus(handle.publishId, accessToken)
    if (s.status === 'PUBLISH_COMPLETE') {
      // ID stiže tek posle moderacije javnih objava (obično minut, nekad sati); do tada vodimo publish_id
      const id = s.publicaly_available_post_id?.[0]
      return id
        ? {
            state: 'published',
            externalId: String(id),
            permalink: tiktokPermalink(handle.username, String(id), handle.mediaType),
          }
        : { state: 'published', externalId: `publish:${handle.publishId}`, permalink: null }
    }
    if (s.status === 'FAILED') {
      const reason = s.fail_reason ?? 'nepoznat razlog'
      return {
        state: 'failed',
        message: `TikTok je odbio objavu (${reason}).`,
        retryable: reason === 'internal' || reason === 'video_pull_failed' || reason === 'photo_pull_failed',
      }
    }
    return { state: 'pending' }
  }

  async resolveExternalId(externalId: string, account: AccountRef, accessToken: string) {
    if (!externalId.startsWith('publish:')) return null
    const s = await this.fetchStatus(externalId.slice('publish:'.length), accessToken)
    const id = s.publicaly_available_post_id?.[0]
    if (!id) return null
    const username = typeof account.metadata.username === 'string' ? account.metadata.username : null
    return { externalId: String(id), permalink: tiktokPermalink(username, String(id), 'video') }
  }

  /** TikTok nema pretragu objava po tekstu; posle pada se oslanjamo na status publish_id-ja. */
  async findExistingPost(): Promise<string | null> {
    return null
  }

  async deletePost(): Promise<void> {
    throw new ProviderError('NOT_SUPPORTED', {
      message: 'TikTok API ne briše objave.',
      userMessage: 'TikTok objavu možete obrisati samo u TikTok aplikaciji.',
    })
  }

  async fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]> {
    const client = this.client(accessToken)
    const out: HistoricalPost[] = []
    let cursor: number | undefined
    while (out.length < limit) {
      const page = await client.call<{ videos?: VideoObject[]; cursor?: number; has_more?: boolean }>(
        'POST',
        '/v2/video/list/',
        { query: `fields=${VIDEO_FIELDS}`, json: { max_count: 20, ...(cursor ? { cursor } : {}) } },
      )
      for (const v of page.videos ?? []) {
        if (out.length >= limit) break
        out.push({
          externalId: v.id,
          postType: 'video',
          text: v.video_description ?? v.title ?? null,
          media: v.cover_image_url ? [{ url: v.cover_image_url, type: 'image' }] : null,
          permalink: v.share_url ?? null,
          publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
          metrics: {
            likes: v.like_count ?? 0,
            comments: v.comment_count ?? 0,
            shares: v.share_count ?? 0,
            views: v.view_count ?? 0,
          },
        })
      }
      if (!page.has_more || !page.cursor) break
      cursor = page.cursor
    }
    return out
  }

  async fetchPostMetrics(
    externalId: string,
    _account: AccountRef,
    accessToken: string,
  ): Promise<NormalizedMetrics> {
    const empty: NormalizedMetrics = {
      impressions: null,
      reach: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      clicks: null,
      engagement: null,
      raw: { unresolved: true },
    }
    if (externalId.startsWith('publish:')) return empty
    const data = await this.client(accessToken).call<{ videos?: VideoObject[] }>('POST', '/v2/video/query/', {
      query: `fields=${VIDEO_FIELDS}`,
      json: { filters: { video_ids: [externalId] } },
    })
    const v = data.videos?.[0]
    if (!v) return empty
    const likes = v.like_count ?? 0
    const comments = v.comment_count ?? 0
    const shares = v.share_count ?? 0
    return {
      impressions: v.view_count ?? null,
      reach: null,
      likes,
      comments,
      shares,
      saves: null,
      clicks: null,
      engagement: likes + comments + shares,
      raw: v as unknown as Record<string, Json>,
    }
  }

  async fetchAccountMetrics(
    _account: AccountRef,
    accessToken: string,
    date: string,
  ): Promise<AccountMetrics> {
    const me = await this.userInfo(accessToken, 'open_id,follower_count,likes_count,video_count')
    return {
      date,
      followers: me.follower_count ?? null,
      reach: null,
      impressions: null,
      engagement: null,
      profileViews: null,
      raw: {
        followers: me.follower_count ?? null,
        likes: me.likes_count ?? null,
        videos: me.video_count ?? null,
      },
    }
  }

  async revoke(tokens: TokenSet): Promise<void> {
    await this.tokenRequest('revoke', { token: tokens.accessToken })
  }
}
