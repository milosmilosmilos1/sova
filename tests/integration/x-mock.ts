import { http, HttpResponse } from 'msw'

/**
 * MSW mock X API-ja v2 (OAuth 2.0 sa PKCE i jednokratnim refresh tokenom, users/me, objave, mediji v2:
 * slika jednim zahtevom, video kroz initialize/append/finalize i STATUS, metrike, istorija, opoziv) za
 * fazu 8d. Metrike koriste nova imena (`repost_count`), da parser trpi oba oblika (D-086).
 */
export const xState = {
  tokenRequests: [] as Array<{ form: Record<string, string>; authorization: string | null }>,
  refreshToken: 'xr-1',
  refreshSeq: 1,
  posts: [] as Array<Record<string, unknown>>,
  postSeq: 1000,
  imageUploads: [] as Array<{ category: string | null; size: number }>,
  metadata: [] as Array<Record<string, unknown>>,
  videoInits: [] as Array<Record<string, unknown>>,
  appends: [] as Array<{ id: string; segment: string | null; size: number }>,
  statusQueue: ['pending', 'succeeded'] as string[],
  statusPolls: 0,
  creditsDepleted: false,
  historyQueries: [] as string[],
  revokes: [] as Array<Record<string, string>>,
  deletes: [] as string[],
}

export function resetXState(): void {
  xState.tokenRequests = []
  xState.refreshToken = 'xr-1'
  xState.refreshSeq = 1
  xState.posts = []
  xState.imageUploads = []
  xState.metadata = []
  xState.videoInits = []
  xState.appends = []
  xState.statusQueue = ['pending', 'succeeded']
  xState.statusPolls = 0
  xState.creditsDepleted = false
  xState.historyQueries = []
  xState.revokes = []
  xState.deletes = []
}

