import type { SocialPlatform } from '@/config/platforms'
import type { Json } from '@/types/database'

/**
 * Zajednički ugovor za mreže (docs/INTEGRATIONS.md 1): Meta (Facebook + Instagram, faza 8a), LinkedIn i
 * TikTok (faza 8b), Google Business Profile, YouTube i Pinterest (8c), X (8d). Objavljivanje koristi
 * publisher iz faze 9b.
 */
export interface TokenSet {
  accessToken: string
  /** za Metu: dugotrajan korisnički token (osnova za osvežavanje Page tokena) */
  refreshToken: string | null
  expiresAt: string | null
  refreshExpiresAt: string | null
  scopes: string[]
}

export interface Capabilities {
  image: boolean
  carousel: boolean
  video: boolean
  reels: boolean
  stories: boolean
  link: boolean
  text: boolean
  firstComment: boolean
  aiLabel: boolean
  /** API objavljivanje dozvoljeno (zadaci na stranici, audit, review) */
  publish: boolean
}

export interface ExternalAccount {
  platform: SocialPlatform
  externalId: string
  parentExternalId: string | null
  name: string
  username: string | null
  avatarUrl: string | null
  accountType: string
  token: TokenSet
  capabilities: Capabilities
  metadata: Record<string, Json>
}

export interface NormalizedMedia {
  /** potpisan URL skladišta (24 h), za mreže kojima šaljemo bajtove ili URL bez provere domena */
  url: string
  mimeType: string
  width: number | null
  height: number | null
  alt: string | null
  assetId?: string | null
  /** URL na našem domenu (TikTok PULL_FROM_URL traži verifikovan domen); null kad nije podešen */
  publicUrl?: string | null
  sizeBytes?: number | null
  durationMs?: number | null
}

export interface NormalizedPost {
  text: string
  link: string | null
  media: NormalizedMedia[]
  firstComment: string | null
  isAiGenerated: boolean
  /** ključ idempotentnosti objave (target id + verzija) */
  clientKey: string
  /** naslov objave (TikTok foto naslov, LinkedIn članak) */
  title?: string | null
  /** podešavanja targeta po mreži (`post_targets.options`, npr. `tiktok`) */
  options?: Record<string, Json>
  /** jezik sadržaja brenda (`sr`, `en`): Google poslovni profil `languageCode`, YouTube `defaultLanguage` */
  language?: string | null
}

export interface ValidationResult {
  ok: boolean
  problems: string[]
}

export type PollHandle =
  | { kind: 'ig_container'; containerId: string; accountExternalId: string }
  | {
      kind: 'tiktok_publish'
      publishId: string
      accountExternalId: string
      username: string | null
      mediaType: 'photo' | 'video'
    }
  /** YouTube obrađuje video posle uploada; objava je gotova kad je `processed` */
  | { kind: 'youtube_processing'; videoId: string; accountExternalId: string }
  /** Pinterest video: posle obrade medija pravi se pin sa sačuvanim telom */
  | { kind: 'pinterest_media'; mediaId: string; pin: Record<string, Json>; accountExternalId: string }
  /** LinkedIn video: objava ide tek kad je video AVAILABLE */
  | {
      kind: 'linkedin_video'
      videoUrn: string
      post: Record<string, Json>
      firstComment: string | null
      accountExternalId: string
    }
  /** X video: posle obrade medija objavljuje se tekst sa medijem */
  | {
      kind: 'x_media'
      mediaId: string
      text: string
      accountExternalId: string
      username: string | null
    }

/** Oznaka ručke za logove i poruke. */
export function pollHandleId(handle: PollHandle): string {
  switch (handle.kind) {
    case 'ig_container':
      return handle.containerId
    case 'tiktok_publish':
      return handle.publishId
    case 'youtube_processing':
      return handle.videoId
    case 'linkedin_video':
      return handle.videoUrn
    case 'pinterest_media':
    case 'x_media':
      return handle.mediaId
  }
}

export interface PublishResult {
  externalId: string | null
  permalink: string | null
  pending: PollHandle | null
}

export type PublishStatus =
  | { state: 'pending' }
  | { state: 'published'; externalId: string; permalink: string | null }
  | { state: 'failed'; message: string; retryable: boolean }

export interface HistoricalPost {
  externalId: string
  postType: string | null
  text: string | null
  media: Array<{ url: string; type: string }> | null
  permalink: string | null
  publishedAt: string | null
  metrics: Record<string, number>
}

export interface NormalizedMetrics {
  impressions: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  clicks: number | null
  engagement: number | null
  /** pregledi videa (YouTube, TikTok) */
  videoViews?: number | null
  raw: Record<string, Json>
}

export interface AccountMetrics {
  date: string
  followers: number | null
  reach: number | null
  impressions: number | null
  engagement: number | null
  profileViews: number | null
  /** klikovi na sajt (Google poslovni profil) */
  websiteClicks?: number | null
  raw: Record<string, Json>
}

/** Minimum koji provider zna o sačuvanom nalogu (bez tokena u čistom obliku). */
export interface AccountRef {
  id: string
  platform: SocialPlatform
  externalId: string
  parentExternalId: string | null
  accountType: string
  metadata: Record<string, Json>
}

export interface SocialProvider {
  readonly platforms: readonly SocialPlatform[]
  /** OAuth uz PKCE (X ga traži): tok čuva šifrovan `code_verifier` u `oauth_states` */
  readonly usesPkce?: boolean
  getAuthUrl(ctx: { state: string; redirectUri: string; codeChallenge?: string }): string
  exchangeCode(
    code: string,
    ctx: { redirectUri: string; codeVerifier?: string },
  ): Promise<TokenSet & { externalUserId: string; externalUserName: string | null }>
  refreshUserToken(tokens: TokenSet): Promise<TokenSet>
  listAccounts(tokens: TokenSet): Promise<ExternalAccount[]>
  validatePost(input: NormalizedPost, account: AccountRef): ValidationResult
  publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult>
  getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus>
  findExistingPost(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<string | null>
  deletePost(externalId: string, accessToken: string): Promise<void>
  fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]>
  fetchPostMetrics(externalId: string, account: AccountRef, accessToken: string): Promise<NormalizedMetrics>
  fetchAccountMetrics(account: AccountRef, accessToken: string, date: string): Promise<AccountMetrics>
  revoke(tokens: TokenSet, externalUserId: string | null): Promise<void>
  capabilities(account: AccountRef): Capabilities
  /**
   * Konačan ID i link objave kad ga mreža da tek kasnije (TikTok posle moderacije); `null` dok ga nema.
   */
  resolveExternalId?(
    externalId: string,
    account: AccountRef,
    accessToken: string,
  ): Promise<{ externalId: string; permalink: string | null } | null>
}
