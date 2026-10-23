import { describe, expect, it } from 'vitest'

import { redact } from './logger'

describe('logger redact', () => {
  it('maskira polja koja liče na tajne, ugnežđeno', () => {
    const out = redact({
      email: 'a@b.rs',
      access_token: 'secret-value',
      nested: { apiKey: 'x', ok: 1, authorization: 'Bearer y' },
      list: [{ password: 'p' }],
    }) as Record<string, unknown>
    expect(out.email).toBe('a@b.rs')
    expect(out.access_token).toBe('[redacted]')
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[redacted]')
    expect((out.nested as Record<string, unknown>).ok).toBe(1)
    expect((out.list as Record<string, unknown>[])[0]!.password).toBe('[redacted]')
  })

  it('skraćuje predugačke stringove', () => {
    const out = redact('x'.repeat(5000)) as string
    expect(out.length).toBeLessThan(2100)
  })

  it('serijalizuje Error', () => {
    const out = redact(new Error('boom')) as { message: string }
    expect(out.message).toBe('boom')
  })
})
