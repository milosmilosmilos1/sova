import 'server-only'

import { gbpDateTime, gbpOptionProblems, readGbpOptions } from '@/config/google-business'
import { validateText } from '@/config/platforms'
import { ProviderError } from '@/integrations/social/errors'
import {
  GoogleApiClient,
  googleAuthUrl,
  googleConfigured,
  googleExchangeCode,
  googleRefresh,
  googleRevoke,
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
 * Google poslovni profil (docs/INTEGRATIONS.md 10, faza 8c, D-084): Google OAuth sa `business.manage`;
 * nalozi kroz Account Management API, lokacije kroz Business Information API (svaka lokacija je jedan
 * nalog u Sovi), objave kroz My Business API v4 `localPosts`, metrike lokacije kroz Performance API.
 * Objave nemaju metrike kroz API (ukinuto 2023). Pristup traži odobrenje Google-a (kvota 0 → 300 QPM).
 */
export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'
const ACCOUNTS_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const POSTS_API = 'https://mybusiness.googleapis.com/v4'
const PERF_API = 'https://businessprofileperformance.googleapis.com/v1'
const READ_MASK = 'name,title,storefrontAddress,websiteUri,metadata'
const IMPRESSIONS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
] as const
const ACTIONS = ['WEBSITE_CLICKS', 'CALL_CLICKS', 'BUSINESS_DIRECTION_REQUESTS', 'MESSAGING_CLICKS'] as const

export interface GoogleBusinessProviderOptions {
  fetchImpl?: typeof fetch
}

interface GbpAccount {
  name: string
  accountName?: string
  type?: string
}

interface GbpLocation {
  name: string
  title?: string
  storefrontAddress?: { locality?: string; addressLines?: string[] }
  websiteUri?: string
  metadata?: { placeId?: string; mapsUri?: string; newReviewUri?: string; canOperateLocalPost?: boolean }
}

interface LocalPost {
  name: string
  summary?: string
  topicType?: string
  state?: string
  searchUrl?: string
  createTime?: string
  media?: Array<{ googleUrl?: string; sourceUrl?: string; mediaFormat?: string }>
}

const idOf = (resourceName: string) => resourceName.split('/').pop() ?? resourceName

/** Putanja objava lokacije; ime lokacije iz API-ja nema prefiks naloga, pa se nalog čuva posebno. */
function postsPath(account: AccountRef): string {
  return `${POSTS_API}/accounts/${account.parentExternalId}/locations/${account.externalId}/localPosts`
}

function photoUrl(m: NormalizedMedia): string {
  // Google prima JPG i PNG; WebP ide kroz našu JPEG varijantu
  return m.mimeType === 'image/jpeg' || m.mimeType === 'image/png' ? m.url : (m.publicUrl ?? m.url)
}

export class GoogleBusinessProvider implements SocialProvider {
  readonly platforms = ['google_business'] as const
  private readonly fetchImpl: typeof fetch

