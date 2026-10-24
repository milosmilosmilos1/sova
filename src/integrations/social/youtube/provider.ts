import 'server-only'

import { readYouTubeOptions, SHORTS_MAX_MS, youtubeOptionProblems, youtubeTitle } from '@/config/youtube'
import { isProviderError, ProviderError } from '@/integrations/social/errors'
import {
  GoogleApiClient,
  googleAuthUrl,
  googleConfigured,
  googleExchangeCode,
  googleRefresh,
  googleRevoke,
  mapGoogleError,
  type GoogleErrorBody,
} from '@/integrations/social/google/client'
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
 * YouTube Shorts (docs/INTEGRATIONS.md 8, faza 8c, D-084): Google OAuth sa `youtube.upload` i
 * `youtube.readonly` (bez šire dozvole za brisanje, pa video briše korisnik u YouTube Studiju).
 * Kanal iz `channels.list?mine=true`; video kroz resumable upload, pa ručka `youtube_processing` dok
 * YouTube ne obradi video (`uploadStatus: processed`). Short je vertikalan ili kvadratan video do 3
 * minuta. Kvota: 100 uploada dnevno po Google projektu za sve korisnike (D-084).
 */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const
const UPLOAD_SCOPE = YOUTUBE_SCOPES[0]
const API = 'https://www.googleapis.com/youtube/v3'
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'

export interface YouTubeProviderOptions {
  fetchImpl?: typeof fetch
}

interface Channel {
  id: string
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> }
  statistics?: {
    subscriberCount?: string
    hiddenSubscriberCount?: boolean
    viewCount?: string
    videoCount?: string
  }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}

interface Video {
  id: string
  status?: { uploadStatus?: string; privacyStatus?: string; failureReason?: string; rejectionReason?: string }
  processingDetails?: { processingStatus?: string }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
}

interface PlaylistItem {
  snippet?: {
    title?: string
    description?: string
    publishedAt?: string
    thumbnails?: Record<string, { url?: string }>
    resourceId?: { videoId?: string }
  }
  contentDetails?: { videoId?: string; videoPublishedAt?: string }
}

