import { describe, expect, it } from 'vitest'

import { mapGraphError } from './graph'
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
