import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Meta `signed_request` (deauthorize i data deletion callback): `<potpis>.<payload>`, oba base64url;
 * potpis je HMAC-SHA256 nad enkodovanim payload-om sa app secret-om.
 */
export interface SignedRequestPayload {
  user_id: string
  algorithm: string
  issued_at: number
  expires?: number
  [key: string]: unknown
}

function fromBase64Url(value: string): Buffer {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64')
}

export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequestPayload | null {
  const dot = signedRequest.indexOf('.')
  if (dot <= 0) return null
  const encodedSig = signedRequest.slice(0, dot)
  const encodedPayload = signedRequest.slice(dot + 1)
  let payload: SignedRequestPayload
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as SignedRequestPayload
  } catch {
    return null
  }
  if (!payload || typeof payload.user_id !== 'string') return null
  if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return null
  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest()
  const given = fromBase64Url(encodedSig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return payload
}

/** Za testove i dokumentaciju: pravi potpisan zahtev. */
export function makeSignedRequest(payload: Record<string, unknown>, appSecret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', appSecret).update(encodedPayload).digest('base64url')
  return `${sig}.${encodedPayload}`
}
