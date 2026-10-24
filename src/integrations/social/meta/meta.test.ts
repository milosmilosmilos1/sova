import { describe, expect, it } from 'vitest'

import { mapGraphError } from './graph'
import { igStatusMessage, isFacebookReel } from './provider'
import { makeSignedRequest, parseSignedRequest } from './signed-request'

describe('Meta signed_request', () => {
  const secret = 'app-secret-123'
  it('parsira i proverava potpis; pogrešan potpis ili tajna padaju', () => {
    const sr = makeSignedRequest(
      { user_id: '1234567890', algorithm: 'HMAC-SHA256', issued_at: 1700000000 },
      secret,
    )
    expect(parseSignedRequest(sr, secret)?.user_id).toBe('1234567890')
    expect(parseSignedRequest(sr, 'druga-tajna')).toBeNull()
    const [sig, payload] = sr.split('.')
    expect(parseSignedRequest(`${sig!.slice(0, -2)}xx.${payload}`, secret)).toBeNull()
    expect(parseSignedRequest('nema-tacke', secret)).toBeNull()
    expect(parseSignedRequest(`${sig}.${Buffer.from('{"nope":1}').toString('base64url')}`, secret)).toBeNull()
  })
})

describe('mapGraphError', () => {
  const body = (code: number, sub?: number, message = 'x') => ({
    error: { message, type: 'OAuthException', code, error_subcode: sub },
  })
  it('mapira kodove na ProviderError sa retry oznakom', () => {
    expect(mapGraphError(400, body(190))).toMatchObject({ code: 'TOKEN_INVALID', retryable: false })
    expect(mapGraphError(400, body(200))).toMatchObject({ code: 'PERMISSION_LOST' })
    expect(mapGraphError(400, body(10))).toMatchObject({ code: 'PERMISSION_LOST' })
    expect(mapGraphError(400, body(4))).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
    expect(mapGraphError(400, body(32))).toMatchObject({ code: 'RATE_LIMITED' })
    expect(mapGraphError(400, body(368))).toMatchObject({ code: 'ACCOUNT_RESTRICTED' })
    expect(mapGraphError(400, body(506))).toMatchObject({ code: 'DUPLICATE' })
    expect(mapGraphError(400, body(9004))).toMatchObject({ code: 'MEDIA_REJECTED' })
    expect(mapGraphError(400, body(100, 2207003))).toMatchObject({ code: 'MEDIA_REJECTED' })
    expect(mapGraphError(400, body(100))).toMatchObject({ code: 'CONTENT_REJECTED' })
    expect(mapGraphError(500, null)).toMatchObject({ code: 'PROVIDER_DOWN', retryable: true })
    expect(mapGraphError(400, body(1))).toMatchObject({ code: 'PROVIDER_DOWN' })
    expect(mapGraphError(400, body(9, undefined, 'Application request limit reached'))).toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
    expect(mapGraphError(400, body(31337))).toMatchObject({ code: 'UNKNOWN' })
    expect(mapGraphError(400, body(190)).userMessage).toMatch(/Povežite nalog ponovo/)
  })
})

describe('Meta video (D-089)', () => {
  const media = (width: number, height: number, durationMs: number) => ({
    url: 'https://x.test/v.mp4',
    mimeType: 'video/mp4',
    width,
    height,
    alt: null,
    durationMs,
  })
  it('Facebook Reel samo za uspravan video 9:16 od 3 do 90 s i bar 540×960', () => {
    expect(isFacebookReel(media(1080, 1920, 20_000))).toBe(true)
    expect(isFacebookReel(media(1080, 1920, 95_000))).toBe(false)
    expect(isFacebookReel(media(1080, 1920, 2_000))).toBe(false)
    expect(isFacebookReel(media(1080, 1350, 20_000))).toBe(false)
    expect(isFacebookReel(media(480, 854, 20_000))).toBe(false)
    expect(isFacebookReel({ ...media(1080, 1920, 20_000), durationMs: null })).toBe(false)
  })

  it('status IG kontejnera sa podkodom daje razumljivu poruku', () => {
    expect(igStatusMessage('Error: Media upload has failed with error code 2207026')).toMatch(/MP4/)
    expect(igStatusMessage('Error: 2207052')).toMatch(/preuzme/)
    expect(igStatusMessage(undefined)).toBe('Instagram je odbio medij.')
  })

  it('greške Facebook videa: 6001 se ponavlja, Reels specifikacija i file_url su odbijen medij', () => {
    const body = (code: number) => ({ error: { message: 'x', code } })
    expect(mapGraphError(400, body(6001))).toMatchObject({ code: 'PROVIDER_DOWN', retryable: true })
    expect(mapGraphError(400, body(1363128))).toMatchObject({ code: 'MEDIA_REJECTED' })
    expect(mapGraphError(400, body(389))).toMatchObject({ code: 'MEDIA_REJECTED' })
  })
})
