import { http, HttpResponse } from 'msw'

/**
 * MSW mock LinkedIn API-ja (OAuth, userinfo, organizationAcls, Images, Posts, statistika) i TikTok
 * API-ja v2 (OAuth, user info, creator_info, foto i video objava, status, lista i upit videa) za
 * fazu 8b. Oblici odgovora prate dokumentaciju pročitanu 24.10.2026.
 */
export const liState = {
  tokenRequests: [] as Record<string, string>[],
  posts: [] as Array<{ body: Record<string, unknown>; headers: Record<string, string> }>,
  imageInits: 0,
  uploads: [] as Array<{ contentType: string | null; size: number; auth: string | null }>,
  deletes: [] as string[],
  scope:
    'openid,profile,email,w_member_social,rw_organization_admin,w_organization_social,r_organization_social,r_member_postAnalytics',
  refreshToken: null as string | null,
  postFailuresLeft: 0,
  postSeq: 0,
}

export const ttState = {
  tokenRequests: [] as Record<string, string>[],
  revokes: [] as string[],
  photoInits: [] as Array<Record<string, unknown>>,
  videoInits: [] as Array<Record<string, unknown>>,
  chunks: [] as Array<{ range: string | null; size: number }>,
  privacyOptions: ['PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'] as string[],
  commentDisabled: false,
  /** odgovori status/fetch redom; poslednji se ponavlja */
  /** odgovori status/fetch redom; poslednji se ponavlja. ID-jevi su int64 i šalju se kao brojevi u JSON-u */
  statusQueue: [] as Array<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>,
  refreshSeq: 1,
  publishSeq: 0,
}

export function resetLinkedInTikTokState(): void {
  liState.tokenRequests = []
  liState.posts = []
  liState.imageInits = 0
  liState.uploads = []
  liState.deletes = []
  liState.refreshToken = null
  liState.postFailuresLeft = 0
  ttState.tokenRequests = []
  ttState.revokes = []
  ttState.photoInits = []
  ttState.videoInits = []
  ttState.chunks = []
  ttState.privacyOptions = ['PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']
  ttState.commentDisabled = false
  ttState.statusQueue = []
}

const LI = 'https://api.linkedin.com'
const TT = 'https://open.tiktokapis.com'
const ok = <T>(data: T) => HttpResponse.json({ data, error: { code: 'ok', message: '', logid: 'log-1' } })