export function shortsUrl(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`
}

const scopesOf = (account: AccountRef): string[] =>
  Array.isArray(account.metadata.scopes) ? (account.metadata.scopes as string[]) : []

const num = (v: string | undefined): number | null => (v === undefined ? null : Number(v))

const REJECTION_MESSAGE: Record<string, string> = {
  duplicate: 'YouTube je odbio video kao duplikat već postojećeg videa.',
  copyright: 'YouTube je odbio video zbog autorskih prava.',
  claim: 'YouTube je odbio video zbog prijave autorskih prava.',
  length: 'YouTube je odbio video zbog dužine.',
  inappropriate: 'YouTube je odbio video zbog neprikladnog sadržaja.',
  termsOfUse: 'YouTube je odbio video zbog uslova korišćenja.',
  uploaderAccountSuspended: 'YouTube kanal je suspendovan.',
}

export class YouTubeProvider implements SocialProvider {
  readonly platforms = ['youtube'] as const
  private readonly fetchImpl: typeof fetch

  constructor(options: YouTubeProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  static isConfigured(): boolean {
    return googleConfigured()
  }

  private client(accessToken: string): GoogleApiClient {
    return new GoogleApiClient(accessToken, this.fetchImpl, 'YouTube')
  }

  getAuthUrl(ctx: { state: string; redirectUri: string }): string {
    return googleAuthUrl(YOUTUBE_SCOPES, ctx)
  }

  exchangeCode(code: string, ctx: { redirectUri: string }) {
    return googleExchangeCode(code, ctx.redirectUri, this.fetchImpl)
  }

  refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    return googleRefresh(tokens, this.fetchImpl)
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const granted = tokens.scopes
    if (granted.length && !granted.includes(UPLOAD_SCOPE)) {
      throw new ProviderError('PERMISSION_LOST', {
        message: 'Google nije odobrio youtube.upload.',
        userMessage:
          'Pri povezivanju nije data dozvola za otpremanje videa na YouTube. Povežite ponovo i štiklirajte je.',
      })
    }
    let channels: Channel[]
    try {
      const res = await this.client(tokens.accessToken).get<{ items?: Channel[] }>(
        `${API}/channels?part=snippet,statistics,contentDetails&mine=true&maxResults=50`,
      )
      channels = res.items ?? []
    } catch (error) {
      // Google nalog bez YouTube kanala
      if (isProviderError(error) && JSON.stringify(error.raw ?? '').includes('youtubeSignupRequired'))
        return []
      throw error
    }
    return channels.map((c) => {
      const hidden = c.statistics?.hiddenSubscriberCount === true
      const followers = hidden ? null : num(c.statistics?.subscriberCount)
      const thumbs = c.snippet?.thumbnails ?? {}
      return {
        platform: 'youtube' as const,
        externalId: c.id,
        parentExternalId: null,
        name: c.snippet?.title ?? 'YouTube kanal',
        username: c.snippet?.customUrl ?? null,
        avatarUrl: thumbs.default?.url ?? thumbs.medium?.url ?? null,
        accountType: 'youtube_channel',
        token: tokens,
        capabilities: this.caps(!granted.length || granted.includes(UPLOAD_SCOPE)),
        metadata: {
          uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
          scopes: granted,
          ...(followers !== null ? { followers } : {}),
        },
      }
    })
  }

  private caps(publish: boolean): Capabilities {
    return {
      image: false,
      carousel: false,
      video: true,
      reels: true,
      stories: false,
      link: false,
      text: false,
      firstComment: false,
      aiLabel: true,
      publish,
    }
  }

  capabilities(account: AccountRef): Capabilities {
    const scopes = scopesOf(account)
    return this.caps(!scopes.length || scopes.includes(UPLOAD_SCOPE))
  }

  validatePost(input: NormalizedPost): ValidationResult {
    const problems: string[] = []
    const videos = input.media.filter((m) => m.mimeType.startsWith('video/'))
    if (input.media.some((m) => m.mimeType.startsWith('image/')))
      problems.push('YouTube prima samo video; uklonite fotografije za ovaj nalog.')
    if (videos.length !== 1) problems.push('YouTube Shorts objava traži tačno jedan video.')
    const v = videos[0]
    if (v?.durationMs && v.durationMs > SHORTS_MAX_MS)
      problems.push(`Short može trajati najviše 3 minuta (video traje ${Math.round(v.durationMs / 1000)} s).`)
    if (v?.width && v.height && v.width > v.height)
      problems.push('Short mora biti vertikalan ili kvadratan video (ovaj je položen).')
    const o = readYouTubeOptions(input.options)
    problems.push(...youtubeOptionProblems(o, youtubeTitle(o, input.title, input.text), input.text))
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
      throw new ProviderError('MEDIA_REJECTED', {
        message: `Skladište je vratilo ${res.status} za video.`,
        status: res.status,
      })
    return Buffer.from(await res.arrayBuffer())
  }

  /** Resumable upload: sesija sa metapodacima, pa bajtovi jednim PUT-om; obrada ide kroz ručku. */
  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const video = input.media.find((m) => m.mimeType.startsWith('video/'))
    if (!video) throw new ProviderError('MEDIA_REJECTED', { message: 'YouTube objava nema video.' })
    const o = readYouTubeOptions(input.options)
    const bytes = await this.download(video)
    const session = await this.client(accessToken).request<null>(
      'POST',
      `${UPLOAD}?uploadType=resumable&part=snippet,status`,
      {
        json: {
          snippet: {
            title: youtubeTitle(o, input.title, input.text),
            description: input.text,
            categoryId: '22',
            ...(input.language ? { defaultLanguage: input.language } : {}),
          },
          status: {
            privacyStatus: o.privacy,
            selfDeclaredMadeForKids: o.madeForKids === true,
            containsSyntheticMedia: input.isAiGenerated,
            embeddable: true,
          },
        },
        headers: { 'x-upload-content-length': String(bytes.length), 'x-upload-content-type': video.mimeType },
      },
    )
    const location = session.headers.get('location')
    if (!location) throw new ProviderError('UNKNOWN', { message: 'YouTube nije vratio adresu za upload.' })
    let res: Response
    try {
      res = await this.fetchImpl(location, {
        method: 'PUT',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': video.mimeType },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(300_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Upload videa na YouTube je prekinut.',
        raw: error,
        retryable: true,
      })
    }
    const body = (await res.json().catch(() => null)) as (Video & GoogleErrorBody) | null
    if (!res.ok || !body?.id) throw mapGoogleError(res.status, body, 'YouTube')
    return {
      externalId: null,
      permalink: null,
      pending: { kind: 'youtube_processing', videoId: body.id, accountExternalId: account.externalId },
    }
  }

  async getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus> {
    if (handle.kind !== 'youtube_processing')
      throw new ProviderError('NOT_SUPPORTED', { message: `YouTube ne obrađuje ručku ${handle.kind}.` })
    const res = await this.client(accessToken).get<{ items?: Video[] }>(
      `${API}/videos?part=status,processingDetails&id=${encodeURIComponent(handle.videoId)}`,
    )
    const v = res.items?.[0]
    if (!v)
      return { state: 'failed', message: 'YouTube ne nalazi video (obrisan ili odbijen).', retryable: false }
    const upload = v.status?.uploadStatus
    if (upload === 'processed') return { state: 'published', externalId: v.id, permalink: shortsUrl(v.id) }
    if (upload === 'rejected')
      return {
        state: 'failed',
        message: REJECTION_MESSAGE[v.status?.rejectionReason ?? ''] ?? 'YouTube je odbio video.',
        retryable: false,
      }
    if (
      upload === 'failed' ||
      upload === 'deleted' ||
      ['failed', 'terminated'].includes(v.processingDetails?.processingStatus ?? '')
    )
      return {
        state: 'failed',
        message:
          'YouTube nije mogao da obradi video (format, kodek ili oštećen fajl). Sačuvajte ga kao MP4 (H.264) pa pokušajte ponovo.',
        retryable: false,
      }
    return { state: 'pending' }
  }

  /** Posle pada: video sa istim naslovom među poslednjim otpremanjima kanala (do 2 h unazad). */
  async findExistingPost(
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
  ): Promise<string | null> {
    const playlist = account.metadata.uploadsPlaylistId
    if (typeof playlist !== 'string' || !playlist) return null
    const title = youtubeTitle(readYouTubeOptions(input.options), input.title, input.text)
    const res = await this.client(accessToken).get<{ items?: PlaylistItem[] }>(
      `${API}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlist)}&maxResults=10`,
    )
    const since = Date.now() - 2 * 3_600_000
    const hit = (res.items ?? []).find(
      (i) => i.snippet?.title === title && new Date(i.snippet?.publishedAt ?? 0).getTime() >= since,
    )
    return hit?.contentDetails?.videoId ?? hit?.snippet?.resourceId?.videoId ?? null
  }

  async deletePost(): Promise<void> {
    throw new ProviderError('NOT_SUPPORTED', {
      message: 'Brisanje YouTube videa traži širu dozvolu (youtube.force-ssl).',
      userMessage: 'Video obrišite u YouTube Studiju.',
    })
  }

  private async statistics(accessToken: string, ids: string[]): Promise<Map<string, Video['statistics']>> {
    const out = new Map<string, Video['statistics']>()
    if (!ids.length) return out
    const res = await this.client(accessToken).get<{ items?: Video[] }>(
      `${API}/videos?part=statistics&id=${ids.map(encodeURIComponent).join(',')}`,
    )
    for (const v of res.items ?? []) out.set(v.id, v.statistics)
    return out
  }

  async fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]> {
    const playlist = account.metadata.uploadsPlaylistId
    if (typeof playlist !== 'string' || !playlist) return []
    const res = await this.client(accessToken).get<{ items?: PlaylistItem[] }>(
      `${API}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlist)}&maxResults=${Math.min(Math.max(limit, 1), 50)}`,
    )
    const items = (res.items ?? []).slice(0, limit)
    const ids = items
      .map((i) => i.contentDetails?.videoId ?? i.snippet?.resourceId?.videoId ?? '')
      .filter(Boolean)
    const stats = await this.statistics(accessToken, ids)
    return items.flatMap((i) => {
      const id = i.contentDetails?.videoId ?? i.snippet?.resourceId?.videoId
      if (!id) return []
      const s = stats.get(id)
      const thumbs = i.snippet?.thumbnails ?? {}
      const thumb = thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url
      return [
        {
          externalId: id,
          postType: 'video',
          text: [i.snippet?.title, i.snippet?.description].filter(Boolean).join('\n\n') || null,
          media: thumb ? [{ url: thumb, type: 'video' }] : null,
          permalink: `https://www.youtube.com/watch?v=${id}`,
          publishedAt: i.contentDetails?.videoPublishedAt ?? i.snippet?.publishedAt ?? null,
          metrics: (s
            ? {
                views: Number(s.viewCount ?? 0),
                likes: Number(s.likeCount ?? 0),
                comments: Number(s.commentCount ?? 0),
              }
            : {}) as Record<string, number>,
        },
      ]
    })
  }

  async fetchPostMetrics(
    externalId: string,
    _account: AccountRef,
    accessToken: string,
  ): Promise<NormalizedMetrics> {
    const s = (await this.statistics(accessToken, [externalId])).get(externalId)
    if (!s)
      throw new ProviderError('UNKNOWN', { message: `YouTube video ${externalId} not found`, status: 404 })
    const views = Number(s.viewCount ?? 0)
    const likes = Number(s.likeCount ?? 0)
    const comments = Number(s.commentCount ?? 0)
    return {
      impressions: views,
      reach: null,
      likes,
      comments,
      shares: null,
      saves: null,
      clicks: null,
      engagement: likes + comments,
      videoViews: views,
      raw: s as unknown as Record<string, Json>,
    }
  }

  async fetchAccountMetrics(account: AccountRef, accessToken: string, date: string): Promise<AccountMetrics> {
    const res = await this.client(accessToken).get<{ items?: Channel[] }>(
      `${API}/channels?part=statistics&id=${encodeURIComponent(account.externalId)}`,
    )
    const s = res.items?.[0]?.statistics ?? {}
    return {
      date,
      followers: s.hiddenSubscriberCount ? null : num(s.subscriberCount),
      reach: null,
      impressions: null,
      engagement: null,
      profileViews: null,
      raw: s as unknown as Record<string, Json>,
    }
  }

  revoke(tokens: TokenSet): Promise<void> {
    return googleRevoke(tokens, this.fetchImpl)
  }
}
