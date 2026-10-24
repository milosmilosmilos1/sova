import { describe, expect, it } from 'vitest'

import { currentKeyVersion, decryptSecret, encryptSecret, fromPgBytea, sha256Hex, toPgBytea } from './tokens'

describe('šifrovanje tokena', () => {
  it('šifruje i dešifruje sa verzijom ključa i AAD-om', () => {
    const enc = encryptSecret('refresh-token-123', 'canva:ws:user')
    expect(enc.keyVersion).toBe(currentKeyVersion())
    expect(enc.ciphertext.length).toBeGreaterThan(28)
    expect(decryptSecret(enc.ciphertext, enc.keyVersion, 'canva:ws:user')).toBe('refresh-token-123')
    expect(() => decryptSecret(enc.ciphertext, enc.keyVersion, 'drugi:aad')).toThrow()
    expect(() => decryptSecret(enc.ciphertext, 99, 'canva:ws:user')).toThrow(/verzije 99/)
  })
  it('svako šifrovanje ima drugi IV, bytea format ide kroz hex', () => {
    const a = encryptSecret('x')
    const b = encryptSecret('x')
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
    const pg = toPgBytea(a.ciphertext)
    expect(pg.startsWith('\\x')).toBe(true)
    expect(fromPgBytea(pg).equals(a.ciphertext)).toBe(true)
    expect(decryptSecret(pg, a.keyVersion)).toBe('x')
    expect(sha256Hex('state')).toHaveLength(64)
  })
})