export const linkedInTikTokHandlers = [
  // ---------------------------------------------------------------- LinkedIn
  http.post('https://www.linkedin.com/oauth/v2/accessToken', async ({ request }) => {
    const form = Object.fromEntries(new URLSearchParams(await request.text()))
    liState.tokenRequests.push(form)
    if (form.code === 'bad-code')
      return HttpResponse.json(
        { error: 'invalid_request', error_description: 'authorization code not found' },
        { status: 401 },
      )
    if (form.grant_type === 'refresh_token' && form.refresh_token !== liState.refreshToken)
      return HttpResponse.json(
        { error: 'invalid_grant', error_description: 'refresh token expired' },
        { status: 400 },
      )
    return HttpResponse.json({
      access_token: form.grant_type === 'refresh_token' ? 'li-token-refreshed' : 'li-token-1',
      expires_in: 5_184_000,
      scope: liState.scope,
      ...(liState.refreshToken
        ? { refresh_token: liState.refreshToken, refresh_token_expires_in: 31_536_000 }
        : {}),
    })
  }),
  http.get(`${LI}/v2/userinfo`, ({ request }) => {
    if (request.headers.get('authorization') === 'Bearer li-expired')
      return HttpResponse.json(
        { status: 401, code: 'EXPIRED_ACCESS_TOKEN', message: 'The token used in the request has expired' },
        { status: 401 },
      )
    return HttpResponse.json({
      sub: 'li-member-1',
      name: 'Marko Marković',
      picture: 'https://media.licdn.test/p.jpg',
      email: 'marko@primer.rs',
    })
  }),
  http.get(`${LI}/rest/organizationAcls`, ({ request }) => {
    if (!request.headers.get('linkedin-version'))
      return HttpResponse.json({ status: 400, message: 'missing version' }, { status: 400 })
    return HttpResponse.json({
      elements: [
        {
          role: 'ADMINISTRATOR',
          state: 'APPROVED',
          organization: 'urn:li:organization:2414183',
          roleAssignee: 'urn:li:person:li-member-1',
        },
        {
          role: 'ANALYST',
          state: 'APPROVED',
          organization: 'urn:li:organization:999',
          roleAssignee: 'urn:li:person:li-member-1',
        },
      ],
      paging: { count: 100, start: 0, links: [] },
    })
  }),
  http.get(`${LI}/rest/organizations/:id`, ({ params }) =>
    HttpResponse.json({
      id: Number(params.id),
      localizedName: 'Klima servis d.o.o.',
      vanityName: 'klima-servis',
    }),
  ),
  http.get(`${LI}/rest/networkSizes/:urn`, () => HttpResponse.json({ firstDegreeSize: 321 })),
  http.post(`${LI}/rest/images`, ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('action') !== 'initializeUpload')
      return HttpResponse.json({ status: 400 }, { status: 400 })
    liState.imageInits++
    const id = `C4E10AQ${liState.imageInits}`
    return HttpResponse.json({
      value: {
        uploadUrl: `https://www.linkedin.com/dms-uploads/${id}/uploaded-image/0`,
        image: `urn:li:image:${id}`,
        uploadUrlExpiresAt: Date.now() + 3_600_000,
      },
    })
  }),
  http.put('https://www.linkedin.com/dms-uploads/:id/uploaded-image/0', async ({ request }) => {
    const buf = await request.arrayBuffer()
    liState.uploads.push({
      contentType: request.headers.get('content-type'),
      size: buf.byteLength,
      auth: request.headers.get('authorization'),
    })
    return new HttpResponse(null, { status: 201 })
  }),
  http.post(`${LI}/rest/posts`, async ({ request }) => {
    if (liState.postFailuresLeft > 0) {
      liState.postFailuresLeft--
      return HttpResponse.json({ status: 503, message: 'Service unavailable' }, { status: 503 })
    }
    const body = (await request.json()) as Record<string, unknown>
    liState.posts.push({ body, headers: Object.fromEntries(request.headers.entries()) })
    liState.postSeq++
    return new HttpResponse(null, {
      status: 201,
      headers: { 'x-restli-id': `urn:li:share:70000000000000000${liState.postSeq}` },
    })
  }),
  http.get(`${LI}/rest/posts`, ({ request }) => {
    const url = new URL(request.url)
    const author = url.searchParams.get('author')
    return HttpResponse.json({
      elements: liState.posts
        .filter((p) => p.body.author === author)
        .map((p, i) => ({
          id: `urn:li:share:70000000000000000${i + 1}`,
          commentary: p.body.commentary,
          publishedAt: Date.now() - 3_600_000,
          content: p.body.content,
        })),
      paging: { count: 10, start: 0, links: [] },
    })
  }),
  http.delete(`${LI}/rest/posts/:urn`, ({ params }) => {
    liState.deletes.push(decodeURIComponent(String(params.urn)))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(`${LI}/rest/organizationalEntityShareStatistics`, ({ request }) => {
    const url = new URL(request.url)
    const shares = /shares=List\(([^)]*)\)/.exec(decodeURIComponent(url.search))?.[1]?.split(',') ?? []
    return HttpResponse.json({
      elements: shares.map((share) => ({
        organizationalEntity: url.searchParams.get('organizationalEntity'),
        share,
        totalShareStatistics: {
          impressionCount: 500,
          uniqueImpressionsCount: 410,
          clickCount: 12,
          likeCount: 30,
          commentCount: 4,
          shareCount: 2,
          engagement: 0.096,
        },
      })),
      paging: { count: 10, start: 0, links: [] },
    })
  }),
  http.get(`${LI}/rest/memberCreatorPostAnalytics`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('queryType')
    const counts: Record<string, number> = {
      IMPRESSION: 900,
      MEMBERS_REACHED: 700,
      REACTION: 45,
      COMMENT: 6,
      RESHARE: 3,
    }
    return HttpResponse.json({
      elements: [{ count: counts[q ?? ''] ?? 0, metricType: q }],
      paging: { count: 10, start: 0, links: [] },
    })
  }),

  // ---------------------------------------------------------------- TikTok
  http.post(`${TT}/v2/oauth/token/`, async ({ request }) => {
    const form = Object.fromEntries(new URLSearchParams(await request.text()))
    ttState.tokenRequests.push(form)
    if (form.code === 'bad-code')
      return HttpResponse.json(
        { error: 'invalid_grant', error_description: 'Authorization code is expired.', log_id: 'l1' },
        { status: 400 },
      )
    if (form.grant_type === 'refresh_token' && !form.refresh_token?.startsWith('rft.'))
      return HttpResponse.json(
        { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.', log_id: 'l2' },
        { status: 400 },
      )
    const seq = form.grant_type === 'refresh_token' ? ++ttState.refreshSeq : 1
    return HttpResponse.json({
      open_id: 'tt-open-1',
      scope: 'user.info.basic,user.info.profile,user.info.stats,video.publish,video.list',
      access_token: `act.${seq}`,
      expires_in: 86_400,
      refresh_token: `rft.${seq}`,
      refresh_expires_in: 31_536_000,
      token_type: 'Bearer',
    })
  }),
  http.post(`${TT}/v2/oauth/revoke/`, async ({ request }) => {
    ttState.revokes.push(new URLSearchParams(await request.text()).get('token') ?? '')
    return HttpResponse.json({})
  }),
  http.get(`${TT}/v2/user/info/`, ({ request }) => {
    if (request.headers.get('authorization') === 'Bearer act.expired')
      return HttpResponse.json(
        {
          data: {},
          error: {
            code: 'access_token_invalid',
            message: 'The access token is invalid or not found in the request.',
            logid: 'l3',
          },
        },
        { status: 401 },
      )
    return ok({
      user: {
        open_id: 'tt-open-1',
        union_id: 'tt-union-1',
        display_name: 'Klima Servis',
        username: 'klimaservis',
        avatar_url: 'https://p16.tiktok.test/a.jpg',
        follower_count: 1234,
        likes_count: 9876,
        video_count: 42,
      },
    })
  }),
  http.post(`${TT}/v2/post/publish/creator_info/query/`, () =>
    ok({
      creator_avatar_url: 'https://p16.tiktok.test/a.jpg',
      creator_username: 'klimaservis',
      creator_nickname: 'Klima Servis',
      privacy_level_options: ttState.privacyOptions,
      comment_disabled: ttState.commentDisabled,
      duet_disabled: false,
      stitch_disabled: true,
      max_video_post_duration_sec: 600,
    }),
  ),
  http.post(`${TT}/v2/post/publish/content/init/`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    ttState.photoInits.push(body)
    ttState.publishSeq++
    return ok({ publish_id: `p_pub_url~v2.${ttState.publishSeq}` })
  }),
  http.post(`${TT}/v2/post/publish/video/init/`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    ttState.videoInits.push(body)
    ttState.publishSeq++
    return ok({
      publish_id: `v_inbox_file~v2.${ttState.publishSeq}`,
      upload_url: 'https://open-upload.tiktokapis.test/video/?upload_id=1',
    })
  }),
  http.put('https://open-upload.tiktokapis.test/video/', async ({ request }) => {
    const buf = await request.arrayBuffer()
    ttState.chunks.push({ range: request.headers.get('content-range'), size: buf.byteLength })
    return new HttpResponse(null, { status: 201 })
  }),
  http.post(`${TT}/v2/post/publish/status/fetch/`, () => {
    const next =
      ttState.statusQueue.length > 1
        ? ttState.statusQueue.shift()!
        : (ttState.statusQueue[0] ?? {
            status: 'PUBLISH_COMPLETE',
            publicaly_available_post_id: ['7311000000000000001'],
          })
    const { publicaly_available_post_id: ids, ...rest } = next
    // sirov JSON: int64 ID kao broj, tačno kako ga TikTok šalje (JS broj bi ga zaokružio)
    const data = ids
      ? `${JSON.stringify(rest).slice(0, -1)},"publicaly_available_post_id":[${ids.join(',')}]}`
      : JSON.stringify(rest)
    return new HttpResponse(`{"data":${data},"error":{"code":"ok","message":"","logid":"log-1"}}`, {
      headers: { 'content-type': 'application/json' },
    })
  }),
  // lažni video u „skladištu” za FILE_UPLOAD (1 MB, jedan deo)
  http.get(
    'https://storage.tiktok-fixture.test/v.mp4',
    () =>
      new HttpResponse(new Uint8Array(1024 * 1024).fill(7), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      }),
  ),
  http.post(`${TT}/v2/video/list/`, () =>
    ok({
      videos: [
        {
          id: '7300000000000000001',
          title: 'Servis klime',
          video_description: 'Servis klime za 30 minuta #klima',
          create_time: 1761200000,
          cover_image_url: 'https://p16.tiktok.test/c1.jpg',
          share_url: 'https://www.tiktok.com/@klimaservis/video/7300000000000000001',
          like_count: 120,
          comment_count: 8,
          share_count: 5,
          view_count: 4000,
        },
        {
          id: '7300000000000000002',
          title: 'Čišćenje',
          video_description: 'Kako se čisti klima',
          create_time: 1761100000,
          share_url: 'https://www.tiktok.com/@klimaservis/video/7300000000000000002',
          like_count: 60,
          comment_count: 2,
          share_count: 1,
          view_count: 2100,
        },
      ],
      cursor: 1761100000000,
      has_more: false,
    }),
  ),
  http.post(`${TT}/v2/video/query/`, async ({ request }) => {
    const body = (await request.json()) as { filters?: { video_ids?: string[] } }
    return ok({
      videos: (body.filters?.video_ids ?? []).map((id) => ({
        id,
        like_count: 77,
        comment_count: 9,
        share_count: 4,
        view_count: 3100,
      })),
    })
  }),
]
