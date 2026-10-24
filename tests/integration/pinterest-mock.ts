import { http, HttpResponse } from 'msw'

/**
 * MSW mock Pinterest API-ja v5 (OAuth sa Basic autentikacijom i „continuous” refresh tokenom,
 * user_account, table sa bookmark stranama, pinovi, video kroz /media i S3 upload) za fazu 8c.
 * Oblici odgovora prate OpenAPI iz zvanične dokumentacije (24.10.2026); null polja se izostavljaju.
 */
export const pinState = {
  tokenRequests: [] as Array<{ form: Record<string, string>; authorization: string | null }>,
  refreshToken: 'pinr-1',
  refreshSeq: 1,
  pins: [] as Array<Record<string, unknown>>,
  pinSeq: 0,
  mediaSeq: 0,
  s3Uploads: [] as Array<{ fields: string[]; fileSize: number }>,
  mediaStatusQueue: ['processing', 'succeeded'] as string[],
  mediaPolls: 0,
  deletes: [] as string[],
  hosts: [] as string[],
}

export function resetPinterestState(): void {
  pinState.tokenRequests = []
  pinState.refreshToken = 'pinr-1'
  pinState.refreshSeq = 1
  pinState.pins = []
  pinState.s3Uploads = []
  pinState.mediaStatusQueue = ['processing', 'succeeded']
  pinState.mediaPolls = 0
  pinState.deletes = []
  pinState.hosts = []
}

const unauthorized = () => HttpResponse.json({ code: 2, message: 'Authentication failed.' }, { status: 401 })
const authed = (request: Request) => (request.headers.get('authorization') ?? '').startsWith('Bearer pina')

function handlersFor(base: string) {
  const note = (request: Request) => pinState.hosts.push(new URL(request.url).host)
  return [
    http.post(`${base}/oauth/token`, async ({ request }) => {
      note(request)
      const form = Object.fromEntries(new URLSearchParams(await request.text()))
      pinState.tokenRequests.push({ form, authorization: request.headers.get('authorization') })
      if (form.grant_type === 'refresh_token') {
        if (form.refresh_token !== pinState.refreshToken)
          return HttpResponse.json({ code: 1, message: 'Invalid refresh token.' }, { status: 400 })
        pinState.refreshSeq++
        pinState.refreshToken = `pinr-${pinState.refreshSeq}`
        return HttpResponse.json({
          access_token: `pina-refreshed-${pinState.refreshSeq}`,
          response_type: 'refresh_token',
          token_type: 'bearer',
          expires_in: 2_592_000,
          scope: 'user_accounts:read boards:read boards:write pins:read pins:write',
          refresh_token: pinState.refreshToken,
          refresh_token_expires_in: 5_184_000,
        })
      }
      return HttpResponse.json({
        access_token: 'pina-1',
        refresh_token: pinState.refreshToken,
        response_type: 'authorization_code',
        token_type: 'bearer',
        expires_in: 2_592_000,
        refresh_token_expires_in: 5_184_000,
        scope: 'user_accounts:read boards:read boards:write pins:read pins:write',
      })
    }),
    http.get(`${base}/user_account`, ({ request }) => {
      if (!authed(request)) return unauthorized()
      return HttpResponse.json({
        id: '9876543210',
        username: 'klimaservis',
        profile_image: 'https://i.pinimg.com/75x75_RS/klima.jpg',
        follower_count: 210,
        account_type: 'BUSINESS',
        business_name: 'Klima Servis',
        board_count: 2,
        pin_count: 34,
      })
    }),
    http.get(`${base}/boards`, ({ request }) => {
      if (!authed(request)) return unauthorized()
      const bookmark = new URL(request.url).searchParams.get('bookmark')
      if (!bookmark)
        return HttpResponse.json({
          items: [
            { id: '1001', name: 'Saveti za klimu', privacy: 'PUBLIC', owner: { username: 'klimaservis' } },
          ],
          bookmark: 'b2',
        })
      // poslednja strana: bookmark izostaje (null polja se izostavljaju od 26.2.2026)
      return HttpResponse.json({ items: [{ id: '1002', name: 'Akcije', privacy: 'PUBLIC' }] })
    }),
    http.post(`${base}/pins`, async ({ request }) => {
      note(request)
      if (!authed(request)) return unauthorized()
      const body = (await request.json()) as Record<string, unknown>
      if (body.board_id === 'missing')
        return HttpResponse.json({ code: 40, message: 'Board not found.' }, { status: 404 })
      pinState.pins.push(body)
      pinState.pinSeq++
      return HttpResponse.json(
        {
          id: `pin-${pinState.pinSeq}`,
          created_at: new Date().toISOString(),
          title: body.title,
          description: body.description,
        },
        { status: 201 },
      )
    }),
    http.get(`${base}/pins`, ({ request }) => {
      if (!authed(request)) return unauthorized()
      return HttpResponse.json({
        items: pinState.pins
          .map((p, i) => ({ id: `pin-${i + 1}`, title: p.title, description: p.description }))
          .reverse(),
      })
    }),
    http.delete(`${base}/pins/:id`, ({ request, params }) => {
      if (!authed(request)) return unauthorized()
      pinState.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(`${base}/media`, async ({ request }) => {
      if (!authed(request)) return unauthorized()
      const body = (await request.json()) as { media_type?: string }
      if (body.media_type !== 'video')
        return HttpResponse.json({ code: 1, message: 'Invalid media_type' }, { status: 400 })
      pinState.mediaSeq++
      return HttpResponse.json({
        media_id: `med-${pinState.mediaSeq}`,
        media_type: 'video',
        upload_url: 'https://pinterest-media-upload.s3-accelerate.amazonaws.com/',
        upload_parameters: {
          'x-amz-date': '20261024T120000Z',
          'x-amz-signature': 'sig',
          'x-amz-security-token': 'tok',
          'x-amz-algorithm': 'AWS4-HMAC-SHA256',
          key: `uploads/med-${pinState.mediaSeq}`,
          policy: 'cG9saWN5',
          'x-amz-credential': 'cred',
          'Content-Type': 'multipart/form-data',
        },
      })
    }),
    http.get(`${base}/media/:id`, ({ request, params }) => {
      if (!authed(request)) return unauthorized()
      const status =
        pinState.mediaStatusQueue[Math.min(pinState.mediaPolls, pinState.mediaStatusQueue.length - 1)]!
      pinState.mediaPolls++
      return HttpResponse.json({ media_id: String(params.id), media_type: 'video', status })
    }),
  ]
}

export const pinterestHandlers = [
  ...handlersFor('https://api.pinterest.com/v5'),
  ...handlersFor('https://api-sandbox.pinterest.com/v5'),
  http.post('https://pinterest-media-upload.s3-accelerate.amazonaws.com/', async ({ request }) => {
    if (request.headers.get('authorization')) return new HttpResponse('no bearer to S3', { status: 400 })
    const form = await request.formData()
    const file = form.get('file')
    pinState.s3Uploads.push({ fields: [...form.keys()], fileSize: file instanceof Blob ? file.size : 0 })
    return new HttpResponse(null, { status: 204 })
  }),
]
