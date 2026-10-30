import 'server-only'

import { PLATFORMS, validateText } from '@/config/platforms'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { aspectFits, aspectLabel } from '@/lib/media/crop'
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
  // uvidi stranica i objava (D-089)
  'read_insights',
] as const

const PUBLISH_TASKS = new Set(['CREATE_CONTENT', 'MANAGE'])
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime'])
const IG_REEL_MIN_MS = 3_000
const IG_REEL_MAX_MS = 15 * 60_000
const IG_REEL_MAX_BYTES = 300 * 1024 * 1024
// video u karuselu: tekuća dokumentacija ne navodi ograničenja, važe ranija (60 s, 100 MB)
const IG_CAROUSEL_VIDEO_MAX_MS = 60_000
const IG_CAROUSEL_VIDEO_MAX_BYTES = 100 * 1024 * 1024
const FB_VIDEO_MAX_MS = 20 * 60_000
const FB_VIDEO_MAX_BYTES = 1024 ** 3

const isVideo = (m: NormalizedMedia) => m.mimeType.startsWith('video/')
// priča (D-107): jedna slika ili video od 3 do 60 s, bez opisa; vrsta dolazi iz `post_targets.options.format`
const STORY_VIDEO_MIN_MS = 3_000
const STORY_VIDEO_MAX_MS = 60_000
const isStory = (input: NormalizedPost) => input.options?.format === 'story'

/** Saradnici na Instagram objavi: niz korisničkih imena kao JSON (Graph API), najviše tri. */
function igCollaborators(options: NormalizedPost['options']): string | undefined {
  const raw = options?.collaborators
  if (!Array.isArray(raw)) return undefined
  const names = raw
    .filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(x))
    .slice(0, 3)
  return names.length ? JSON.stringify(names) : undefined
}

/** Facebook Reel: uspravan video (9:16, bar 540×960) od 3 do 90 s; ostalo ide kao običan video (D-089). */
export function isFacebookReel(m: NormalizedMedia): boolean {
  if (!m.width || !m.height || !m.durationMs) return false
  return (
    m.width / m.height <= 0.6 &&
    m.width >= 540 &&
    m.height >= 960 &&
    m.durationMs >= 3_000 &&
    m.durationMs <= 90_000
  )
}

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

/** `status` IG kontejnera u stanju ERROR nosi podkod greške; korisnik dobija razumljiv razlog. */
export function igStatusMessage(status: string | undefined): string {
  const s = status ?? ''
  if (s.includes('2207026'))
    return 'Instagram ne prihvata format videa. Sačuvajte ga kao MP4 (H.264) pa pokušajte ponovo.'
  if (s.includes('2207052') || s.includes('9004'))
    return 'Instagram nije uspeo da preuzme medij. Pokušajte ponovo.'
  if (s.includes('2207020')) return 'Medij je istekao pre objave. Pokušajte ponovo.'
  if (s.includes('2207053'))
    return 'Instagram nije uspeo da obradi video. Pokušajte ponovo ili sačuvajte video kao MP4.'
  return s ? `Instagram je odbio medij (${s}).` : 'Instagram je odbio medij.'
}

