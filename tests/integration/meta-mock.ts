import { http, HttpResponse } from 'msw'

/**
 * MSW mock Meta Graph API-ja (v26.0) za fazu 8a: OAuth razmena, /me, /me/accounts sa stranicama i
 * Instagram nalozima, istorija objava, objavljivanje (feed, photos, IG kontejner), insights, permissions.
 * Video (D-089): IG Reels i video u karuselu, Facebook Reels (video_reels + rupload) i video (/videos),
 * status obrade, video_insights; ugašene metrike vraćaju grešku kao pravi Graph API.
 */
export const metaState = {
  tokenExchanges: [] as Record<string, string>[],
  publishes: [] as Array<{ path: string; body: Record<string, string> }>,
  deletes: [] as string[],
  containerStatus: 'FINISHED' as 'FINISHED' | 'IN_PROGRESS' | 'ERROR' | 'EXPIRED',
  pageToken: 'page-token-1',
  userTokenValid: true,
  pagesVisible: true,
  codeValid: true,
  /** koliko sledećih POST /feed poziva vraća 500 (privremena greška) */
  feedFailuresLeft: 0,
  /** svaki medij se odbija (MEDIA_REJECTED) */
  mediaRejected: false,
  /** ID-jevi objava koje mreža više ne zna (code 100 / subcode 33) */
  goneIds: [] as string[],
  containers: {} as Record<string, Record<string, string>>,
  containerPolls: {} as Record<string, number>,
  /** koliko prvih provera video kontejner (REELS ili VIDEO) vraća IN_PROGRESS */
  videoProcessingPolls: 0,
  videoFinalStatus: 'FINISHED' as 'FINISHED' | 'ERROR',
  fbVideos: {} as Record<string, { reel: boolean; polls: number }>,
  fbVideoProcessingPolls: 0,
  fbVideoFails: false,
  ruploads: [] as Array<{
    videoId: string
    auth: string | null
    offset: string | null
    fileSize: string | null
    size: number
  }>,
}

export function resetMetaState(): void {
  metaState.tokenExchanges = []
  metaState.publishes = []
  metaState.deletes = []
  metaState.containerStatus = 'FINISHED'
  metaState.pageToken = 'page-token-1'
  metaState.userTokenValid = true
  metaState.pagesVisible = true
  metaState.codeValid = true
  metaState.feedFailuresLeft = 0
  metaState.mediaRejected = false
  metaState.goneIds = []
  metaState.containers = {}
  metaState.containerPolls = {}
  metaState.videoProcessingPolls = 0
  metaState.videoFinalStatus = 'FINISHED'
  metaState.fbVideos = {}
  metaState.fbVideoProcessingPolls = 0
  metaState.fbVideoFails = false
  metaState.ruploads = []
}

// ugašene metrike (Page Insights 15.6.2025 i 15.11.2025, IG impressions i profile_views): Graph vraća #100
const DEPRECATED_METRICS = new Set([
  'post_impressions',
  'post_impressions_unique',
  'post_engaged_users',
  'page_impressions_unique',
  'page_fans',
  'impressions',
  'profile_views',
])

const G = 'https://graph.facebook.com/:version'
const err = (code: number, message: string, status = 400, sub?: number) =>
  HttpResponse.json({ error: { message, type: 'OAuthException', code, error_subcode: sub } }, { status })

function token(request: Request): string | null {
  return new URL(request.url).searchParams.get('access_token')
}

