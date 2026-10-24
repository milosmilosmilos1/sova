import { http, HttpResponse } from 'msw'

/**
 * MSW mock Google OAuth-a i Google poslovnog profila (Account Management, Business Information,
 * My Business v4 localPosts, Performance API) za fazu 8c. Oblici odgovora prate dokumentaciju
 * pročitanu 24.10.2026 (vrednost metrike izostaje kad je nula, ime lokacije nema prefiks naloga).
 */
const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'

export const gState = {
  tokenRequests: [] as Record<string, string>[],
  revokes: [] as string[],
  refreshToken: 'g-refresh-1',
  refreshSeq: 0,
  /** scope koji Google vraća za `gbp-code` (granularni pristanak može da ga suzi) */
  gbpScope: `openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile ${GBP_SCOPE}`,
  posts: [] as Array<Record<string, unknown>>,
  postHeaders: [] as Array<Record<string, string>>,
  postFailuresLeft: 0,
  postSeq: 0,
  deletes: [] as string[],
  metricsQueries: [] as string[],
}

const YT_SCOPE =
  'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'

export const ytState = {
  inits: [] as Array<{ body: Record<string, unknown>; headers: Record<string, string> }>,
  uploads: [] as Array<{ contentType: string | null; size: number }>,
  /** uploadStatus redom za svaku proveru obrade; poslednji se ponavlja */
  statusQueue: ['uploaded', 'processed'] as string[],
  statusPolls: 0,
  rejectionReason: null as string | null,
  quotaExceeded: false,
  signupRequired: false,
  videoSeq: 0,
  videos: [] as Array<{ id: string; title: string; publishedAt: string }>,
}

export function resetYouTubeState(): void {
  ytState.inits = []
  ytState.uploads = []
  ytState.statusQueue = ['uploaded', 'processed']
  ytState.statusPolls = 0
  ytState.rejectionReason = null
  ytState.quotaExceeded = false
  ytState.signupRequired = false
  ytState.videos = []
}

export function resetGoogleState(): void {
  gState.tokenRequests = []
  gState.revokes = []
  gState.refreshToken = 'g-refresh-1'
  gState.refreshSeq = 0
  gState.posts = []
  gState.postHeaders = []
  gState.postFailuresLeft = 0
  gState.deletes = []
  gState.metricsQueries = []
}

const V4 = 'https://mybusiness.googleapis.com/v4'
const unauthorized = () =>
  HttpResponse.json(
    {
      error: {
        code: 401,
        message: 'Request had invalid authentication credentials.',
        status: 'UNAUTHENTICATED',
      },
    },
    { status: 401 },
  )
const authed = (request: Request) => (request.headers.get('authorization') ?? '').startsWith('Bearer g-token')

