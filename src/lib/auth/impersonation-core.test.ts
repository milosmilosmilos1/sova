import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  READ_ONLY_MESSAGE,
  actionBlock,
  decodeJwtPayload,
  impersonationBlock,
  mintImpersonationJwt,
  signSessionCookie,
  verifySessionCookie,
} from '@/lib/auth/impersonation-core'

const SECRET = 'test-impersonation-secret-at-least-32-chars'
const SID = '3f6b8c1e-2a4d-4e6f-9a1b-0c2d3e4f5a6b'

describe('cookie sesije', () => {
  it('potpisan ID se verifikuje; izmenjen ID, potpis ili tajna padaju', () => {
    const value = signSessionCookie(SID, SECRET)
    expect(verifySessionCookie(value, SECRET)).toBe(SID)
    expect(verifySessionCookie(value.replace(SID, '3f6b8c1e-2a4d-4e6f-9a1b-0c2d3e4f5a6c'), SECRET)).toBeNull()
    expect(verifySessionCookie(`${value.slice(0, -2)}xx`, SECRET)).toBeNull()
    expect(verifySessionCookie(value, `${SECRET}-drugi`)).toBeNull()
    expect(verifySessionCookie('nije-uuid.abc', SECRET)).toBeNull()
    expect(verifySessionCookie('', SECRET)).toBeNull()
    expect(verifySessionCookie(undefined, SECRET)).toBeNull()
  })
})

describe('JWT za ciljnog korisnika', () => {
  const claims = {
    userId: 'u-1',
    email: 'korisnik@sova.local',
    sessionId: SID,
    adminId: 'a-1',
    readOnly: true,
    supabaseUrl: 'http://127.0.0.1:54321/',
  }
  it('nosi sub, ulogu, aud i imp claim; potpis je HS256 sa JWT tajnom', () => {
    const now = new Date('2026-10-24T10:00:00Z')
    const token = mintImpersonationJwt(
      { ...claims, expiresAt: '2026-10-24T10:20:00Z' },
      'jwt-tajna-jwt-tajna-jwt-tajna-123',
      now,
    )
    const p = decodeJwtPayload(token)
    expect(p).toMatchObject({
      sub: 'u-1',
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'http://127.0.0.1:54321/auth/v1',
      imp: { sid: SID, ro: true, adm: 'a-1' },
    })
    expect(p.exp).toBe(Math.floor(new Date('2026-10-24T10:20:00Z').getTime() / 1000))
    const [h, b, s] = token.split('.')
    expect(
      createHmac('sha256', 'jwt-tajna-jwt-tajna-jwt-tajna-123').update(`${h}.${b}`).digest('base64url'),
    ).toBe(s)
  })
  it('token nikad ne važi duže od 30 minuta, ni kad sesija kasnije ističe', () => {
    const now = new Date('2026-10-24T10:00:00Z')
    const p = decodeJwtPayload(
      mintImpersonationJwt(
        { ...claims, expiresAt: '2026-10-24T12:00:00Z' },
        'jwt-tajna-jwt-tajna-jwt-tajna-123',
        now,
      ),
    )
    expect(p.exp).toBe(Math.floor(now.getTime() / 1000) + 30 * 60)
  })
})

describe('blokade tokom impersonacije', () => {
  it('read-only: čitanje prolazi, svaka izmena se odbija', () => {
    expect(impersonationBlock(true, 'GET', '/api/posts')).toBeNull()
    expect(impersonationBlock(true, 'POST', '/api/posts')).toBe(READ_ONLY_MESSAGE)
    expect(impersonationBlock(true, 'PATCH', '/api/posts/1')).toBe(READ_ONLY_MESSAGE)
  })
  it('pun režim: izmene sadržaja prolaze, a brisanje, mreže, objavljivanje, naplata i Autopilot ne', () => {
    expect(impersonationBlock(false, 'POST', '/api/posts')).toBeNull()
    expect(impersonationBlock(false, 'PATCH', '/api/posts/abc')).toBeNull()
    expect(impersonationBlock(false, 'POST', '/api/posts/abc/submit')).toBeNull()
    expect(impersonationBlock(false, 'DELETE', '/api/posts/abc')).toContain('Brisanje')
    expect(impersonationBlock(false, 'POST', '/api/posts/abc/schedule')).toContain('Objavljivanje')
    expect(impersonationBlock(false, 'POST', '/api/posts/abc/publish-now')).toContain('Objavljivanje')
    expect(impersonationBlock(false, 'POST', '/api/posts/abc/targets/t/retry')).toContain('Objavljivanje')
    expect(impersonationBlock(false, 'GET', '/api/integrations/meta/connect')).toBeNull()
    expect(impersonationBlock(false, 'POST', '/api/social-accounts/activate')).toContain('mreža')
    expect(impersonationBlock(false, 'POST', '/api/billing/checkout')).toContain('Naplata')
    expect(impersonationBlock(false, 'PATCH', '/api/autopilot/b1')).toContain('Autopilot')
    expect(impersonationBlock(false, 'POST', '/api/workspaces')).toContain('radni prostor')
    const ws = '/api/workspaces/0b5c6a8e-1111-4222-8333-944455556666'
    expect(impersonationBlock(false, 'PATCH', `${ws}/members`)).toContain('Tim')
    expect(impersonationBlock(false, 'PATCH', ws)).toBeNull()
  })
  it('serverske akcije: navigacija uvek, izmene samo u punom režimu, zabranjene nikad', () => {
    expect(actionBlock(true, 'navigation')).toBeNull()
    expect(actionBlock(true, 'edit')).toBe(READ_ONLY_MESSAGE)
    expect(actionBlock(false, 'edit')).toBeNull()
    expect(actionBlock(false, 'forbidden')).toContain('nije dozvoljena')
  })
})
