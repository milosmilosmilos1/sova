import { describe, expect, it } from 'vitest'

import { composeXText, mapXError, xPermalink } from './provider'

describe('X', () => {
  it('link objave ide na kraj teksta, osim ako je već u tekstu', () => {
    expect(composeXText({ text: 'Ponuda', link: 'https://a.rs' })).toBe('Ponuda\n\nhttps://a.rs')
    expect(composeXText({ text: 'Vidi https://a.rs danas', link: 'https://a.rs' })).toBe(
      'Vidi https://a.rs danas',
    )
    expect(composeXText({ text: '  ', link: 'https://a.rs' })).toBe('https://a.rs')
    expect(composeXText({ text: 'Bez linka', link: null })).toBe('Bez linka')
  })

  it('greške: 401, 402 krediti, duplikat, odgovor bez pomena, 429, usage-capped, 503', () => {
    expect(mapXError(401, { title: 'Unauthorized', status: 401 }).code).toBe('TOKEN_INVALID')
    expect(mapXError(400, { error: 'invalid_grant' }).code).toBe('TOKEN_INVALID')
    const credits = mapXError(402, {
      detail: 'credits depleted',
      type: 'https://api.x.com/2/problems/credits-depleted',
    })
    expect(credits.code).toBe('QUOTA_EXCEEDED')
    expect(credits.userMessage).toContain('X krediti')
    expect(
      mapXError(403, { detail: 'You are not allowed to create a Tweet with duplicate content.' }).code,
    ).toBe('DUPLICATE')
    expect(
      mapXError(403, { type: 'https://api.x.com/2/problems/not-authorized-for-resource', detail: 'reply' })
        .userMessage,
    ).toContain('sopstvene objave')
    expect(mapXError(429, { errors: [{ code: 88, message: 'Rate limit exceeded' }] })).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
    expect(mapXError(429, { type: 'https://api.x.com/2/problems/usage-capped' }).code).toBe('QUOTA_EXCEEDED')
    expect(mapXError(503, null)).toMatchObject({ code: 'PROVIDER_DOWN', retryable: true })
  })

  it('link objave sa korisničkim imenom ili bez njega', () => {
    expect(xPermalink('klima', '123')).toBe('https://x.com/klima/status/123')
    expect(xPermalink(null, '123')).toBe('https://x.com/i/web/status/123')
  })
})