export const googleHandlers = [
  // ---------------------------------------------------------------- OAuth
  http.post('https://oauth2.googleapis.com/token', async ({ request }) => {
    const form = Object.fromEntries(new URLSearchParams(await request.text()))
    gState.tokenRequests.push(form)
    if (form.grant_type === 'refresh_token') {
      if (form.refresh_token !== gState.refreshToken)
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
          { status: 400 },
        )
      gState.refreshSeq++
      return HttpResponse.json({
        access_token: `g-token-refreshed-${gState.refreshSeq}`,
        expires_in: 3599,
        scope: gState.gbpScope,
        token_type: 'Bearer',
      })
    }
    if (form.code === 'bad-code')
      return HttpResponse.json({ error: 'invalid_grant', error_description: 'Bad Request' }, { status: 400 })
    return HttpResponse.json({
      access_token: 'g-token-1',
      expires_in: 3599,
      refresh_token: gState.refreshToken,
      scope: form.code === 'youtube-code' ? YT_SCOPE : gState.gbpScope,
      token_type: 'Bearer',
      id_token: 'eyJ.ignored.sig',
    })
  }),
  http.get('https://openidconnect.googleapis.com/v1/userinfo', ({ request }) => {
    if (!authed(request)) return unauthorized()
    return HttpResponse.json({ sub: '1098765432100', name: 'Milan Petrović', email: 'milan@example.com' })
  }),
  http.post('https://oauth2.googleapis.com/revoke', ({ request }) => {
    gState.revokes.push(new URL(request.url).searchParams.get('token') ?? '')
    return new HttpResponse(null, { status: 200 })
  }),

  // ---------------------------------------------------------------- nalozi i lokacije
  http.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', ({ request }) => {
    if (!authed(request)) return unauthorized()
    return HttpResponse.json({
      accounts: [
        { name: 'accounts/111', accountName: 'Klima Servis DOO', type: 'LOCATION_GROUP', role: 'OWNER' },
      ],
    })
  }),
  http.get(
    'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/111/locations',
    ({ request }) => {
      if (!authed(request)) return unauthorized()
      const u = new URL(request.url)
      if (!u.searchParams.get('readMask'))
        return HttpResponse.json(
          {
            error: {
              code: 400,
              message: 'Request contains an invalid argument.',
              status: 'INVALID_ARGUMENT',
            },
          },
          { status: 400 },
        )
      // dve strane, da provider prati nextPageToken
      if (u.searchParams.get('pageToken') !== 'p2') {
        return HttpResponse.json({
          locations: [
            {
              name: 'locations/9001',
              title: 'Klima Servis Novi Sad',
              storefrontAddress: { locality: 'Novi Sad', addressLines: ['Bulevar oslobođenja 1'] },
              websiteUri: 'https://tangerineseo.rs',
              metadata: {
                placeId: 'ChIJ-novi-sad',
                mapsUri: 'https://maps.google.com/?cid=9001',
                canOperateLocalPost: true,
              },
            },
          ],
          nextPageToken: 'p2',
        })
      }
      return HttpResponse.json({
        locations: [
          {
            name: 'locations/9002',
            title: 'Klima Servis Beograd',
            storefrontAddress: { locality: 'Beograd' },
            metadata: { canOperateLocalPost: false },
          },
        ],
      })
    },
  ),

  // ---------------------------------------------------------------- objave
  http.post(`${V4}/accounts/111/locations/:location/localPosts`, async ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    if (gState.postFailuresLeft > 0) {
      gState.postFailuresLeft--
      return HttpResponse.json(
        { error: { code: 503, message: 'The service is currently unavailable.', status: 'UNAVAILABLE' } },
        { status: 503 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    gState.posts.push(body)
    gState.postHeaders.push(Object.fromEntries(request.headers.entries()))
    gState.postSeq++
    const id = `lp-${gState.postSeq}`
    return HttpResponse.json({
      ...body,
      name: `accounts/111/locations/${String(params.location)}/localPosts/${id}`,
      state: String(body.summary ?? '').includes('ODBIJ') ? 'REJECTED' : 'LIVE',
      searchUrl: `https://local.google.com/place?id=${String(params.location)}&use=posts&lpsid=${id}`,
      createTime: new Date().toISOString(),
    })
  }),
  http.get(`${V4}/accounts/111/locations/:location/localPosts`, ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    return HttpResponse.json({
      localPosts: gState.posts.map((p, i) => ({
        name: `accounts/111/locations/${String(params.location)}/localPosts/lp-${i + 1}`,
        summary: p.summary,
        topicType: p.topicType,
        state: 'LIVE',
        searchUrl: `https://local.google.com/place?lpsid=lp-${i + 1}`,
        createTime: '2026-10-20T10:00:00Z',
        media: p.media
          ? [{ mediaFormat: 'PHOTO', googleUrl: 'https://lh3.googleusercontent.com/p/1' }]
          : undefined,
      })),
    })
  }),
  http.delete(`${V4}/accounts/111/locations/:location/localPosts/:post`, ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    gState.deletes.push(String(params.post))
    return HttpResponse.json({})
  }),

  // ---------------------------------------------------------------- metrike lokacije
  http.get(
    'https://businessprofileperformance.googleapis.com/v1/locations/9001\\:fetchMultiDailyMetricsTimeSeries',
    ({ request }) => {
      if (!authed(request)) return unauthorized()
      const u = new URL(request.url)
      gState.metricsQueries.push(u.search)
      const metrics = u.searchParams.getAll('dailyMetrics')
      const date = {
        year: Number(u.searchParams.get('dailyRange.start_date.year')),
        month: Number(u.searchParams.get('dailyRange.start_date.month')),
        day: Number(u.searchParams.get('dailyRange.start_date.day')),
      }
      const values: Record<string, string | undefined> = {
        BUSINESS_IMPRESSIONS_DESKTOP_MAPS: '12',
        BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: '30',
        BUSINESS_IMPRESSIONS_MOBILE_MAPS: '41',
        BUSINESS_IMPRESSIONS_MOBILE_SEARCH: undefined,
        WEBSITE_CLICKS: '5',
        CALL_CLICKS: '2',
        BUSINESS_DIRECTION_REQUESTS: undefined,
        MESSAGING_CLICKS: '1',
      }
      return HttpResponse.json({
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: metrics.map((m) => ({
              dailyMetric: m,
              timeSeries: { datedValues: [values[m] === undefined ? { date } : { date, value: values[m] }] },
            })),
          },
        ],
      })
    },
  ),
  // ---------------------------------------------------------------- YouTube
  http.get('https://www.googleapis.com/youtube/v3/channels', ({ request }) => {
    if (!authed(request)) return unauthorized()
    if (ytState.signupRequired)
      return HttpResponse.json(
        {
          error: {
            code: 401,
            message: 'Unauthorized',
            errors: [{ reason: 'youtubeSignupRequired', domain: 'youtube.header' }],
          },
        },
        { status: 401 },
      )
    return HttpResponse.json({
      items: [
        {
          id: 'UC-klima-servis',
          snippet: {
            title: 'Klima Servis TV',
            customUrl: '@klimaservis',
            thumbnails: { default: { url: 'https://yt3.ggpht.com/klima=s88' } },
          },
          statistics: {
            subscriberCount: '1530',
            hiddenSubscriberCount: false,
            viewCount: '98000',
            videoCount: '42',
          },
          contentDetails: { relatedPlaylists: { uploads: 'UU-klima-servis' } },
        },
      ],
    })
  }),
  http.post('https://www.googleapis.com/upload/youtube/v3/videos', async ({ request }) => {
    if (!authed(request)) return unauthorized()
    if (ytState.quotaExceeded)
      return HttpResponse.json(
        {
          error: {
            code: 403,
            message: 'The request cannot be completed because you have exceeded your quota.',
            errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota' }],
          },
        },
        { status: 403 },
      )
    const u = new URL(request.url)
    if (u.searchParams.get('uploadType') !== 'resumable') return HttpResponse.json({}, { status: 400 })
    ytState.inits.push({
      body: (await request.json()) as Record<string, unknown>,
      headers: Object.fromEntries(request.headers.entries()),
    })
    return new HttpResponse(null, {
      status: 200,
      headers: {
        location: `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=up-${ytState.inits.length}&part=snippet,status`,
      },
    })
  }),
  http.put('https://www.googleapis.com/upload/youtube/v3/videos', async ({ request }) => {
    if (!authed(request)) return unauthorized()
    const bytes = await request.arrayBuffer()
    ytState.uploads.push({ contentType: request.headers.get('content-type'), size: bytes.byteLength })
    const init = ytState.inits.at(-1)!.body as {
      snippet: { title: string }
      status: { privacyStatus: string }
    }
    ytState.videoSeq++
    const id = `vid-${ytState.videoSeq}`
    ytState.videos.unshift({ id, title: init.snippet.title, publishedAt: new Date().toISOString() })
    return HttpResponse.json(
      {
        id,
        snippet: init.snippet,
        status: { uploadStatus: 'uploaded', privacyStatus: init.status.privacyStatus },
      },
      { status: 201 },
    )
  }),
  http.get('https://www.googleapis.com/youtube/v3/videos', ({ request }) => {
    if (!authed(request)) return unauthorized()
    const u = new URL(request.url)
    const ids = (u.searchParams.get('id') ?? '').split(',').filter(Boolean)
    if ((u.searchParams.get('part') ?? '').includes('statistics'))
      return HttpResponse.json({
        items: ids
          .filter((id) => id !== 'vid-gone')
          .map((id) => ({
            id,
            statistics: { viewCount: '1200', likeCount: '80', commentCount: '7', favoriteCount: '0' },
          })),
      })
    const status = ytState.statusQueue[Math.min(ytState.statusPolls, ytState.statusQueue.length - 1)]!
    ytState.statusPolls++
    return HttpResponse.json({
      items: ids.map((id) => ({
        id,
        status: {
          uploadStatus: status,
          privacyStatus: 'public',
          ...(status === 'rejected' ? { rejectionReason: ytState.rejectionReason ?? 'duplicate' } : {}),
        },
        processingDetails: { processingStatus: status === 'processed' ? 'succeeded' : 'processing' },
      })),
    })
  }),
  http.get('https://www.googleapis.com/youtube/v3/playlistItems', ({ request }) => {
    if (!authed(request)) return unauthorized()
    if (new URL(request.url).searchParams.get('playlistId') !== 'UU-klima-servis')
      return HttpResponse.json(
        { error: { code: 404, errors: [{ reason: 'playlistNotFound' }] } },
        { status: 404 },
      )
    const old = [{ id: 'vid-old-1', title: 'Kako se čisti klima', publishedAt: '2026-09-01T10:00:00Z' }]
    return HttpResponse.json({
      items: [...ytState.videos, ...old].map((v) => ({
        snippet: {
          title: v.title,
          description: 'Opis videa',
          publishedAt: v.publishedAt,
          thumbnails: { high: { url: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` } },
          resourceId: { kind: 'youtube#video', videoId: v.id },
        },
        contentDetails: { videoId: v.id, videoPublishedAt: v.publishedAt },
      })),
    })
  }),
]