  constructor(options: GoogleBusinessProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  static isConfigured(): boolean {
    return googleConfigured()
  }

  private client(accessToken: string): GoogleApiClient {
    return new GoogleApiClient(accessToken, this.fetchImpl, 'Google poslovni profil')
  }

  getAuthUrl(ctx: { state: string; redirectUri: string }): string {
    return googleAuthUrl([GBP_SCOPE], ctx)
  }

  exchangeCode(code: string, ctx: { redirectUri: string }) {
    return googleExchangeCode(code, ctx.redirectUri, this.fetchImpl)
  }

  refreshUserToken(tokens: TokenSet): Promise<TokenSet> {
    return googleRefresh(tokens, this.fetchImpl)
  }

  private async pages<T>(client: GoogleApiClient, url: string, key: string): Promise<T[]> {
    const out: T[] = []
    let token: string | undefined
    for (let page = 0; page < 20; page++) {
      const u = new URL(url)
      if (token) u.searchParams.set('pageToken', token)
      const res = await client.get<Record<string, unknown>>(u.toString())
      out.push(...((res[key] as T[] | undefined) ?? []))
      token = typeof res.nextPageToken === 'string' && res.nextPageToken ? res.nextPageToken : undefined
      if (!token) break
    }
    return out
  }

  async listAccounts(tokens: TokenSet): Promise<ExternalAccount[]> {
    const client = this.client(tokens.accessToken)
    const granted = tokens.scopes
    if (granted.length && !granted.includes(GBP_SCOPE)) {
      throw new ProviderError('PERMISSION_LOST', {
        message: 'Google nije odobrio business.manage.',
        userMessage:
          'Pri povezivanju nije data dozvola za upravljanje poslovnim profilom. Povežite ponovo i štiklirajte je.',
      })
    }
    const accounts = await this.pages<GbpAccount>(client, `${ACCOUNTS_API}/accounts?pageSize=20`, 'accounts')
    const out: ExternalAccount[] = []
    for (const acc of accounts) {
      const accountId = idOf(acc.name)
      const locations = await this.pages<GbpLocation>(
        client,
        `${INFO_API}/accounts/${accountId}/locations?readMask=${READ_MASK}&pageSize=100`,
        'locations',
      )
      for (const loc of locations) {
        const canPost = loc.metadata?.canOperateLocalPost !== false
        const city = loc.storefrontAddress?.locality ?? null
        out.push({
          platform: 'google_business',
          externalId: idOf(loc.name),
          parentExternalId: accountId,
          name: loc.title ?? `Lokacija ${idOf(loc.name)}`,
          username: city,
          avatarUrl: null,
          accountType: 'google_business_location',
          token: tokens,
          capabilities: this.caps(canPost),
          metadata: {
            accountId,
            accountName: acc.accountName ?? null,
            locationName: loc.name,
            address:
              [...(loc.storefrontAddress?.addressLines ?? []), city].filter(Boolean).join(', ') || null,
            websiteUri: loc.websiteUri ?? null,
            mapsUri: loc.metadata?.mapsUri ?? null,
            placeId: loc.metadata?.placeId ?? null,
            canOperateLocalPost: canPost,
            scopes: granted,
          },
        })
      }
    }
    return out
  }

  private caps(publish: boolean): Capabilities {
    return {
      image: true,
      carousel: false,
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
    return this.caps(account.metadata.canOperateLocalPost !== false)
  }

  validatePost(input: NormalizedPost, account: AccountRef): ValidationResult {
    const problems = [...validateText('google_business', input.text).problems]
    if (!input.text.trim()) problems.push('Objava na Google poslovnom profilu mora imati tekst.')
    if (input.media.some((m) => m.mimeType.startsWith('video/')))
      problems.push('Google poslovni profil kroz API prima samo fotografije; uklonite video za ovaj nalog.')
    const photos = input.media.filter((m) => m.mimeType.startsWith('image/'))
    if (photos.length > 1) problems.push('Google poslovni profil prima jednu fotografiju po objavi.')
    for (const m of photos) {
      if (m.width && m.height && Math.min(m.width, m.height) < 250)
        problems.push('Fotografija za Google poslovni profil mora imati bar 250 px na kraćoj strani.')
      if (m.sizeBytes !== null && m.sizeBytes !== undefined && m.sizeBytes < 10_240)
        problems.push('Fotografija za Google poslovni profil mora imati bar 10 KB.')
    }
    if (account.metadata.canOperateLocalPost === false)
      problems.push('Google ne dozvoljava objave za ovu lokaciju (nije verifikovana ili je suspendovana).')
    problems.push(...gbpOptionProblems(readGbpOptions(input.options), input.link))
    return { ok: problems.length === 0, problems }
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const o = readGbpOptions(input.options)
    const photo = input.media.find((m) => m.mimeType.startsWith('image/'))
    const body: Record<string, unknown> = {
      languageCode: input.language ?? 'sr',
      summary: input.text,
      topicType: o.topicType,
    }
    if (photo) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: photoUrl(photo) }]
    // ponuda nema dugme (Google ga zanemaruje); poziv nema adresu
    if (o.topicType !== 'OFFER' && o.actionType !== 'NONE') {
      body.callToAction =
        o.actionType === 'CALL'
          ? { actionType: 'CALL' }
          : { actionType: o.actionType, url: o.ctaUrl ?? input.link }
    }
    if (o.topicType !== 'STANDARD' && o.eventStart && o.eventEnd) {
      const start = gbpDateTime(o.eventStart)
      const end = gbpDateTime(o.eventEnd)
      body.event = {
        title: o.eventTitle,
        schedule: { startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time },
      }
    }
    if (o.topicType === 'OFFER') {
      body.offer = {
        ...(o.couponCode ? { couponCode: o.couponCode } : {}),
        ...((o.redeemUrl ?? input.link) ? { redeemOnlineUrl: o.redeemUrl ?? input.link } : {}),
        ...(o.terms ? { termsConditions: o.terms } : {}),
      }
    }
    const post = await this.client(accessToken).post<LocalPost>(postsPath(account), body)
    if (post.state === 'REJECTED') {
      throw new ProviderError('CONTENT_REJECTED', {
        message: `Google je odbio objavu ${post.name} (pravila sadržaja).`,
        userMessage:
          'Google je odbio objavu zbog pravila sadržaja (npr. telefon ili link u tekstu). Izmenite tekst.',
      })
    }
    return { externalId: post.name, permalink: post.searchUrl ?? null, pending: null }
  }

