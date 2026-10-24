import { describe, expect, it } from 'vitest'

import { mapGoogleError } from './client'

describe('mapGoogleError', () => {
  it('OAuth invalid_grant i 401 → ponovno povezivanje', () => {
    expect(
      mapGoogleError(400, { error: 'invalid_grant', error_description: 'Token has been expired' }).code,
    ).toBe('TOKEN_INVALID')
    expect(mapGoogleError(401, { error: { code: 401, status: 'UNAUTHENTICATED' } }).code).toBe(
      'TOKEN_INVALID',
    )
  })

  it('YouTube razlozi iz errors[].reason: kvota, limit kanala, brzina, suspendovan kanal', () => {
    const yt = (status: number, reason: string) =>
      mapGoogleError(status, { error: { code: status, message: 'x', errors: [{ reason }] } }, 'YouTube')
    expect(yt(403, 'quotaExceeded').code).toBe('QUOTA_EXCEEDED')
    expect(yt(400, 'uploadLimitExceeded').code).toBe('QUOTA_EXCEEDED')
    expect(yt(403, 'rateLimitExceeded')).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
    expect(yt(403, 'channelSuspended').code).toBe('ACCOUNT_RESTRICTED')
    expect(yt(403, 'insufficientPermissions').code).toBe('PERMISSION_LOST')
    expect(yt(400, 'invalidTitle').code).toBe('CONTENT_REJECTED')
  })

  it('google.rpc.Status: 429, 503, detalji poslovnog profila', () => {
    expect(mapGoogleError(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }).code).toBe(
      'RATE_LIMITED',
    )
    expect(mapGoogleError(503, { error: { code: 503, status: 'UNAVAILABLE' } })).toMatchObject({
      code: 'PROVIDER_DOWN',
      retryable: true,
    })
    const photo = mapGoogleError(400, {
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        details: [{ errorDetails: [{ code: 'PHOTO_FETCH_FAILED' }] }],
      },
    })
    expect(photo.code).toBe('MEDIA_REJECTED')
    const disabled = mapGoogleError(400, {
      error: { code: 400, details: [{ errorDetails: [{ code: 'LOCATION_DISABLED_FOR_LOCAL_POST_API' }] }] },
    })
    expect(disabled.code).toBe('ACCOUNT_RESTRICTED')
    expect(mapGoogleError(403, { error: { code: 403, status: 'PERMISSION_DENIED' } }).code).toBe(
      'PERMISSION_LOST',
    )
  })
})