export const metaHandlers = [
  http.get(`${G}/oauth/access_token`, ({ request }) => {
    const p = Object.fromEntries(new URL(request.url).searchParams)
    metaState.tokenExchanges.push(p)
    if (p.grant_type === 'fb_exchange_token') {
      if (!metaState.userTokenValid) return err(190, 'Error validating access token: Session has expired')
      return HttpResponse.json({
        access_token: `long-user-token-${metaState.tokenExchanges.length}`,
        token_type: 'bearer',
        expires_in: 5183944,
      })
    }
    if (p.code !== 'good-code' || !metaState.codeValid) return err(100, 'Invalid verification code format.')
    return HttpResponse.json({ access_token: 'short-user-token', token_type: 'bearer', expires_in: 5000 })
  }),
  http.get(`${G}/me`, ({ request }) => {
    const t = token(request)
    if (!t?.startsWith('long-user-token')) return err(190, 'Invalid OAuth access token')
    return HttpResponse.json({ id: 'fb-user-77', name: 'Test Korisnik' })
  }),
  http.get(`${G}/me/permissions`, () =>
    HttpResponse.json({
      data: ['pages_show_list', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'].map(
        (p) => ({ permission: p, status: 'granted' }),
      ),
    }),
  ),
  http.get(`${G}/me/accounts`, ({ request }) => {
    const t = token(request)
    if (!t?.startsWith('long-user-token')) return err(190, 'Invalid OAuth access token')
    if (!metaState.pagesVisible) return HttpResponse.json({ data: [] })
    return HttpResponse.json({
      data: [
        {
          id: 'page-1',
          name: 'Fixture Studio',
          username: 'fixturestudio',
          access_token: metaState.pageToken,
          tasks: ['ANALYZE', 'ADVERTISE', 'MODERATE', 'CREATE_CONTENT', 'MANAGE'],
          picture: { data: { url: 'https://scontent.xx.fbcdn.net/page1.jpg' } },
          followers_count: 1240,
          instagram_business_account: {
            id: 'ig-1',
            username: 'fixture.studio',
            name: 'Fixture Studio',
            profile_picture_url: 'https://scontent.cdninstagram.com/ig1.jpg',
            followers_count: 860,
          },
        },
        {
          id: 'page-2',
          name: 'Druga strana (samo čitanje)',
          access_token: 'page-token-2',
          tasks: ['ANALYZE'],
          picture: { data: { url: '' } },
        },
      ],
      paging: { cursors: { before: 'a', after: 'b' } },
    })
  }),
  http.delete(`${G}/:user/permissions`, () => HttpResponse.json({ success: true })),
  http.get(`${G}/page-1/posts`, ({ request }) => {
    if (!token(request)?.startsWith('page-token')) return err(190, 'Invalid OAuth access token')
    return HttpResponse.json({
      data: [
        {
          id: 'page-1_101',
          message: 'Prva objava sa sajta',
          created_time: '2026-10-01T10:00:00+0000',
          permalink_url: 'https://www.facebook.com/page-1/posts/101',
          full_picture: 'https://scontent.xx.fbcdn.net/p101.jpg',
          likes: { summary: { total_count: 12 } },
          comments: { summary: { total_count: 3 } },
          shares: { count: 1 },
        },
        {
          id: 'page-1_102',
          message: 'Druga objava',
          created_time: '2026-10-05T10:00:00+0000',
          permalink_url: 'https://www.facebook.com/page-1/posts/102',
          likes: { summary: { total_count: 4 } },
          comments: { summary: { total_count: 0 } },
        },
      ],
      paging: { cursors: { after: 'x' } },
    })
  }),
  http.get(`${G}/ig-1/media`, ({ request }) => {
    if (!token(request)?.startsWith('page-token')) return err(190, 'Invalid OAuth access token')
    return HttpResponse.json({
      data: [
        {
          id: 'ig-m-1',
          caption: 'Instagram objava 1',
          media_type: 'IMAGE',
          media_product_type: 'FEED',
          permalink: 'https://www.instagram.com/p/abc/',
          timestamp: '2026-10-02T09:00:00+0000',
          like_count: 50,
          comments_count: 7,
          media_url: 'https://scontent.cdninstagram.com/m1.jpg',
        },
      ],
    })
  }),
  http.post(`${G}/:target/feed`, async ({ request, params }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: `${String(params.target)}/feed`, body })
    if (metaState.feedFailuresLeft > 0) {
      metaState.feedFailuresLeft -= 1
      return err(2, 'Service temporarily unavailable', 500)
    }
    return HttpResponse.json({ id: `${String(params.target)}_${900 + metaState.publishes.length}` })
  }),
  http.post(`${G}/:target/photos`, async ({ request, params }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: `${String(params.target)}/photos`, body })
    if (metaState.mediaRejected || body.url?.includes('bad-image'))
      return err(100, 'Invalid image', 400, 2207003)
    const id = `${metaState.publishes.length}`
    return body.published === 'false'
      ? HttpResponse.json({ id: `photo-${id}` })
      : HttpResponse.json({ id: `photo-${id}`, post_id: `${String(params.target)}_photo-${id}` })
  }),
  http.post(`${G}/ig-1/media`, async ({ request }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: 'ig-1/media', body })
    if (metaState.mediaRejected || body.image_url?.includes('bad-image'))
      return err(9004, 'Only photo or video can be accepted as media type.')
    const id = `container-${metaState.publishes.length}`
    metaState.containers[id] = body
    return HttpResponse.json({ id })
  }),
  // Facebook Reel: start → rupload → finish
  http.post(`${G}/:page/video_reels`, async ({ request, params }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: `${String(params.page)}/video_reels`, body })
    if (body.upload_phase === 'start') {
      const id = `reel-${metaState.publishes.length}`
      metaState.fbVideos[id] = { reel: true, polls: 0 }
      return HttpResponse.json({
        video_id: id,
        upload_url: `https://rupload.facebook.com/video-upload/v26.0/${id}`,
      })
    }
    return HttpResponse.json({ success: true })
  }),
  http.post('https://rupload.facebook.com/video-upload/:version/:videoId', async ({ request, params }) => {
    const buf = await request.arrayBuffer()
    metaState.ruploads.push({
      videoId: String(params.videoId),
      auth: request.headers.get('authorization'),
      offset: request.headers.get('offset'),
      fileSize: request.headers.get('file_size'),
      size: buf.byteLength,
    })
    return HttpResponse.json({ success: true })
  }),
  http.post('https://graph-video.facebook.com/:version/:page/videos', async ({ request, params }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: `graph-video:${String(params.page)}/videos`, body })
    const id = `vid-${metaState.publishes.length}`
    metaState.fbVideos[id] = { reel: false, polls: 0 }
    return HttpResponse.json({ id })
  }),
  http.get(`${G}/:id/video_insights`, ({ request, params }) => {
    const id = String(params.id)
    const names = (new URL(request.url).searchParams.get('metric') ?? '').split(',')
    const reelMetric = names.some((n) => n.includes('reels'))
    if (id.startsWith('reel-') !== reelMetric)
      return err(100, '(#100) The value must be a valid insights metric')
    return HttpResponse.json({
      data: names.map((name, i) => ({ name, period: 'lifetime', values: [{ value: 300 + i }] })),
    })
  }),
  http.get(`${G}/:id`, ({ request, params }) => {
    const id = String(params.id)
    if (metaState.goneIds.includes(id))
      return err(100, `Unsupported get request. Object with ID '${id}' does not exist`, 400, 33)
    const fields = new URL(request.url).searchParams.get('fields') ?? ''
    if (id.startsWith('container-')) {
      const body = metaState.containers[id]
      if (body?.media_type === 'REELS' || body?.media_type === 'VIDEO') {
        const polls = (metaState.containerPolls[id] = (metaState.containerPolls[id] ?? 0) + 1)
        if (polls <= metaState.videoProcessingPolls)
          return HttpResponse.json({ id, status_code: 'IN_PROGRESS', status: 'In Progress' })
        if (metaState.videoFinalStatus === 'ERROR')
          return HttpResponse.json({
            id,
            status_code: 'ERROR',
            status: 'Error: Media upload has failed with error code 2207026',
          })
        return HttpResponse.json({ id, status_code: 'FINISHED', status: 'Finished: Media has been uploaded' })
      }
      return HttpResponse.json({
        id,
        status_code: metaState.containerStatus,
        status: metaState.containerStatus,
      })
    }
    const video = metaState.fbVideos[id]
    if (video && fields === 'status') {
      video.polls++
      if (metaState.fbVideoFails)
        return HttpResponse.json({
          id,
          status: {
            video_status: 'error',
            processing_phase: { status: 'error', error: { message: 'Unsupported video codec' } },
          },
        })
      if (video.polls <= metaState.fbVideoProcessingPolls)
        return HttpResponse.json({
          id,
          status: {
            video_status: 'processing',
            processing_phase: { status: 'in_progress' },
            publishing_phase: { status: 'not_started' },
          },
        })
      return HttpResponse.json({
        id,
        status: {
          video_status: 'ready',
          processing_phase: { status: 'complete' },
          publishing_phase: { status: 'complete', publish_status: 'published' },
        },
      })
    }
    if (fields.includes('permalink_url'))
      return HttpResponse.json({ id, permalink_url: `/page-1/videos/${id}/` })
    if (fields.includes('permalink'))
      return HttpResponse.json({ id, permalink: `https://www.instagram.com/p/${id}/` })
    if (fields.includes('like_count'))
      return HttpResponse.json({
        id,
        like_count: 5,
        comments_count: 1,
        media_product_type: id.startsWith('ig-reel') ? 'REELS' : 'FEED',
      })
    if ((id.startsWith('reel-') || id.startsWith('vid-')) && fields.includes('likes.summary'))
      return HttpResponse.json({
        id,
        likes: { summary: { total_count: 7 } },
        comments: { summary: { total_count: 2 } },
      })
    if (fields.includes('shares'))
      return HttpResponse.json({
        id,
        shares: { count: 2 },
        likes: { summary: { total_count: 9 } },
        comments: { summary: { total_count: 1 } },
      })
    if (fields.includes('followers_count')) return HttpResponse.json({ id, followers_count: 860 })
    return HttpResponse.json({ id })
  }),
  http.post(`${G}/ig-1/media_publish`, async ({ request }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: 'ig-1/media_publish', body })
    const reel = metaState.containers[body.creation_id ?? '']?.media_type === 'REELS'
    return HttpResponse.json({ id: `${reel ? 'ig-reel' : 'ig-post'}-${metaState.publishes.length}` })
  }),
  http.post(`${G}/:id/comments`, async ({ request, params }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: `${String(params.id)}/comments`, body })
    return HttpResponse.json({ id: `comment-${metaState.publishes.length}` })
  }),
  http.get(`${G}/:id/insights`, ({ request, params }) => {
    const url = new URL(request.url)
    const names = (url.searchParams.get('metric') ?? '').split(',')
    const id = String(params.id)
    if (metaState.goneIds.includes(id))
      return err(100, `Unsupported get request. Object with ID '${id}' does not exist`, 400, 33)
    if (names.some((n) => DEPRECATED_METRICS.has(n)))
      return err(100, '(#100) The value must be a valid insights metric')
    const totalValue = url.searchParams.get('metric_type') === 'total_value'
    return HttpResponse.json({
      data: names.map((name, i) => {
        const value = id.startsWith('ig') ? 100 + i : 200 + i
        return totalValue
          ? { name, period: 'day', total_value: { value } }
          : { name, period: 'lifetime', values: [{ value }] }
      }),
    })
  }),
  http.delete(`${G}/:id`, ({ params }) => {
    metaState.deletes.push(String(params.id))
    return HttpResponse.json({ success: true })
  }),
]