/** Sačuvano telo zahteva (JSON) → parametri Graph poziva. */
function graphParams(body: Record<string, Json>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(body))
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
  return out
}

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

  private client(token: string | null, host?: string): GraphClient {
    return new GraphClient(token, { version: env.META_GRAPH_VERSION, fetchImpl: this.fetchImpl, host })
  }

  static isConfigured(): boolean {
    return Boolean(env.META_APP_ID && env.META_APP_SECRET)
  }

  getAuthUrl(ctx: { state: string; redirectUri: string; extraScopes?: readonly string[] }): string {
    const u = new URL(`https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth`)
    u.searchParams.set('client_id', env.META_APP_ID ?? '')
    u.searchParams.set('redirect_uri', ctx.redirectUri)
    u.searchParams.set('state', ctx.state)
    u.searchParams.set('response_type', 'code')
    if (env.META_LOGIN_CONFIG_ID) u.searchParams.set('config_id', env.META_LOGIN_CONFIG_ID)
    // sa konfiguracijom prijave (Facebook Login for Business) dozvole su u Meta podešavanjima, ne u URL-u
    else u.searchParams.set('scope', [...META_SCOPES, ...(ctx.extraScopes ?? [])].join(','))
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
      video: true,
      reels: true,
      stories: true,
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
      video: true,
      reels: true,
      stories: true,
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
    if (isStory(input)) return this.storyProblems(input)
    const text = validateText(platform, input.text)
    const problems = [...text.problems]
    if (input.media.length > c.imageMaxPerPost)
      problems.push(`${c.label} dozvoljava najviše ${c.imageMaxPerPost} slika ili videa po objavi.`)
    problems.push(...this.videoProblems(platform, input.media))
    for (const m of input.media) {
      if (isVideo(m)) continue
      if (!c.imageMime.includes(m.mimeType))
        problems.push(
          `${c.label} prihvata ${c.imageMime.map((x) => x.split('/')[1]!.toUpperCase()).join(', ')}; „${m.mimeType}” nije podržan.`,
        )
      if (m.width && m.height) {
        const ratio = m.width / m.height
        if (!aspectFits(ratio, c.imageAspect)) {
          problems.push(
            `Odnos stranica ${aspectLabel(ratio)} je van opsega od ${aspectLabel(c.imageAspect.min)} do ${aspectLabel(c.imageAspect.max)} za ${c.label}.`,
          )
        }
      }
    }
    if (platform === 'instagram' && input.media.length === 0)
      problems.push('Instagram objava mora imati bar jednu sliku ili video.')
    if (platform === 'instagram' && input.link)
      problems.push('Instagram ne podržava klikabilan link u objavi; link ide u bio ili prvi komentar.')
    return { ok: problems.length === 0, problems }
  }

  /** Priča nema opis ni link, pa se proverava samo medij; uspravan odnos Meta sama uklapa. */
  private storyProblems(input: NormalizedPost): ValidationResult {
    const problems: string[] = []
    // više slajdova priče se objavljuje redom, kao niz priča; video ide samo pojedinačno (D-108)
    if (input.media.length < 1 || input.media.length > 10)
      problems.push('Priča ima od jedne do deset slika, ili jedan video.')
    else if (input.media.length > 1 && input.media.some(isVideo))
      problems.push('Video u priči ide sam, bez drugih slajdova.')
    const m = input.media[0]
    if (m && isVideo(m)) {
      if (!VIDEO_MIME.has(m.mimeType)) problems.push('Meta prihvata video u formatu MP4 ili MOV.')
      if (m.durationMs && (m.durationMs < STORY_VIDEO_MIN_MS || m.durationMs > STORY_VIDEO_MAX_MS))
        problems.push('Video u priči traje od 3 do 60 sekundi.')
    } else if (m && !['image/jpeg', 'image/png'].includes(m.mimeType)) {
      problems.push('Slika u priči mora biti JPG ili PNG.')
    }
    return { ok: problems.length === 0, problems }
  }

  /** Jedan video na Facebook-u (Reel ili običan), Reel ili video u karuselu na Instagramu (D-089). */
  private videoProblems(platform: string, media: NormalizedMedia[]): string[] {
    const videos = media.filter(isVideo)
    if (!videos.length) return []
    const problems: string[] = []
    if (videos.some((v) => !VIDEO_MIME.has(v.mimeType)))
      problems.push('Meta prihvata video u formatu MP4 ili MOV.')
    if (platform === 'facebook') {
      const v = videos[0]!
      if (videos.length > 1) problems.push('Facebook objava može imati jedan video.')
      if (media.length > videos.length) problems.push('Facebook ne meša slike i video u istoj objavi.')
      if (v.durationMs && v.durationMs > FB_VIDEO_MAX_MS)
        problems.push('Video na Facebook-u može trajati najviše 20 minuta.')
      if (v.sizeBytes && v.sizeBytes > FB_VIDEO_MAX_BYTES)
        problems.push('Video na Facebook-u može imati najviše 1 GB.')
      return problems
    }
    if (media.length === 1) {
      const v = videos[0]!
      if (v.durationMs && (v.durationMs < IG_REEL_MIN_MS || v.durationMs > IG_REEL_MAX_MS))
        problems.push('Instagram Reel traje od 3 sekunde do 15 minuta.')
      if (v.sizeBytes && v.sizeBytes > IG_REEL_MAX_BYTES)
        problems.push('Instagram Reel može imati najviše 300 MB.')
      return problems
    }
    if (videos.some((v) => v.durationMs && v.durationMs > IG_CAROUSEL_VIDEO_MAX_MS))
      problems.push('Video u Instagram karuselu može trajati najviše 60 sekundi.')
    if (videos.some((v) => v.sizeBytes && v.sizeBytes > IG_CAROUSEL_VIDEO_MAX_BYTES))
      problems.push('Video u Instagram karuselu može imati najviše 100 MB.')
    return problems
  }

  async publish(input: NormalizedPost, account: AccountRef, accessToken: string): Promise<PublishResult> {
    const g = this.client(accessToken)
    if (isStory(input)) return this.publishStory(g, input, account, accessToken)
    if (account.platform === 'facebook') {
      const video = input.media.find(isVideo)
      if (video) return this.publishFacebookVideo(input, account, accessToken, video)
      return this.publishFacebook(g, input, account)
    }
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
    if (input.firstComment) await this.comment(g, postId, input.firstComment)
    return { externalId: postId, permalink: `https://www.facebook.com/${postId}`, pending: null }
  }

  /**
   * Priča (D-107). Instagram: kontejner `media_type: STORIES` pa `media_publish`, video kroz proveru
   * statusa. Facebook stranica: slika se otpremi neobjavljena pa ide u `photo_stories`, a video kroz
   * `video_stories` (start, bajtovi na rupload, finish). Priča nema opis ni prvi komentar.
   */
  private async publishStory(
    g: GraphClient,
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
  ): Promise<PublishResult> {
    const m = input.media[0]
    if (!m) throw new ProviderError('CONTENT_REJECTED', { userMessage: 'Priča mora imati sliku ili video.' })
    const id = account.externalId
    if (input.media.length > 1) return this.publishStorySequence(g, input.media, account)
    if (account.platform === 'instagram') {
      const r = await g.post<{ id: string }>(
        `${id}/media`,
        isVideo(m)
          ? { media_type: 'STORIES', video_url: m.url }
          : { media_type: 'STORIES', image_url: m.url },
      )
      if (isVideo(m))
        return {
          externalId: null,
          permalink: null,
          pending: { kind: 'ig_container', containerId: r.id, accountExternalId: id, firstComment: null },
        }
      return this.finishContainer(g, id, r.id, null)
    }
    if (isVideo(m)) {
      const start = await g.post<{ video_id: string }>(`${id}/video_stories`, { upload_phase: 'start' })
      await this.rupload(start.video_id, await this.download(m), accessToken)
      const done = await g.post<{ post_id?: string }>(`${id}/video_stories`, {
        upload_phase: 'finish',
        video_id: start.video_id,
      })
      const postId = done.post_id ?? start.video_id
      return { externalId: postId, permalink: `https://www.facebook.com/${postId}`, pending: null }
    }
    const photo = await g.post<{ id: string }>(`${id}/photos`, { url: m.url, published: false })
    const story = await g.post<{ post_id?: string }>(`${id}/photo_stories`, { photo_id: photo.id })
    const postId = story.post_id ?? photo.id
    return { externalId: postId, permalink: `https://www.facebook.com/${postId}`, pending: null }
  }

  /** Više slika priče jedna za drugom; rezultat je poslednja priča u nizu (D-108). */
  private async publishStorySequence(
    g: GraphClient,
    media: NormalizedMedia[],
    account: AccountRef,
  ): Promise<PublishResult> {
    const id = account.externalId
    let last: PublishResult | null = null
    for (const m of media) {
      if (account.platform === 'instagram') {
        const r = await g.post<{ id: string }>(`${id}/media`, { media_type: 'STORIES', image_url: m.url })
        last = await this.finishContainer(g, id, r.id, null)
      } else {
        const photo = await g.post<{ id: string }>(`${id}/photos`, { url: m.url, published: false })
        const story = await g.post<{ post_id?: string }>(`${id}/photo_stories`, { photo_id: photo.id })
        const postId = story.post_id ?? photo.id
        last = { externalId: postId, permalink: `https://www.facebook.com/${postId}`, pending: null }
      }
    }
    return last!
  }

  /**
   * Facebook video (D-089): Reel kroz `video_reels` (bajtovi idu na rupload, pa ne zavisi od robots.txt
   * skladišta), ostalo kroz `/videos` sa `file_url`. Objava se završava kad Facebook obradi video.
   */
  private async publishFacebookVideo(
    input: NormalizedPost,
    account: AccountRef,
    accessToken: string,
    video: NormalizedMedia,
  ): Promise<PublishResult> {
    const page = account.externalId
    const g = this.client(accessToken)
    const firstComment = input.firstComment?.trim() || null
    const text =
      input.link && !input.text.includes(input.link) ? `${input.text}\n\n${input.link}` : input.text
    if (isFacebookReel(video)) {
      const start = await g.post<{ video_id: string }>(`${page}/video_reels`, { upload_phase: 'start' })
      await this.rupload(start.video_id, await this.download(video), accessToken)
      await g.post(`${page}/video_reels`, {
        upload_phase: 'finish',
        video_id: start.video_id,
        video_state: 'PUBLISHED',
        description: text,
      })
      return {
        externalId: null,
        permalink: null,
        pending: {
          kind: 'fb_video',
          videoId: start.video_id,
          reel: true,
          firstComment,
          accountExternalId: page,
        },
      }
    }
    const r = await this.client(accessToken, 'graph-video.facebook.com').post<{ id: string }>(
      `${page}/videos`,
      {
        // potpisan link skladišta (24 h): javna ruta drži ceo fajl u memoriji i nije za video
        file_url: video.url,
        description: text,
        title: input.title?.slice(0, 255) || undefined,
      },
    )
    return {
      externalId: null,
      permalink: null,
      pending: { kind: 'fb_video', videoId: r.id, reel: false, firstComment, accountExternalId: page },
    }
  }

  private async download(media: NormalizedMedia): Promise<Buffer> {
    let res: Response
    try {
      res = await (this.fetchImpl ?? fetch)(media.url, { signal: AbortSignal.timeout(120_000) })
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
        userMessage: 'Video više nije dostupan u biblioteci. Dodajte ga ponovo.',
      })
    return Buffer.from(await res.arrayBuffer())
  }

  /** Upload bajtova Reela u jednom zahtevu (`offset: 0`, `file_size`). */
  private async rupload(videoId: string, bytes: Buffer, accessToken: string): Promise<void> {
    let res: Response
    try {
      res = await (this.fetchImpl ?? fetch)(
        `https://rupload.facebook.com/video-upload/${env.META_GRAPH_VERSION}/${videoId}`,
        {
          method: 'POST',
          headers: {
            authorization: `OAuth ${accessToken}`,
            offset: '0',
            file_size: String(bytes.length),
            'content-type': 'application/octet-stream',
          },
          body: new Uint8Array(bytes),
          signal: AbortSignal.timeout(300_000),
        },
      )
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'Upload videa na Facebook je prekinut.',
        raw: error,
        retryable: true,
      })
    }
    const body = (await res.json().catch(() => null)) as {
      success?: boolean
      debug_info?: { type?: string; message?: string }
    } | null
    if (!res.ok || !body?.success)
      throw new ProviderError('MEDIA_REJECTED', {
        message: `rupload ${res.status}: ${body?.debug_info?.type ?? ''} ${body?.debug_info?.message ?? ''}`,
        raw: body,
        userMessage: 'Facebook nije primio video. Sačuvajte ga kao MP4 (H.264) pa pokušajte ponovo.',
      })
  }

  /** Status videa: `video_status` i faze obrade i objave (Reels i običan video isto). */
  private async facebookVideoStatus(
    g: GraphClient,
    handle: Extract<PollHandle, { kind: 'fb_video' }>,
  ): Promise<PublishStatus> {
    const v = await g.get<{
      status?: {
        video_status?: string
        processing_phase?: { status?: string; error?: { message?: string } }
        publishing_phase?: { status?: string; publish_status?: string }
      }
    }>(handle.videoId, { fields: 'status' })
    const s = v.status ?? {}
    const failed =
      s.video_status === 'error' ||
      s.video_status === 'upload_failed' ||
      s.processing_phase?.status === 'error' ||
      s.publishing_phase?.status === 'error' ||
      s.publishing_phase?.publish_status === 'error'
    if (failed) {
      const reason = s.processing_phase?.error?.message
      return {
        state: 'failed',
        message: `Facebook nije obradio video${reason ? ` (${reason})` : ''}. Sačuvajte ga kao MP4 (H.264) pa pokušajte ponovo.`,
        retryable: false,
      }
    }
    if (s.video_status === 'expired')
      return { state: 'failed', message: 'Facebook upload je istekao. Pokušajte ponovo.', retryable: true }
    const publishing = s.publishing_phase?.status ?? 'complete'
    const done =
      s.publishing_phase?.publish_status === 'published' ||
      (s.video_status === 'ready' && (publishing === 'complete' || publishing === 'completed'))
    if (!done) return { state: 'pending' }
    let permalink = handle.reel
      ? `https://www.facebook.com/reel/${handle.videoId}`
      : `https://www.facebook.com/${handle.accountExternalId}/videos/${handle.videoId}`
    if (!handle.reel) {
      try {
        const p = await g.get<{ permalink_url?: string }>(handle.videoId, { fields: 'permalink_url' })
        if (p.permalink_url)
          permalink = p.permalink_url.startsWith('http')
            ? p.permalink_url
            : `https://www.facebook.com${p.permalink_url}`
      } catch {
        // ostaje sastavljen link
      }
    }
    if (handle.firstComment) await this.comment(g, handle.videoId, handle.firstComment)
    return { state: 'published', externalId: handle.videoId, permalink }
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
    const firstComment = input.firstComment?.trim() || null
    const aiFlag = input.isAiGenerated ? true : undefined
    // saradnici (do tri Instagram naloga) dobijaju poziv da objava bude i na njihovom profilu (D-108)
    const collaborators = igCollaborators(input.options)
    if (input.media.length === 1) {
      const m = input.media[0]!
      if (isVideo(m)) {
        // Reel se obrađuje i do nekoliko minuta, pa se objava završava kroz proveru statusa
        const r = await g.post<{ id: string }>(`${ig}/media`, {
          media_type: 'REELS',
          video_url: m.url,
          caption: input.text,
          share_to_feed: true,
          is_ai_generated: aiFlag,
          collaborators,
        })
        return {
          externalId: null,
          permalink: null,
          pending: { kind: 'ig_container', containerId: r.id, accountExternalId: ig, firstComment },
        }
      }
      const r = await g.post<{ id: string }>(`${ig}/media`, {
        image_url: m.url,
        caption: input.text,
        alt_text: m.alt ?? undefined,
        is_ai_generated: aiFlag,
        collaborators,
      })
      return this.finishContainer(g, ig, r.id, firstComment)
    }
    const children: string[] = []
    for (const m of input.media.slice(0, 20)) {
      const r = await g.post<{ id: string }>(
        `${ig}/media`,
        isVideo(m)
          ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: true }
          : { image_url: m.url, is_carousel_item: true, alt_text: m.alt ?? undefined },
      )
      children.push(r.id)
    }
    const carousel: Record<string, string | boolean> = {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: input.text,
      ...(aiFlag ? { is_ai_generated: true } : {}),
      ...(collaborators ? { collaborators } : {}),
    }
    // karusel sa videom se pravi tek kad Instagram obradi svaki deo
    if (input.media.some(isVideo))
      return {
        externalId: null,
        permalink: null,
        pending: {
          kind: 'ig_carousel_items',
          itemIds: children,
          carousel,
          firstComment,
          accountExternalId: ig,
        },
      }
    const r = await g.post<{ id: string }>(`${ig}/media`, carousel)
    return this.finishContainer(g, ig, r.id, firstComment)
  }

  /** Kratko čekanje kontejnera; ako obrada traje, objava se završava kroz proveru statusa. */
  private async finishContainer(
    g: GraphClient,
    ig: string,
    containerId: string,
    firstComment: string | null,
  ): Promise<PublishResult> {
    const state = await this.waitForContainer(g, containerId)
    if (state === 'IN_PROGRESS')
      return {
        externalId: null,
        permalink: null,
        pending: { kind: 'ig_container', containerId, accountExternalId: ig, firstComment },
      }
    return { ...(await this.publishContainer(g, ig, containerId, firstComment)), pending: null }
  }

  private async publishContainer(
    g: GraphClient,
    ig: string,
    containerId: string,
    firstComment: string | null,
  ): Promise<{ externalId: string; permalink: string | null }> {
    const published = await g.post<{ id: string }>(`${ig}/media_publish`, { creation_id: containerId })
    let permalink: string | null = null
    try {
      permalink =
        (await g.get<{ permalink?: string }>(published.id, { fields: 'permalink' })).permalink ?? null
    } catch {
      permalink = null
    }
    if (firstComment) await this.comment(g, published.id, firstComment)
    return { externalId: published.id, permalink }
  }

  /** Prvi komentar: neuspeh se beleži i ne obara objavu. */
  private async comment(g: GraphClient, objectId: string, message: string): Promise<void> {
    try {
      await g.post(`${objectId}/comments`, { message })
    } catch (error) {
      logger.warn('meta_first_comment_failed', { postId: objectId, error })
    }
  }

  async getPublishStatus(handle: PollHandle, accessToken: string): Promise<PublishStatus> {
    const g = this.client(accessToken)
    if (handle.kind === 'ig_container') {
      const s = await g.get<{ status_code?: string; status?: string }>(handle.containerId, {
        fields: 'status_code,status',
      })
      const code = s.status_code ?? 'IN_PROGRESS'
      if (code === 'IN_PROGRESS') return { state: 'pending' }
      if (code === 'ERROR') return { state: 'failed', message: igStatusMessage(s.status), retryable: false }
      if (code === 'EXPIRED')
        return { state: 'failed', message: 'Instagram kontejner je istekao.', retryable: true }
      const done = await this.publishContainer(
        g,
        handle.accountExternalId,
        handle.containerId,
        handle.firstComment ?? null,
      )
      return { state: 'published', ...done }
    }
    if (handle.kind === 'ig_carousel_items') {
      const items = await Promise.all(
        handle.itemIds.map((id) =>
          g.get<{ status_code?: string; status?: string }>(id, { fields: 'status_code,status' }),
        ),
      )
      const bad = items.find((s) => s.status_code === 'ERROR' || s.status_code === 'EXPIRED')
      if (bad) return { state: 'failed', message: igStatusMessage(bad.status), retryable: false }
      if (items.some((s) => s.status_code !== 'FINISHED')) return { state: 'pending' }
      const r = await g.post<{ id: string }>(
        `${handle.accountExternalId}/media`,
        graphParams(handle.carousel),
      )
      const result = await this.finishContainer(g, handle.accountExternalId, r.id, handle.firstComment)
      if (result.pending) return { state: 'pending', next: result.pending }
      return { state: 'published', externalId: result.externalId!, permalink: result.permalink }
    }
    if (handle.kind === 'fb_video') return this.facebookVideoStatus(g, handle)
    throw new ProviderError('NOT_SUPPORTED', { message: `Meta ne obrađuje ručku ${handle.kind}.` })
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
      // ID objave je `{stranica}_{objava}`; video i Reel imaju samo broj (D-089)
      if (!externalId.includes('_')) return this.facebookVideoMetrics(g, externalId)
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
        // post_impressions* su ugašeni (zamena: post_media_view i post_total_media_view_unique), post_engaged_users više ne postoji
        await readInsights('post_media_view,post_total_media_view_unique,post_clicks')
      } catch (error) {
        logger.warn('meta_post_insights_failed', { externalId, error })
      }
      return {
        impressions: values.post_media_view ?? null,
        reach: values.post_total_media_view_unique ?? null,
        likes: values.likes ?? null,
        comments: values.comments ?? null,
        shares: values.shares ?? null,
        saves: null,
        clicks: values.post_clicks ?? null,
        engagement: (values.likes ?? 0) + (values.comments ?? 0) + (values.shares ?? 0),
        raw,
      }
    }
    const basic = await g.get<{ like_count?: number; comments_count?: number; media_product_type?: string }>(
      externalId,
      { fields: 'like_count,comments_count,media_product_type' },
    )
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
      videoViews: basic.media_product_type === 'REELS' ? (values.views ?? null) : null,
      raw,
    }
  }

  /** Facebook video i Reel: lajkovi i komentari sa videa, pregledi iz `video_insights` (Reel ili video). */
  private async facebookVideoMetrics(g: GraphClient, videoId: string): Promise<NormalizedMetrics> {
    const raw: Record<string, Json> = {}
    let likes: number | null = null
    let comments: number | null = null
    try {
      const basic = await g.get<{
        likes?: { summary?: { total_count?: number } }
        comments?: { summary?: { total_count?: number } }
      }>(videoId, { fields: 'likes.summary(true),comments.summary(true)' })
      likes = basic.likes?.summary?.total_count ?? 0
      comments = basic.comments?.summary?.total_count ?? 0
    } catch (error) {
      logger.warn('meta_video_basic_failed', { videoId, error })
    }
    const read = async (metrics: string): Promise<Record<string, number>> => {
      const r = await g.get<{ data?: Array<{ name: string; values?: Array<{ value?: number }> }> }>(
        `${videoId}/video_insights`,
        { metric: metrics, period: 'lifetime' },
      )
      const out: Record<string, number> = {}
      for (const d of r.data ?? []) {
        const v = d.values?.[0]?.value
        if (typeof v === 'number') out[d.name] = v
        raw[d.name] = v ?? null
      }
      return out
    }
    let v: Record<string, number> = {}
    try {
      v = await read('blue_reels_play_count,fb_reels_total_plays,post_video_avg_time_watched')
    } catch {
      try {
        v = await read('total_video_views,total_video_impressions,total_video_impressions_unique')
      } catch (error) {
        logger.warn('meta_video_insights_failed', { videoId, error })
      }
    }
    return {
      impressions: v.total_video_impressions ?? null,
      reach: v.total_video_impressions_unique ?? null,
      likes,
      comments,
      shares: null,
      saves: null,
      clicks: null,
      engagement: likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0),
      videoViews: v.blue_reels_play_count ?? v.total_video_views ?? null,
      raw,
    }
  }

  async fetchAccountMetrics(account: AccountRef, accessToken: string, date: string): Promise<AccountMetrics> {
    const g = this.client(accessToken)
    const raw: Record<string, Json> = {}
    const values: Record<string, number> = {}
    const since = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
    const until = since + 86_400
    // vrednost za dan: `values` (time_series) ili `total_value` (metrike koje drugo ne podržavaju)
    const read = async (metric: string, metricType?: 'total_value' | 'time_series') => {
      try {
        const r = await g.get<{
          data?: Array<{ name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }>
        }>(`${account.externalId}/insights`, { metric, period: 'day', since, until, metric_type: metricType })
        for (const d of r.data ?? []) {
          const v = d.total_value?.value ?? d.values?.[d.values.length - 1]?.value
          if (typeof v === 'number') values[d.name] = v
          raw[d.name] = v ?? null
        }
      } catch (error) {
        logger.warn('meta_account_insights_failed', { account: account.externalId, metric, error })
      }
    }
    if (account.platform === 'facebook') {
      // page_impressions_unique i page_fans su ugašeni; zamene su page_total_media_view_unique i page_follows
      await read('page_total_media_view_unique,page_media_view,page_post_engagements,page_follows')
      return {
        date,
        followers: values.page_follows ?? null,
        reach: values.page_total_media_view_unique ?? null,
        impressions: values.page_media_view ?? null,
        engagement: values.page_post_engagements ?? null,
        profileViews: null,
        raw,
      }
    }
    // Instagram: reach je time_series, ostale dnevne metrike samo total_value; profile_views više ne postoji
    await read('reach', 'time_series')
    await read('views,accounts_engaged,total_interactions', 'total_value')
    let followers: number | null = null
    try {
      const r = await g.get<{ followers_count?: number }>(account.externalId, { fields: 'followers_count' })
      if (typeof r.followers_count === 'number') followers = r.followers_count
    } catch {
      // nije kritično
    }
    return {
      date,
      followers,
      reach: values.reach ?? null,
      impressions: values.views ?? null,
      engagement: values.total_interactions ?? null,
      profileViews: null,
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
