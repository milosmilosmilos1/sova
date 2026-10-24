import { describe, expect, it } from 'vitest'

import { pinterestOptionProblems, pinterestTitle, readPinterestOptions } from '@/config/pinterest'

import { mapPinterestError, pinUrl } from './provider'

describe('Pinterest', () => {
  it('tabla je obavezna; naslov iz podešavanja, naslova objave ili prvog reda (do 100)', () => {
    expect(pinterestOptionProblems(readPinterestOptions({}))).toEqual([
      'Izaberite Pinterest tablu za ovaj pin.',
    ])
    expect(pinterestOptionProblems(readPinterestOptions({ pinterest: { boardId: '1001' } }))).toEqual([])
    const o = readPinterestOptions({})
    expect(pinterestTitle(o, null, 'Prvi red\nopis')).toBe('Prvi red')
    expect(pinterestTitle(readPinterestOptions({ pinterest: { title: 'Moj pin' } }), 'Objava', 'x')).toBe(
      'Moj pin',
    )
    expect(pinterestTitle(o, 'x'.repeat(140), '')).toHaveLength(100)
  })

  it('greške: 401 → ponovno povezivanje, 429 ponovo, tabla ne postoji, medij, PINNER_DATA_ACCESS_DENIED', () => {
    expect(mapPinterestError(401, { code: 2, message: 'Authentication failed.' }).code).toBe('TOKEN_INVALID')
    expect(mapPinterestError(429, { code: 8, message: 'Rate limit' })).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
    expect(mapPinterestError(404, { code: 40, message: 'Board not found.' }).userMessage).toContain(
      'tabla ne postoji',
    )
    expect(mapPinterestError(400, { code: 233, message: 'Image is too small' }).code).toBe('MEDIA_REJECTED')
    expect(
      mapPinterestError(403, { code: 403, message: 'PINNER_DATA_ACCESS_DENIED', detail: 'not approved' })
        .code,
    ).toBe('PERMISSION_LOST')
    expect(mapPinterestError(503, null)).toMatchObject({ code: 'PROVIDER_DOWN', retryable: true })
  })

  it('link na pin', () => {
    expect(pinUrl('123')).toBe('https://www.pinterest.com/pin/123/')
  })
})
