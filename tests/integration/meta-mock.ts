import { http, HttpResponse } from 'msw'

/**
 * MSW mock Meta Graph API-ja (v26.0) za fazu 8a: OAuth razmena, /me, /me/accounts sa stranicama i
 * Instagram nalozima, istorija objava, objavljivanje (feed, photos, IG kontejner), insights, permissions.
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
}

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
    return HttpResponse.json({ id: `container-${metaState.publishes.length}` })
  }),
  http.get(`${G}/:id`, ({ request, params }) => {
    const id = String(params.id)
    const fields = new URL(request.url).searchParams.get('fields') ?? ''
    if (id.startsWith('container-'))
      return HttpResponse.json({
        id,
        status_code: metaState.containerStatus,
        status: metaState.containerStatus,
      })
    if (fields.includes('permalink'))
      return HttpResponse.json({ id, permalink: `https://www.instagram.com/p/${id}/` })
    if (fields.includes('like_count')) return HttpResponse.json({ id, like_count: 5, comments_count: 1 })
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
    return HttpResponse.json({ id: `ig-post-${metaState.publishes.length}` })
  }),
  http.post(`${G}/:id/comments`, async ({ request, params }) => {
    const body = Object.fromEntries(new URLSearchParams(await request.text()))
    metaState.publishes.push({ path: `${String(params.id)}/comments`, body })
    return HttpResponse.json({ id: `comment-${metaState.publishes.length}` })
  }),
  http.get(`${G}/:id/insights`, ({ request, params }) => {
    const metric = new URL(request.url).searchParams.get('metric') ?? ''
    const names = metric.split(',')
    const id = String(params.id)
    return HttpResponse.json({
      data: names.map((name, i) => ({
        name,
        period: 'lifetime',
        values: [{ value: id.startsWith('ig') ? 100 + i : 200 + i }],
      })),
    })
  }),
  http.delete(`${G}/:id`, ({ params }) => {
    metaState.deletes.push(String(params.id))
    return HttpResponse.json({ success: true })
  }),
]
