import 'server-only'

import sharp from 'sharp'

import { validateText } from '@/config/platforms'
import { env } from '@/lib/env'
import { fetchLinkPreview, type LinkPreview } from '@/lib/link-preview'
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

import { encUrn, LinkedInClient, mapLinkedInError, type LinkedInErrorBody } from './client'
import { toLittleText } from './little'

/**
 * LinkedIn provider (docs/INTEGRATIONS.md 5, faza 8b): lični profil kroz self-serve proizvode
 * „Share on LinkedIn” + „Sign In with LinkedIn using OpenID Connect”, stranice firmi kroz Community
 * Management API kad ga LinkedIn odobri (`LINKEDIN_PAGES=true`). Posts API `/rest/posts`, slike kroz
 * Images API, commentary u `little` formatu. Token traje 60 dana; refresh samo za partnere sa
 * programskim refresh-om, ostali se povezuju ponovo pre isteka (D-076).
 */
export const LINKEDIN_BASE_SCOPES = ['openid', 'profile', 'email', 'w_member_social'] as const
export const LINKEDIN_PAGE_SCOPES = [
  'rw_organization_admin',
  'w_organization_social',
  'r_organization_social',
] as const
export const LINKEDIN_ANALYTICS_SCOPE = 'r_member_postAnalytics'

const POSTING_ROLES = new Set(['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER'])
const UPLOAD_MIME = new Set(['image/jpeg', 'image/png', 'image/gif'])
const MAX_PIXELS = 36_152_320

export interface LinkedInProviderOptions {
  fetchImpl?: typeof fetch
  linkPreview?: (url: string) => Promise<LinkPreview>
  pages?: boolean
  memberAnalytics?: boolean
}

interface UserInfo {
  sub: string
  name?: string
  picture?: string
  email?: string
}

interface PostElement {
  id: string
  commentary?: string
  publishedAt?: number
  createdAt?: number
  content?: Record<string, unknown>
}

interface ShareStatistics {
  impressionCount?: number
  uniqueImpressionsCount?: number
  clickCount?: number
  likeCount?: number
  commentCount?: number
  shareCount?: number
}

const scopesOf = (account: AccountRef): string[] =>
  Array.isArray(account.metadata.scopes) ? (account.metadata.scopes as string[]) : []

const isOrg = (account: AccountRef) => account.accountType === 'linkedin_organization'

export function authorUrn(account: AccountRef): string {
  return isOrg(account) ? `urn:li:organization:${account.externalId}` : `urn:li:person:${account.externalId}`
}

