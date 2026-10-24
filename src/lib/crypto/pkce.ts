import { createHash, randomBytes } from 'node:crypto'

/** PKCE (RFC 7636, S256): verifier od 64 znaka base64url i njegov SHA-256 izazov. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
