import 'server-only'

import { PLATFORMS, validateText } from '@/config/platforms'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { ProviderError } from '@/integrations/social/errors'
import type {
  AccountMetrics,
  AccountRef,
  Capabilities,
  ExternalAccount,
  HistoricalPost,
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

import { GraphClient } from './graph'

/**
 * Meta provider: Facebook stranice i Instagram Business/Creator nalozi kroz Facebook Login
 * (docs/INTEGRATIONS.md 3 i 4, D-013). Jedan OAuth tok, Page token bez fiksnog isteka,
 * dugotrajan korisnički token (60 dana) kao osnova za osvežavanje.
 */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments',
] as const

const PUBLISH_TASKS = new Set(['CREATE_CONTENT', 'MANAGE'])

export interface MetaProviderOptions {
  fetchImpl?: typeof fetch
  /** pauza između provera statusa IG kontejnera (testovi: 0) */
  pollIntervalMs?: number
  pollAttempts?: number
}

interface PageNode {
  id: string
  name: string
  username?: string
  access_token: string
  tasks?: string[]
  picture?: { data?: { url?: string } }
  followers_count?: number
  fan_count?: number
  instagram_business_account?: {
    id: string
    username?: string
    name?: string
    profile_picture_url?: string
    followers_count?: number
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MetaProvider implements SocialProvider {
  readonly platforms = ['facebook', 'instagram'] as const
  private readonly fetchImpl: typeof fetch | undefined
  private readonly pollIntervalMs: number
  private readonly pollAttempts: number

  constructor(options: MetaProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000
    this.pollAttempts = options.pollAttempts ?? 10
  }

  private client(token: string | null): GraphClient {
    return new GraphClient(token, { version: env.META_GRAPH_VERSION, fetchImpl: this.fetchImpl })
  }

  static isConfigured(): boolean {
    return Boolean(env.META_APP_ID && env.META_APP_SECRET)
  }

  getAuthUrl(ctx: { state: string; redirectUri: string }): string {
    const u = new URL(`https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth`)
    u.searchParams.set('client_id', env.META_APP_ID ?? '')
    u.searchParams.set('redirect_uri', ctx.redirectUri)
    u.searchParams.set('state', ctx.state)
    u.searchParams.set('response_type', 'code')
    if (env.META_LOGIN_CONFIG_ID) u.searchParams.set('config_id', env.META_LOGIN_CONFIG_ID)
    else u.searchParams.set('scope', META_SCOPES.join(','))
    return u.toString()
  }

  async exchangeCode(
    code: string,
    ctx: { redirectUri: string },
  ): Promise<TokenSet & { externalUserId: string; externalUserName: string | null }> {
    const anon = this.client(null)
    const short = await anon.get<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: ctx.redirectUri,
      code,
    })
    const long = await anon.get<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: short.access_token,
    })
    const user = this.client(long.access_token)
    const me = await user.get<{ id: string; name?: string }>('me', { fields: 'id,name' })
    let scopes: string[] = []
    try {
      const perms = await user.get<{ data?: Array<{ permission: string; status: string }> }>('me/permissions')
      scopes = (perms.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission)
    } catch (error) {
      logger.warn('meta_permissions_failed', { error })
    }
    const expiresAt = new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000).toISOString()
    return {
      accessToken: long.access_token,
      refreshToken: long.access_token,
      expiresAt,
      refreshExpiresAt: expiresAt,
      scopes,
      externalUserId: me.id,
      externalUserName: me.name ?? null,
    }
  }

  /** Dugotrajan korisnički token se produžava ponovnom razmenom dok je još važeći. */
  async refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    const userToken = tokens.refreshToken ?? tokens.accessToken
    const long = await this.client(null).get<{ access_token: string; expires_in?: number }>(
      'oauth/access_token',
      {
        grant_type: 'fb_exchange_token',
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        fb_exchange_token: userToken,
      },
    )
    const expiresAt = new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000).toISOString()
    return {
      ...tokens,
      accessToken: long.access_token,
      refreshToken: long.access_token,
      expiresAt,
      refreshExpiresAt: expiresAt,
    }
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const user = this.client(tokens.refreshToken ?? tokens.accessToken)
    const out: ExternalAccount[] = []
    let after: string | undefined
    for (let page = 0; page < 5; page++) {
      const res = await user.get<{
        data?: PageNode[]
        paging?: { cursors?: { after?: string }; next?: string }
      }>('me/accounts', {
        fields:
          'id,name,username,access_token,tasks,picture{url},followers_count,fan_count,instagram_business_account{id,username,name,profile_picture_url,followers_count}',
        limit: 50,
        after,
      })
      for (const p of res.data ?? []) {
        const tasks = p.tasks ?? []
        const canPublish = tasks.some((t) => PUBLISH_TASKS.has(t))
        const pageToken: TokenSet = { ...tokens, accessToken: p.access_token, expiresAt: null }
        out.push({
          platform: 'facebook',
          externalId: p.id,
          parentExternalId: null,
          name: p.name,
          username: p.username ?? null,
          avatarUrl: p.picture?.data?.url ?? null,
          accountType: 'facebook_page',
          token: pageToken,
          capabilities: this.facebookCapabilities(canPublish),
          metadata: { tasks, followers: p.followers_count ?? p.fan_count ?? null } as Record<string, Json>,
        })
        const ig = p.instagram_business_account
        if (ig) {
          out.push({
            platform: 'instagram',
            externalId: ig.id,
            parentExternalId: p.id,
            name: ig.name ?? ig.username ?? p.name,
            username: ig.username ?? null,
            avatarUrl: ig.profile_picture_url ?? null,
            accountType: 'instagram_business',
            token: pageToken,
            capabilities: this.instagramCapabilities(canPublish),
            metadata: {
              pageId: p.id,
              pageName: p.name,
              followers: ig.followers_count ?? null,
              tasks,
            } as Record<string, Json>,
          })
        }
      }
      after = res.paging?.cursors?.after
      if (!after || !res.paging?.next) break
    }
    return out
  }

  private facebookCapabilities(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: true,
      video: false,
      reels: false,
      stories: false,
      link: true,
      text: true,
      firstComment: true,
      aiLabel: false,
      publish,
    }
  }

  private instagramCapabilities(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: true,
      video: false,
      reels: false,
      stories: false,
      link: false,
      text: false,
      firstComment: true,
      aiLabel: true,
      publish,
    }
  }

  capabilities(account: AccountRef): Capabilities {
    const publish = Array.isArray(account.metadata.tasks)
      ? (account.metadata.tasks as string[]).some((t) => PUBLISH_TASKS.has(t))
      : true
    return account.platform === 'instagram'
      ? this.instagramCapabilities(publish)
      : this.facebookCapabilities(publish)
  }

  validatePost(input: NormalizedPost, account: AccountRef): ValidationResult {
    const platform = account.platform
    const c = PLATFORMS[platform]
    const text = validateText(platform, input.text)
    const problems = [...text.problems]
    if (input.media.length > c.imageMaxPerPost)
      problems.push(`${c.label} dozvoljava najviše ${c.imageMaxPerPost} slika po objavi.`)
    for (const m of input.media) {
      if (!c.imageMime.includes(m.mimeType))
        problems.push(
          `${c.label} prihvata ${c.imageMime.map((x) => x.split('/')[1]!.toUpperCase()).join(', ')}; „${m.mimeType}” nije podržan.`,
        )
      if (m.width && m.height) {
        const ratio = m.width / m.height
        if (ratio < c.imageAspect.min - 0.01 || ratio > c.imageAspect.max + 0.01) {
          problems.push(
            `Odnos stranica ${ratio.toFixed(2)} je van opsega ${c.imageAspect.min}–${c.imageAspect.max} za ${c.label}.`,
          )
        }
      }
    }
    if (platform === 'instagram' && input.media.length === 0)
      problems.push('Instagram objava mora imati bar jednu sliku.')
    if (platform === 'instagram' && input.link)
      problems.push('Instagram ne podržava klikabilan link u objavi; link ide u bio ili prvi komentar.')
    return { ok: problems.length === 0, problems }
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const g = this.client(accessToken)
    if (account.platform === 'facebook') return this.publishFacebook(g, input, account)
    return this.publishInstagram(g, input, account)
  }

  private async publishFacebook(
    g: GraphClient,
    input: NormalizedPost,
    account: AccountRef,
  ): Promise<PublishResult> {
    const page = account.externalId
    let postId: string
    if (input.media.length === 0) {
      const r = await g.post<{ id: string }>(`${page}/feed`, {
        message: input.text,
        link: input.link ?? undefined,
      })
      postId = r.id
    } else if (input.media.length === 1) {
      const r = await g.post<{ id: string; post_id?: string }>(`${page}/photos`, {
        url: input.media[0]!.url,
        caption: input.text,
        alt_text_custom: input.media[0]!.alt ?? undefined,
      })
      postId = r.post_id ?? r.id
    } else {
      const ids: string[] = []
      for (const m of input.media) {
        const r = await g.post<{ id: string }>(`${page}/photos`, {
          url: m.url,
          published: false,
          alt_text_custom: m.alt ?? undefined,
        })
        ids.push(r.id)
      }
      const params: Record<string, string> = { message: input.text }
      ids.forEach((id, i) => {
        params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })
      })
      const r = await g.post<{ id: string }>(`${page}/feed`, params)
      postId = r.id
    }
    if (input.firstComment) {
      try {
        await g.post(`${postId}/comments`, { message: input.firstComment })
      } catch (error) {
        logger.warn('meta_first_comment_failed', { postId, error })
      }
    }
    return { externalId: postId, permalink: `https://www.facebook.com/${postId}`, pending: null }
  }

  private async waitForContainer(
    g: GraphClient,
    containerId: string,
  ): Promise<'FINISHED' | 'PUBLISHED' | 'IN_PROGRESS'> {
    for (let i = 0; i < this.pollAttempts; i++) {
      const s = await g.get<{ status_code?: string; status?: string }>(containerId, {
        fields: 'status_code,status',
      })
      const code = s.status_code ?? 'IN_PROGRESS'
      if (code === 'FINISHED' || code === 'PUBLISHED') return code
      if (code === 'ERROR')
        throw new ProviderError('MEDIA_REJECTED', {
          message: `IG kontejner ERROR: ${s.status ?? ''}`,
          raw: s,
        })
      if (code === 'EXPIRED')
        throw new ProviderError('MEDIA_REJECTED', {
          message: 'IG kontejner je istekao.',
          raw: s,
          userMessage: 'Instagram nije obradio medij na vreme. Pokušajte ponovo.',
        })
      if (i < this.pollAttempts - 1 && this.pollIntervalMs > 0) await sleep(this.pollIntervalMs)
    }
    return 'IN_PROGRESS'
  }

  private async publishInstagram(
    g: GraphClient,
    input: NormalizedPost,
    account: AccountRef,
  ): Promise<PublishResult> {
    const ig = account.externalId
    if (input.media.length === 0)
      throw new ProviderError('CONTENT_REJECTED', { userMessage: 'Instagram objava mora imati sliku.' })
    let creationId: string
    if (input.media.length === 1) {
      const m = input.media[0]!
      const r = await g.post<{ id: string }>(`${ig}/media`, {
        image_url: m.url,
        caption: input.text,
        alt_text: m.alt ?? undefined,
        is_ai_generated: input.isAiGenerated ? true : undefined,
      })
      creationId = r.id
    } else {
      const children: string[] = []
      for (const m of input.media.slice(0, 20)) {
        const r = await g.post<{ id: string }>(`${ig}/media`, {
          image_url: m.url,
          is_carousel_item: true,
          alt_text: m.alt ?? undefined,
        })
        children.push(r.id)
      }
      const r = await g.post<{ id: string }>(`${ig}/media`, {
        media_type: 'CAROUSEL',
        children: children.join(','),
        caption: input.text,
        is_ai_generated: input.isAiGenerated ? true : undefined,
      })
      creationId = r.id
    }
    const state = await this.waitForContainer(g, creationId)
    if (state === 'IN_PROGRESS')
      return {
        externalId: null,
        permalink: null,
        pending: { kind: 'ig_container', containerId: creationId, accountExternalId: ig },
      }
    const published = await g.post<{ id: string }>(`${ig}/media_publish`, { creation_id: creationId })
    let permalink: string | null = null
    try {
      const info = await g.get<{ permalink?: string }>(published.id, { fields: 'permalink' })
      permalink = info.permalink ?? null
    } catch {
      permalink = null
    }
    if (input.firstComment) {
      try {
        await g.post(`${published.id}/comments`, { message: input.firstComment })
      } catch (error) {
        logger.warn('meta_first_comment_failed', { postId: published.id, error })
      }
    }
    return { externalId: published.id, permalink, pending: null }
  }

  async getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus> {
    const g = this.client(accessToken)
    const s = await g.get<{ status_code?: string; status?: string }>(handle.containerId, {
      fields: 'status_code,status',
    })
    const code = s.status_code ?? 'IN_PROGRESS'
    if (code === 'IN_PROGRESS') return { state: 'pending' }
    if (code === 'ERROR')
      return { state: 'failed', message: s.status ?? 'Instagram je odbio medij.', retryable: false }
    if (code === 'EXPIRED')
      return { state: 'failed', message: 'Instagram kontejner je istekao.', retryable: true }
    const published = await g.post<{ id: string }>(`${handle.accountExternalId}/media_publish`, {
      creation_id: handle.containerId,
    })
    let permalink: string | null = null
    try {
      permalink =
        (await g.get<{ permalink?: string }>(published.id, { fields: 'permalink' })).permalink ?? null
    } catch {
      permalink = null
    }
    return { state: 'published', externalId: published.id, permalink }
  }

  /** Posle pada bez ID-ja: traži skorašnju objavu sa istim tekstom (Meta nema idempotency ključ). */
  async findExistingPost(
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
  ): Promise<string | null> {
    const g = this.client(accessToken)
    const needle = input.text.trim().slice(0, 200)
    if (!needle) return null
    const since = Date.now() - 2 * 3600_000
    if (account.platform === 'facebook') {
      const r = await g.get<{ data?: Array<{ id: string; message?: string; created_time?: string }> }>(
        `${account.externalId}/posts`,
        { fields: 'id,message,created_time', limit: 10 },
      )
      const hit = (r.data ?? []).find(
        (p) =>
          (p.message ?? '').trim().startsWith(needle) &&
          (!p.created_time || new Date(p.created_time).getTime() >= since),
      )
      return hit?.id ?? null
    }
    const r = await g.get<{ data?: Array<{ id: string; caption?: string; timestamp?: string }> }>(
      `${account.externalId}/media`,
      { fields: 'id,caption,timestamp', limit: 10 },
    )
    const hit = (r.data ?? []).find(
      (p) =>
        (p.caption ?? '').trim().startsWith(needle) &&
        (!p.timestamp || new Date(p.timestamp).getTime() >= since),
    )
    return hit?.id ?? null
  }

  async deletePost(externalId: string, accessToken: string): Promise<void> {
    await this.client(accessToken).delete(externalId)
  }

  async fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]> {
    const g = this.client(accessToken)
    const out: HistoricalPost[] = []
    if (account.platform === 'facebook') {
      let after: string | undefined
      while (out.length < limit) {
        const r = await g.get<{
          data?: Array<{
            id: string
            message?: string
            created_time?: string
            permalink_url?: string
            full_picture?: string
            status_type?: string
            attachments?: {
              data?: Array<{
                media_type?: string
                media?: { image?: { src?: string } }
                subattachments?: { data?: Array<{ media?: { image?: { src?: string } } }> }
              }>
            }
            shares?: { count?: number }
            likes?: { summary?: { total_count?: number } }
            comments?: { summary?: { total_count?: number } }
          }>
          paging?: { cursors?: { after?: string }; next?: string }
        }>(`${account.externalId}/posts`, {
          fields:
            'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type,media,subattachments},shares,likes.summary(true),comments.summary(true)',
          limit: Math.min(50, limit - out.length),
          after,
        })
        for (const p of r.data ?? []) {
          const att = p.attachments?.data?.[0]
          const media: Array<{ url: string; type: string }> = []
          if (att?.subattachments?.data?.length) {
            for (const s of att.subattachments.data)
              if (s.media?.image?.src) media.push({ url: s.media.image.src, type: 'image' })
          } else if (att?.media?.image?.src)
            media.push({ url: att.media.image.src, type: att.media_type ?? 'image' })
          else if (p.full_picture) media.push({ url: p.full_picture, type: 'image' })
          out.push({
            externalId: p.id,
            postType: att?.media_type ?? p.status_type ?? null,
            text: p.message ?? null,
            media: media.length ? media : null,
            permalink: p.permalink_url ?? `https://www.facebook.com/${p.id}`,
            publishedAt: p.created_time ?? null,
            metrics: {
              likes: p.likes?.summary?.total_count ?? 0,
              comments: p.comments?.summary?.total_count ?? 0,
              shares: p.shares?.count ?? 0,
            },
          })
        }
        after = r.paging?.cursors?.after
        if (!after || !r.paging?.next || !(r.data ?? []).length) break
      }
      return out.slice(0, limit)
    }
    let after: string | undefined
    while (out.length < limit) {
      const r = await g.get<{
        data?: Array<{
          id: string
          caption?: string
          media_type?: string
          media_product_type?: string
          permalink?: string
          timestamp?: string
          like_count?: number
          comments_count?: number
          media_url?: string
          thumbnail_url?: string
        }>
        paging?: { cursors?: { after?: string }; next?: string }
      }>(`${account.externalId}/media`, {
        fields:
          'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url',
        limit: Math.min(50, limit - out.length),
        after,
      })
      for (const m of r.data ?? []) {
        const url = m.media_url ?? m.thumbnail_url
        out.push({
          externalId: m.id,
          postType: m.media_product_type ?? m.media_type ?? null,
          text: m.caption ?? null,
          media: url ? [{ url, type: (m.media_type ?? 'IMAGE').toLowerCase() }] : null,
          permalink: m.permalink ?? null,
          publishedAt: m.timestamp ?? null,
          metrics: { likes: m.like_count ?? 0, comments: m.comments_count ?? 0 },
        })
      }
      after = r.paging?.cursors?.after
      if (!after || !r.paging?.next || !(r.data ?? []).length) break
    }
    return out.slice(0, limit)
  }

  async fetchPostMetrics(
    externalId: string,
    account: AccountRef,
    accessToken: string,
  ): Promise<NormalizedMetrics> {
    const g = this.client(accessToken)
    const raw: Record<string, Json> = {}
    const values: Record<string, number> = {}
    const readInsights = async (metrics: string) => {
      const r = await g.get<{
        data?: Array<{ name: string; values?: Array<{ value?: number | Record<string, number> }> }>
      }>(`${externalId}/insights`, { metric: metrics })
      for (const d of r.data ?? []) {
        const v = d.values?.[0]?.value
        if (typeof v === 'number') values[d.name] = v
        else if (v && typeof v === 'object') values[d.name] = Object.values(v).reduce((a, b) => a + b, 0)
        raw[d.name] = (v as Json) ?? null
      }
    }
    if (account.platform === 'facebook') {
      const basic = await g.get<{
        shares?: { count?: number }
        likes?: { summary?: { total_count?: number } }
        comments?: { summary?: { total_count?: number } }
      }>(externalId, {
        fields: 'shares,likes.summary(true),comments.summary(true)',
      })
      values.likes = basic.likes?.summary?.total_count ?? 0
      values.comments = basic.comments?.summary?.total_count ?? 0
      values.shares = basic.shares?.count ?? 0
      try {
        await readInsights('post_impressions,post_impressions_unique,post_clicks,post_engaged_users')
      } catch (error) {
        logger.warn('meta_post_insights_failed', { externalId, error })
      }
      return {
        impressions: values.post_impressions ?? null,
        reach: values.post_impressions_unique ?? null,
        likes: values.likes ?? null,
        comments: values.comments ?? null,
        shares: values.shares ?? null,
        saves: null,
        clicks: values.post_clicks ?? null,
        engagement:
          values.post_engaged_users ?? (values.likes ?? 0) + (values.comments ?? 0) + (values.shares ?? 0),
        raw,
      }
    }
    const basic = await g.get<{ like_count?: number; comments_count?: number }>(externalId, {
      fields: 'like_count,comments_count',
    })
    values.likes = basic.like_count ?? 0
    values.comments = basic.comments_count ?? 0
    try {
      await readInsights('reach,views,saved,shares,total_interactions')
    } catch (error) {
      logger.warn('meta_ig_insights_failed', { externalId, error })
    }
    return {
      impressions: values.views ?? null,
      reach: values.reach ?? null,
      likes: values.likes,
      comments: values.comments,
      shares: values.shares ?? null,
      saves: values.saved ?? null,
      clicks: null,
      engagement: values.total_interactions ?? values.likes + values.comments,
      raw,
    }
  }

  async fetchAccountMetrics(account: AccountRef, accessToken: string, date: string): Promise<AccountMetrics> {
    const g = this.client(accessToken)
    const raw: Record<string, Json> = {}
    const values: Record<string, number> = {}
    const since = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
    const until = since + 86_400
    const metrics =
      account.platform === 'facebook'
        ? 'page_impressions_unique,page_post_engagements,page_fans'
        : 'reach,follower_count,profile_views'
    try {
      const r = await g.get<{ data?: Array<{ name: string; values?: Array<{ value?: number }> }> }>(
        `${account.externalId}/insights`,
        { metric: metrics, period: 'day', since, until },
      )
      for (const d of r.data ?? []) {
        const v = d.values?.[d.values.length - 1]?.value
        if (typeof v === 'number') values[d.name] = v
        raw[d.name] = (v as Json) ?? null
      }
    } catch (error) {
      logger.warn('meta_account_insights_failed', { account: account.externalId, error })
    }
    if (account.platform === 'instagram' && values.follower_count === undefined) {
      try {
        const r = await g.get<{ followers_count?: number }>(account.externalId, { fields: 'followers_count' })
        if (typeof r.followers_count === 'number') values.follower_count = r.followers_count
      } catch {
        // nije kritično
      }
    }
    return account.platform === 'facebook'
      ? {
          date,
          followers: values.page_fans ?? null,
          reach: values.page_impressions_unique ?? null,
          impressions: null,
          engagement: values.page_post_engagements ?? null,
          profileViews: null,
          raw,
        }
      : {
          date,
          followers: values.follower_count ?? null,
          reach: values.reach ?? null,
          impressions: null,
          engagement: null,
          profileViews: values.profile_views ?? null,
          raw,
        }
  }

  async revoke(tokens: TokenSet, externalUserId: string | null): Promise<void> {
    const userToken = tokens.refreshToken ?? tokens.accessToken
    try {
      await this.client(userToken).delete(`${externalUserId ?? 'me'}/permissions`)
    } catch (error) {
      logger.warn('meta_revoke_failed', { error })
    }
  }
}
