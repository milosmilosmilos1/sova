import type { Metadata } from 'next'

import { company } from '@/config/company'
import { locales, type AppLocale } from '@/i18n/config'
import { alternatesFor, OG_LOCALE } from '@/i18n/paths'

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
  { path: '/kontakt', priority: 0.3 },
  { path: '/bot', priority: 0.2 },
]

/** Privatne javne strane (linkovi iz mejla i za klijenta): na svakom jeziku (D-130). */
const PRIVATE_PUBLIC = ['/approve/', '/invite/', '/reset-password', '/verify-email']

/** Putanje koje pretraga ne treba da obilazi; javni URL medija za mreže (TikTok) ostaje dostupan. */
export const ROBOTS_DISALLOW = [
  '/app',
  '/admin',
  '/api/',
  '/auth/',
  ...PRIVATE_PUBLIC,
  ...PRIVATE_PUBLIC.flatMap((p) => [`/en${p}`, `/uk${p}`]),
]
export const ROBOTS_ALLOW = ['/', '/api/media/public/']

/**
 * Metapodaci javne strane na jeziku (D-130): naslov, opis, kanonska adresa sa verzijama na drugim
 * jezicima (hreflang) i slika za deljenje na jeziku strane.
 */
export function publicMetadata(input: {
  locale: AppLocale
  /** interna putanja strane, npr. `/kontakt` */
  path: string
  title?: string
  description?: string
  /** naslov bez dodatka „· Sova” (početna strana) */
  absoluteTitle?: boolean
}): Metadata {
  const alternates = alternatesFor(input.locale, input.path)
  return {
    ...(input.title ? { title: input.absoluteTitle ? { absolute: input.title } : input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    alternates,
    openGraph: {
      siteName: 'Sova',
      type: 'website',
      locale: OG_LOCALE[input.locale],
      alternateLocale: locales.filter((l) => l !== input.locale).map((l) => OG_LOCALE[l]),
      url: alternates.canonical,
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      images: [{ url: `/og/${input.locale}`, width: 1200, height: 630 }],
    },
  }
}
