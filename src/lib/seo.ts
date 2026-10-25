import { company } from '@/config/company'

/**
 * Adresa sajta i pravila indeksiranja (D-095). Indeksira se samo pravi domen: pregledi na Vercel-u,
 * staging i localhost dobijaju zabranu u robots.txt i `noindex`, da kopija ne uđe u pretragu pre
 * pravog sajta ili umesto njega.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || company.appUrl).replace(/\/+$/, '')
}

export function isIndexableHost(url: string = siteUrl()): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  return host === company.domain || host === `www.${company.domain}`
}

/** Javne strane u mapi sajta (prijava, aplikacija i privatni linkovi nisu tu). */
export const SITEMAP_PATHS: Array<{ path: string; priority: number; legal?: boolean }> = [
  { path: '/', priority: 1 },
  { path: '/register', priority: 0.6 },
  { path: '/privacy', priority: 0.3, legal: true },
  { path: '/terms', priority: 0.3, legal: true },
  { path: '/data-deletion', priority: 0.2, legal: true },
  { path: '/bot', priority: 0.2 },
]

/** Putanje koje pretraga ne treba da obilazi; javni URL medija za mreže (TikTok) ostaje dostupan. */
export const ROBOTS_DISALLOW = [
  '/app',
  '/admin',
  '/api/',
  '/auth/',
  '/approve/',
  '/invite/',
  '/reset-password',
  '/verify-email',
]
export const ROBOTS_ALLOW = ['/', '/api/media/public/']
