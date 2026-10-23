import { describe, expect, it } from 'vitest'

import { buildCsp } from './csp'

describe('buildCsp', () => {
  it('sadrži nonce i strict-dynamic za skripte', () => {
    const csp = buildCsp({ nonce: 'abc123', isDev: false })
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('u dev dozvoljava eval i localhost websocket', () => {
    const csp = buildCsp({ nonce: 'n', isDev: true })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain('ws://localhost:*')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('dodaje Supabase origin u connect i img', () => {
    const csp = buildCsp({ nonce: 'n', isDev: false, supabaseUrl: 'https://abc.supabase.co' })
    expect(csp).toContain('wss://abc.supabase.co')
    expect(csp).toMatch(/img-src [^;]*https:\/\/abc\.supabase\.co/)
  })
})
