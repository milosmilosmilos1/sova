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
      scope: gState.gbpScope,
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
]
