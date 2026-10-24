import 'server-only'

import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * Javni, kratkotrajni URL medija na našem domenu (D-077). Mreže koje same preuzimaju fajl sa
 * verifikovanog domena (TikTok PULL_FROM_URL) ne prihvataju potpisan URL Supabase skladišta.
 * Token = `assetId.varijanta.istek.potpis` (HMAC-SHA256, ključ izveden HKDF-om iz
 * TOKEN_ENCRYPTION_KEY sa posebnom namenom), bez preusmeravanja i bez listanja.
 */
export type MediaVariant = 'orig' | 'tiktok'
const VARIANTS = new Set<MediaVariant>(['orig', 'tiktok'])

let cachedKey: Buffer | null = null
function key(): Buffer {
  if (!cachedKey) {
    cachedKey = Buffer.from(
      hkdfSync('sha256', env.TOKEN_ENCRYPTION_KEY ?? '', 'sova', 'public-media-url-v1', 32),
    )
  }
  return cachedKey
}

function sign(payload: string): string {
  return createHmac('sha256', key()).update(payload).digest('base64url')
}

export function signMediaToken(
  assetId: string,
  variant: MediaVariant,
  ttlSec = 2 * 3600,
  now = Date.now(),
): string {
  const exp = Math.floor(now / 1000) + ttlSec
  const payload = `${assetId}.${variant}.${exp}`
  return `${payload}.${sign(payload)}`
}

export function verifyMediaToken(
  token: string,
  now = Date.now(),
): { assetId: string; variant: MediaVariant } | null {
  const clean = token.replace(/[.](jpg|jpeg|png|webp)$/i, '')
  const parts = clean.split('.')
  if (parts.length !== 4) return null
  const [assetId, variant, exp, sig] = parts as [string, MediaVariant, string, string]
  if (!/^[0-9a-f-]{36}$/i.test(assetId) || !VARIANTS.has(variant) || !/^\d{1,12}$/.test(exp)) return null
  const expected = Buffer.from(sign(`${assetId}.${variant}.${exp}`))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  if (Number(exp) * 1000 < now) return null
  return { assetId, variant }
}

/** URL za mrežu; baza je PUBLIC_MEDIA_BASE_URL (domen verifikovan na TikTok-u) ili adresa aplikacije. */
export function publicMediaUrl(assetId: string, variant: MediaVariant, ttlSec?: number): string {
  const base = (env.PUBLIC_MEDIA_BASE_URL ?? env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  const ext = variant === 'tiktok' ? '.jpg' : ''
  return `${base}/api/media/public/${signMediaToken(assetId, variant, ttlSec)}${ext}`
}