const X = 'https://api.x.com/2'
const problem = (status: number, title: string, detail: string, type = 'about:blank') =>
  HttpResponse.json(
    { title, detail, type, status },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
const authed = (request: Request) => (request.headers.get('authorization') ?? '').startsWith('Bearer xa-')

export const xHandlers = [
  http.post(`${X}/oauth2/token`, async ({ request }) => {
    const form = Object.fromEntries(new URLSearchParams(await request.text()))
    xState.tokenRequests.push({ form, authorization: request.headers.get('authorization') })
    if (form.grant_type === 'refresh_token') {
      if (form.refresh_token !== xState.refreshToken)
        return HttpResponse.json(
          { error: 'invalid_request', error_description: 'Value passed for the token was invalid.' },
          { status: 400 },
        )
      xState.refreshSeq++
      xState.refreshToken = `xr-${xState.refreshSeq}`
      return HttpResponse.json({
        token_type: 'bearer',
        expires_in: 7200,
        access_token: `xa-refreshed-${xState.refreshSeq}`,
        refresh_token: xState.refreshToken,
        scope: 'tweet.read tweet.write users.read offline.access media.write',
      })
    }
    if (!form.code_verifier) return HttpResponse.json({ error: 'invalid_request' }, { status: 400 })
    return HttpResponse.json({
      token_type: 'bearer',
      expires_in: 7200,
      access_token: 'xa-1',
      refresh_token: xState.refreshToken,
      scope: 'tweet.read tweet.write users.read offline.access media.write',
    })
  }),
  http.post(`${X}/oauth2/revoke`, async ({ request }) => {
    xState.revokes.push(Object.fromEntries(new URLSearchParams(await request.text())))
    return HttpResponse.json({ revoked: true })
  }),
  http.get(`${X}/users/me`, ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    return HttpResponse.json({
      data: {
        id: '1500',
        name: 'Klima Servis',
        username: 'klimaservis',
        profile_image_url: 'https://pbs.twimg.com/profile_images/1/klima_normal.jpg',
        verified_type: 'none',
        public_metrics: { followers_count: 870, following_count: 12, post_count: 340 },
      },
    })
  }),
  http.post(`${X}/tweets`, async ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    if (xState.creditsDepleted)
      return problem(
        402,
        'Payment Required',
        'credits depleted',
        'https://api.x.com/2/problems/credits-depleted',
      )
    const body = (await request.json()) as Record<string, unknown>
    if (String(body.text ?? '').includes('DUPLIKAT'))
      return problem(403, 'Forbidden', 'You are not allowed to create a Tweet with duplicate content.')
    xState.posts.push(body)
    xState.postSeq++
    return HttpResponse.json(
      {
        data: {
          id: String(xState.postSeq),
          text: body.text,
          edit_history_post_ids: [String(xState.postSeq)],
        },
      },
      { status: 201 },
    )
  }),
  http.delete(`${X}/tweets/:id`, ({ request, params }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    xState.deletes.push(String(params.id))
    return HttpResponse.json({ data: { deleted: true } })
  }),
  http.get(`${X}/tweets`, ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',')
    return HttpResponse.json({
      data: ids.map((id) => ({
        id,
        text: 'objava',
        public_metrics: {
          repost_count: 3,
          reply_count: 4,
          like_count: 25,
          quote_count: 1,
          bookmark_count: 2,
          impression_count: 900,
        },
        non_public_metrics: { url_link_clicks: 12, user_profile_clicks: 5, engagements: 40 },
      })),
    })
  }),
  http.get(`${X}/users/:id/tweets`, ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    xState.historyQueries.push(new URL(request.url).search)
    const recent = xState.posts
      .map((p, i) => ({
        id: String(1001 + i),
        // X u odgovoru menja linkove u t.co
        text: String(p.text ?? '').replace(/https?:\/\/\S+/g, 'https://t.co/abc123'),
        created_at: new Date().toISOString(),
        public_metrics: {
          like_count: 2,
          reply_count: 1,
          retweet_count: 1,
          quote_count: 0,
          impression_count: 120,
        },
      }))
      .reverse()
    return HttpResponse.json({
      data: [...recent, { id: '900', text: 'Stara objava', created_at: '2026-09-01T10:00:00Z' }],
    })
  }),
  // ---------------------------------------------------------------- mediji v2
  http.post(`${X}/media/upload/initialize`, async ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    const body = (await request.json()) as Record<string, unknown>
    xState.videoInits.push(body)
    return HttpResponse.json({
      data: { id: `m-vid-${xState.videoInits.length}`, media_key: '7_1', expires_after_secs: 86400 },
    })
  }),
  http.post(`${X}/media/upload/:id/append`, async ({ request, params }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    const form = await request.formData()
    const chunk = form.get('media')
    xState.appends.push({
      id: String(params.id),
      segment: form.get('segment_index')?.toString() ?? null,
      size: chunk instanceof Blob ? chunk.size : 0,
    })
    return HttpResponse.json({ data: { expires_at: Math.floor(Date.now() / 1000) + 86400 } })
  }),
  http.post(`${X}/media/upload/:id/finalize`, ({ request, params }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    return HttpResponse.json({
      data: {
        id: String(params.id),
        media_key: '7_1',
        processing_info: { state: 'pending', check_after_secs: 1 },
      },
    })
  }),
  http.post(`${X}/media/upload`, async ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    const form = await request.formData()
    const media = form.get('media')
    xState.imageUploads.push({
      category: form.get('media_category')?.toString() ?? null,
      size: media instanceof Blob ? media.size : 0,
    })
    return HttpResponse.json({ data: { id: `m-img-${xState.imageUploads.length}`, media_key: '3_1' } })
  }),
  http.get(`${X}/media/upload`, ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    const u = new URL(request.url)
    if (u.searchParams.get('command') !== 'STATUS') return problem(400, 'Invalid Request', 'command')
    const state = xState.statusQueue[Math.min(xState.statusPolls, xState.statusQueue.length - 1)]!
    xState.statusPolls++
    return HttpResponse.json({
      data: {
        id: u.searchParams.get('media_id'),
        processing_info: { state, check_after_secs: 1, progress_percent: 50 },
      },
    })
  }),
  http.post(`${X}/media/metadata`, async ({ request }) => {
    if (!authed(request)) return problem(401, 'Unauthorized', 'Unauthorized')
    xState.metadata.push((await request.json()) as Record<string, unknown>)
    return HttpResponse.json({ data: { id: 'ok', associated_metadata: {} } })
  }),
]