  async getPublishStatus(handle: PollHandle): Promise<PublishStatus> {
    throw new ProviderError('NOT_SUPPORTED', { message: `Google poslovni profil nema ručku ${handle.kind}.` })
  }

  /** Posle pada: objava sa istim tekstom među poslednjim objavama lokacije. */
  async findExistingPost(
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
  ): Promise<string | null> {
    const res = await this.client(accessToken).get<{ localPosts?: LocalPost[] }>(
      `${postsPath(account)}?pageSize=10`,
    )
    const want = input.text.trim()
    return (res.localPosts ?? []).find((p) => (p.summary ?? '').trim() === want)?.name ?? null
  }

  async deletePost(externalId: string, accessToken: string): Promise<void> {
    await this.client(accessToken).delete(`${POSTS_API}/${externalId}`)
  }

  async fetchHistory(account: AccountRef, accessToken: string, limit: number): Promise<HistoricalPost[]> {
    const size = Math.min(Math.max(limit, 1), 100)
    const res = await this.client(accessToken).get<{ localPosts?: LocalPost[] }>(
      `${postsPath(account)}?pageSize=${size}`,
    )
    return (res.localPosts ?? []).slice(0, limit).map((p) => ({
      externalId: p.name,
      postType: (p.topicType ?? 'STANDARD').toLowerCase(),
      text: p.summary ?? null,
      media: (p.media ?? [])
        .map((m) => ({
          url: m.googleUrl ?? m.sourceUrl ?? '',
          type: (m.mediaFormat ?? 'PHOTO').toLowerCase(),
        }))
        .filter((m) => m.url),
      permalink: p.searchUrl ?? null,
      publishedAt: p.createTime ?? null,
      metrics: {},
    }))
  }

  /** Google ne daje metrike pojedinačnih objava (reportInsights ukinut 2023). */
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
      raw: { unavailable: 'gbp_post_insights' },
    }
  }

  /** Dnevne metrike lokacije: prikazi u pretrazi i mapama, klikovi na sajt, pozivi, putanje, poruke. */
  async fetchAccountMetrics(account: AccountRef, accessToken: string, date: string): Promise<AccountMetrics> {
    const [y, m, d] = date.split('-').map(Number)
    const u = new URL(`${PERF_API}/locations/${account.externalId}:fetchMultiDailyMetricsTimeSeries`)
    for (const metric of [...IMPRESSIONS, ...ACTIONS]) u.searchParams.append('dailyMetrics', metric)
    for (const [k, v] of [
      ['dailyRange.start_date.year', y],
      ['dailyRange.start_date.month', m],
      ['dailyRange.start_date.day', d],
      ['dailyRange.end_date.year', y],
      ['dailyRange.end_date.month', m],
      ['dailyRange.end_date.day', d],
    ] as const)
      u.searchParams.set(k, String(v))
    const res = await this.client(accessToken).get<{
      multiDailyMetricTimeSeries?: Array<{
        dailyMetricTimeSeries?: Array<{
          dailyMetric?: string
          timeSeries?: { datedValues?: Array<{ value?: string }> }
        }>
      }>
    }>(u.toString())
    const values: Record<string, number> = {}
    for (const group of res.multiDailyMetricTimeSeries ?? [])
      for (const s of group.dailyMetricTimeSeries ?? []) {
        if (!s.dailyMetric) continue
        // vrednost izostaje kad je nula
        const total = (s.timeSeries?.datedValues ?? []).reduce((sum, v) => sum + Number(v.value ?? 0), 0)
        values[s.dailyMetric] = (values[s.dailyMetric] ?? 0) + total
      }
    const sum = (keys: readonly string[]) => keys.reduce((n, k) => n + (values[k] ?? 0), 0)
    return {
      date,
      followers: null,
      reach: null,
      impressions: sum(IMPRESSIONS),
      engagement: sum(ACTIONS),
      profileViews: null,
      websiteClicks: values.WEBSITE_CLICKS ?? 0,
      raw: values as unknown as Record<string, Json>,
    }
  }

  revoke(tokens: TokenSet): Promise<void> {
    return googleRevoke(tokens, this.fetchImpl)
  }
}