/** Commentary iz API-ja nazad u običan tekst (hashtag šablon i escape znakovi). */
export function plainCommentary(s: string): string {
  return s.replace(/\{hashtag\|\\?[#＃]\|([^}]+)\}/g, '#$1').replace(/\\(.)/g, '$1')
}

function permalinkFor(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`
}

function postKind(content: Record<string, unknown> | undefined): string {
  if (!content) return 'text'
  if ('multiImage' in content) return 'multi_image'
  if ('article' in content) return 'article'
  if ('media' in content) return 'media'
  return Object.keys(content)[0] ?? 'text'
}

/** Rest.li parametar za statistiku: `shares=List(...)` ili `ugcPosts=List(...)` po tipu URN-a. */
function statsParam(urns: string[]): string {
  const shares = urns.filter((u) => u.startsWith('urn:li:share:'))
  const ugc = urns.filter((u) => u.startsWith('urn:li:ugcPost:'))
  const parts: string[] = []
  if (shares.length) parts.push(`shares=List(${shares.map(encUrn).join(',')})`)
  if (ugc.length) parts.push(`ugcPosts=List(${ugc.map(encUrn).join(',')})`)
  return parts.join('&')
}

export class LinkedInProvider implements SocialProvider {
  readonly platforms = ['linkedin'] as const
  private readonly fetchImpl: typeof fetch
  private readonly linkPreview: (url: string) => Promise<LinkPreview>
  private readonly pages: boolean
  private readonly memberAnalytics: boolean

  constructor(options: LinkedInProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.linkPreview = options.linkPreview ?? ((url) => fetchLinkPreview(url))
    this.pages = options.pages ?? env.LINKEDIN_PAGES
    this.memberAnalytics = options.memberAnalytics ?? env.LINKEDIN_MEMBER_ANALYTICS
  }

  static isConfigured(): boolean {
    return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET)
  }

  private client(accessToken: string): LinkedInClient {
    return new LinkedInClient(accessToken, { version: env.LINKEDIN_API_VERSION, fetchImpl: this.fetchImpl })
  }

  /** Uvek isti skup: drugačiji skup od već odobrenog poništava ranije tokene korisnika. */
  scopes(): string[] {
    return [
      ...LINKEDIN_BASE_SCOPES,
      ...(this.pages ? LINKEDIN_PAGE_SCOPES : []),
      ...(this.memberAnalytics ? [LINKEDIN_ANALYTICS_SCOPE] : []),
    ]
  }

  getAuthUrl(ctx: { state: string; redirectUri: string }): string {
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization')
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', env.LINKEDIN_CLIENT_ID ?? '')
    u.searchParams.set('redirect_uri', ctx.redirectUri)
    u.searchParams.set('state', ctx.state)
    u.searchParams.set('scope', this.scopes().join(' '))
    return u.toString()
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenSet> {
    let res: Response
    try {
      res = await this.fetchImpl('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          ...params,
          client_id: env.LINKEDIN_CLIENT_ID ?? '',
          client_secret: env.LINKEDIN_CLIENT_SECRET ?? '',
        }).toString(),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'LinkedIn OAuth nije dostupan.',
        raw: error,
        retryable: true,
      })
    }
    const body = (await res.json().catch(() => null)) as
      | (LinkedInErrorBody & {
          access_token?: string
          expires_in?: number
          refresh_token?: string
          refresh_token_expires_in?: number
          scope?: string
        })
      | null
    if (!res.ok || !body?.access_token) throw mapLinkedInError(res.status, body)
    const now = Date.now()
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000).toISOString() : null,
      refreshExpiresAt: body.refresh_token_expires_in
        ? new Date(now + body.refresh_token_expires_in * 1000).toISOString()
        : null,
      scopes: (body.scope ?? '').split(/[ ,]+/).filter(Boolean),
    }
  }

  private userinfo(accessToken: string): Promise<UserInfo> {
    return this.client(accessToken).get<UserInfo>('/v2/userinfo')
  }

  async exchangeCode(code: string, ctx: { redirectUri: string }) {
    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ctx.redirectUri,
    })
    const me = await this.userinfo(tokens.accessToken)
    return { ...tokens, externalUserId: me.sub, externalUserName: me.name ?? null }
  }

  async refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken) {
      throw new ProviderError('TOKEN_INVALID', {
        message: 'LinkedIn token nema refresh token (programski refresh nije odobren aplikaciji).',
        userMessage: 'LinkedIn veza ističe. Povežite nalog ponovo da objave ne bi stale.',
      })
    }
    const fresh = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
    return {
      ...fresh,
      refreshToken: fresh.refreshToken ?? tokens.refreshToken,
      refreshExpiresAt: fresh.refreshExpiresAt ?? tokens.refreshExpiresAt,
      scopes: fresh.scopes.length ? fresh.scopes : tokens.scopes,
    }
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const me = await this.userinfo(tokens.accessToken)
    const granted = tokens.scopes
    const person: ExternalAccount = {
      platform: 'linkedin',
      externalId: me.sub,
      parentExternalId: null,
      name: me.name ?? 'LinkedIn profil',
      username: null,
      avatarUrl: me.picture ?? null,
      accountType: 'linkedin_person',
      token: tokens,
      capabilities: this.caps(!granted.length || granted.includes('w_member_social')),
      metadata: { linkedinUserId: me.sub, personUrn: `urn:li:person:${me.sub}`, scopes: granted },
    }
    const accounts: ExternalAccount[] = [person]
    if (!this.pages || !granted.some((s) => s === 'rw_organization_admin' || s === 'r_organization_admin'))
      return accounts

    const client = this.client(tokens.accessToken)
    const acl = await client.get<{
      elements?: Array<{ role?: string; state?: string; organization?: string; organizationTarget?: string }>
    }>('/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100')
    const roles = new Map<string, string>()
    for (const el of acl.elements ?? []) {
      const urn = el.organization ?? el.organizationTarget
      if (!urn || el.state !== 'APPROVED' || !POSTING_ROLES.has(el.role ?? '')) continue
      if (!roles.has(urn) || el.role === 'ADMINISTRATOR') roles.set(urn, el.role!)
    }
    for (const [urn, role] of roles) {
      const id = urn.split(':').pop()!
      let name = `LinkedIn stranica ${id}`
      let vanity: string | null = null
      let followers: number | null = null
      try {
        const org = await client.get<{ localizedName?: string; vanityName?: string }>(
          `/rest/organizations/${id}`,
        )
        name = org.localizedName ?? name
        vanity = org.vanityName ?? null
      } catch {
        // naziv nije obavezan za povezivanje
      }
      try {
        const size = await client.get<{ firstDegreeSize?: number }>(
          `/rest/networkSizes/${encUrn(urn)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
        )
        followers = size.firstDegreeSize ?? null
      } catch {
        // broj pratilaca nije obavezan
      }
      accounts.push({
        platform: 'linkedin',
        externalId: id,
        parentExternalId: me.sub,
        name,
        username: vanity,
        avatarUrl: null,
        accountType: 'linkedin_organization',
        token: tokens,
        capabilities: this.caps(granted.includes('w_organization_social')),
        metadata: {
          linkedinUserId: me.sub,
          organizationUrn: urn,
          role,
          scopes: granted,
          ...(followers !== null ? { followers } : {}),
        },
      })
    }
    return accounts
  }

  private caps(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: true,
      video: false,
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
    const scopes = scopesOf(account)
    return this.caps(
      !scopes.length || scopes.includes(isOrg(account) ? 'w_organization_social' : 'w_member_social'),
    )
  }

  validatePost(input: NormalizedPost): ValidationResult {
    const problems = [...validateText('linkedin', input.text).problems]
    const images = input.media.filter((m) => m.mimeType.startsWith('image/'))
    if (input.media.some((m) => m.mimeType.startsWith('video/')))
      problems.push('Video na LinkedIn Sova još ne objavljuje; uklonite video za ovaj nalog.')
    if (images.length > 20) problems.push('LinkedIn dozvoljava najviše 20 slika u jednoj objavi.')
    for (const m of images)
      if (m.width && m.height && m.width * m.height >= MAX_PIXELS)
        problems.push('Slika je prevelika za LinkedIn (najviše oko 36 megapiksela).')
    if (!input.text.trim() && !images.length && !input.link) problems.push('Objava nema ni tekst ni medij.')
    return { ok: problems.length === 0, problems }
  }

  private async download(media: NormalizedMedia): Promise<Buffer> {
    let res: Response
    try {
      res = await this.fetchImpl(media.url, { signal: AbortSignal.timeout(30_000) })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Medij nije preuzet iz skladišta.',
        raw: error,
        retryable: true,
      })
    }
    if (!res.ok)
      throw new ProviderError('MEDIA_REJECTED', {
        message: `Skladište je vratilo ${res.status} za medij.`,
        status: res.status,
      })
    return Buffer.from(await res.arrayBuffer())
  }

  /** Images API: registracija, PUT bajtova; WebP i ostalo se pretvara u JPEG (LinkedIn prima JPG, PNG, GIF). */
  private async uploadImage(
    client: LinkedInClient,
    owner: string,
    media: NormalizedMedia,
    accessToken: string,
  ) {
    const init = await client.post<{ value?: { uploadUrl?: string; image?: string } }>(
      '/rest/images?action=initializeUpload',
      { initializeUploadRequest: { owner } },
    )
    const uploadUrl = init.body?.value?.uploadUrl
    const image = init.body?.value?.image
    if (!uploadUrl || !image)
      throw new ProviderError('UNKNOWN', { message: 'LinkedIn nije vratio adresu za upload slike.' })
    let bytes = await this.download(media)
    let type = media.mimeType
    if (!UPLOAD_MIME.has(type)) {
      bytes = await sharp(bytes).jpeg({ quality: 90 }).toBuffer()
      type = 'image/jpeg'
    }
    let res: Response
    try {
      res = await this.fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': type },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Upload slike na LinkedIn nije uspeo.',
        raw: error,
        retryable: true,
      })
    }
    if (!res.ok)
      throw mapLinkedInError(res.status, (await res.json().catch(() => null)) as LinkedInErrorBody | null)
    return image
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const client = this.client(accessToken)
    const author = authorUrn(account)
    const images = input.media.filter((m) => m.mimeType.startsWith('image/'))
    // slike i članak ne idu zajedno: uz slike link ostaje u tekstu
    const text =
      images.length && input.link && !input.text.includes(input.link)
        ? `${input.text}\n\n${input.link}`
        : input.text
    let content: Record<string, unknown> | undefined
    if (images.length === 1) {
      const id = await this.uploadImage(client, author, images[0]!, accessToken)
      content = { media: { id, ...(images[0]!.alt ? { altText: images[0]!.alt } : {}) } }
    } else if (images.length > 1) {
      const ids: string[] = []
      for (const m of images) ids.push(await this.uploadImage(client, author, m, accessToken))
      content = {
        multiImage: {
          images: ids.map((id, i) => ({ id, ...(images[i]!.alt ? { altText: images[i]!.alt } : {}) })),
        },
      }
    } else if (input.link) {
      // Posts API ne čita link sam: naslov i opis šalje Sova
      const preview = await this.linkPreview(input.link)
      content = {
        article: {
          source: input.link,
          title: (input.title || preview.title).slice(0, 200),
          ...(preview.description ? { description: preview.description } : {}),
        },
      }
    }
    const res = await client.post<null>('/rest/posts', {
      author,
      commentary: toLittleText(text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    })
    const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id')
    if (!urn) throw new ProviderError('UNKNOWN', { message: 'LinkedIn nije vratio ID objave.' })
    return { externalId: urn, permalink: permalinkFor(urn), pending: null }
  }

  async getPublishStatus(handle: PollHandle): Promise<PublishStatus> {
    throw new ProviderError('NOT_SUPPORTED', {
      message: `LinkedIn nema asinhrono objavljivanje (${handle.kind}).`,
    })
  }

  /** Posle pada: objava stranice se traži među poslednjim objavama (lični profil to API-jem ne može). */
  async findExistingPost(
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
  ): Promise<string | null> {
    if (!isOrg(account) || !scopesOf(account).includes('r_organization_social')) return null
    const res = await this.client(accessToken).get<{ elements?: PostElement[] }>(
      `/rest/posts?author=${encUrn(authorUrn(account))}&q=author&count=10&sortBy=CREATED`,
      'FINDER',
    )
    const want = input.text.trim()
    const hit = (res.elements ?? []).find((p) => plainCommentary(p.commentary ?? '').trim() === want)
    return hit?.id ?? null
  }

  async deletePost(externalId: string, accessToken: string): Promise<void> {
    await this.client(accessToken).delete(`/rest/posts/${encUrn(externalId)}`)
  }

  private async orgStatistics(
    client: LinkedInClient,
    account: AccountRef,
    urns: string[],
  ): Promise<Map<string, ShareStatistics>> {
    const out = new Map<string, ShareStatistics>()
    const param = statsParam(urns)
    if (!param) return out
    const res = await client.get<{
      elements?: Array<{ share?: string; ugcPost?: string; totalShareStatistics?: ShareStatistics }>
    }>(
      `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encUrn(authorUrn(account))}&${param}`,
    )
    for (const el of res.elements ?? []) {
      const urn = el.share ?? el.ugcPost
      if (urn && el.totalShareStatistics) out.set(urn, el.totalShareStatistics)
    }
    return out
  }

  async fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]> {
    // lični profil: čitanje objava traži r_member_social (samo odobrenim partnerima)
    if (!isOrg(account) || !scopesOf(account).includes('r_organization_social')) return []
    const client = this.client(accessToken)
    const res = await client.get<{ elements?: PostElement[] }>(
      `/rest/posts?author=${encUrn(authorUrn(account))}&q=author&count=${Math.min(Math.max(limit, 1), 100)}&sortBy=CREATED`,
      'FINDER',
    )
    const posts = (res.elements ?? []).slice(0, limit)
    let stats = new Map<string, ShareStatistics>()
    if (scopesOf(account).includes('rw_organization_admin') && posts.length) {
      try {
        stats = await this.orgStatistics(
          client,
          account,
          posts.slice(0, 20).map((p) => p.id),
        )
      } catch {
        // statistika je dodatak, istorija se uvozi i bez nje
      }
    }
    return posts.map((p) => {
      const s = stats.get(p.id)
      const metrics: Record<string, number> = {}
      if (s) {
        metrics.likes = s.likeCount ?? 0
        metrics.comments = s.commentCount ?? 0
        metrics.shares = s.shareCount ?? 0
        metrics.impressions = s.impressionCount ?? 0
        metrics.clicks = s.clickCount ?? 0
      }
      const at = p.publishedAt ?? p.createdAt
      return {
        externalId: p.id,
        postType: postKind(p.content),
        text: p.commentary ? plainCommentary(p.commentary) : null,
        media: null,
        permalink: permalinkFor(p.id),
        publishedAt: at ? new Date(at).toISOString() : null,
        metrics,
      }
    })
  }

  async fetchPostMetrics(
    externalId: string,
    account: AccountRef,
    accessToken: string,
  ): Promise<NormalizedMetrics> {
    const client = this.client(accessToken)
    if (isOrg(account)) {
      const s = (await this.orgStatistics(client, account, [externalId])).get(externalId) ?? {}
      const likes = s.likeCount ?? 0
      const comments = s.commentCount ?? 0
      const shares = s.shareCount ?? 0
      const clicks = s.clickCount ?? 0
      return {
        impressions: s.impressionCount ?? 0,
        reach: s.uniqueImpressionsCount ?? null,
        likes,
        comments,
        shares,
        saves: null,
        clicks,
        engagement: likes + comments + shares + clicks,
        raw: s as unknown as Record<string, Json>,
      }
    }
    if (!this.memberAnalytics || !scopesOf(account).includes(LINKEDIN_ANALYTICS_SCOPE)) {
      return {
        impressions: null,
        reach: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        clicks: null,
        engagement: null,
        raw: { unavailable: LINKEDIN_ANALYTICS_SCOPE },
      }
    }
    const entity = externalId.startsWith('urn:li:ugcPost:')
      ? `(ugc:${encUrn(externalId)})`
      : `(share:${encUrn(externalId)})`
    const metric = async (queryType: string) => {
      const r = await client.get<{ elements?: Array<{ count?: number }> }>(
        `/rest/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`,
      )
      return r.elements?.[0]?.count ?? 0
    }
    const impressions = await metric('IMPRESSION')
    const reach = await metric('MEMBERS_REACHED')
    const likes = await metric('REACTION')
    const comments = await metric('COMMENT')
    const shares = await metric('RESHARE')
    return {
      impressions,
      reach,
      likes,
      comments,
      shares,
      saves: null,
      clicks: null,
      engagement: likes + comments + shares,
      raw: { impressions, reach, likes, comments, shares },
    }
  }

  async fetchAccountMetrics(account: AccountRef, accessToken: string, date: string): Promise<AccountMetrics> {
    let followers: number | null = null
    if (isOrg(account)) {
      const size = await this.client(accessToken).get<{ firstDegreeSize?: number }>(
        `/rest/networkSizes/${encUrn(authorUrn(account))}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
      )
      followers = size.firstDegreeSize ?? null
    }
    return {
      date,
      followers,
      reach: null,
      impressions: null,
      engagement: null,
      profileViews: null,
      raw: followers !== null ? { followers } : {},
    }
  }

  /** LinkedIn nema javni endpoint za opoziv članskog tokena; veza se prekida brisanjem tokena kod nas. */
  async revoke(): Promise<void> {}
}
