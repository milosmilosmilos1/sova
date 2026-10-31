import { isAppLocale, locales, type AppLocale } from './config'

/**
 * Jezik u adresi javnog sajta (D-130): srpski bez prefiksa, engleski pod /en, ukrajinski pod /uk.
 * Proxy skida prefiks i prepisuje zahtev na istu stranu, a jezik joj šalje u zaglavlju. Aplikacija
 * (/app) nema prefiks: jezik čita iz kolačića koji postavlja javni sajt i iz profila.
 */
export const URL_PREFIX: Record<AppLocale, string> = { 'sr-Latn': '', en: '/en', uk: '/uk' }

/** Zaglavlja koja proxy šalje strani: jezik iz adrese i interna putanja bez prefiksa. */
export const LOCALE_HEADER = 'x-sova-locale'
export const PATH_HEADER = 'x-sova-path'

/** Oznaka jezika za hreflang i OpenGraph. */
export const HREFLANG: Record<AppLocale, string> = { 'sr-Latn': 'sr', en: 'en', uk: 'uk' }
export const OG_LOCALE: Record<AppLocale, string> = { 'sr-Latn': 'sr_RS', en: 'en_US', uk: 'uk_UA' }

const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/kontakt',
  '/privacy',
  '/terms',
  '/data-deletion',
  '/bot',
])
const PUBLIC_PREFIXES = ['/invite/', '/approve/']

/** Strane javnog sajta, koje postoje na svakom jeziku (interna, srpska putanja). */
export function isPublicPath(path: string): boolean {
  return PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))
}

/** Putanja u adresi koja se razlikuje od interne (engleska reč umesto srpske). */
const SLUGS: Record<string, Partial<Record<AppLocale, string>>> = {
  '/kontakt': { en: '/contact', uk: '/contact' },
}

/** Sidra sekcija početne strane, na jeziku strane. */
export type SectionKey = 'features' | 'networks' | 'how' | 'pricing' | 'faq'
export const SECTION_IDS: Record<AppLocale, Record<SectionKey, string>> = {
  'sr-Latn': { features: 'funkcije', networks: 'mreze', how: 'kako-radi', pricing: 'cene', faq: 'pitanja' },
  en: { features: 'features', networks: 'networks', how: 'how-it-works', pricing: 'pricing', faq: 'faq' },
  uk: { features: 'features', networks: 'networks', how: 'how-it-works', pricing: 'pricing', faq: 'faq' },
}

/**
 * Putanja na jeziku: `/kontakt` → `/en/contact`, `/` → `/en`, upit i sidro ostaju. Strane van javnog
 * sajta (aplikacija, API) se vraćaju nepromenjene.
 */
export function localePath(locale: AppLocale, href: string): string {
  const match = /^([^?#]*)([?#].*)?$/.exec(href)
  const path = match?.[1] || '/'
  const tail = match?.[2] ?? ''
  if (!isPublicPath(path)) return href
  const prefix = URL_PREFIX[locale]
  const slug = SLUGS[path]?.[locale] ?? path
  return `${prefix}${prefix && slug === '/' ? '' : slug}${tail}`
}

/** Adresa sa prefiksom jezika → jezik i interna putanja; `null` za adresu bez prefiksa. */
export function splitLocalePath(pathname: string): { locale: AppLocale; path: string } | null {
  const match = /^\/(en|uk)(\/.*)?$/.exec(pathname)
  if (!match) return null
  const locale = match[1] as AppLocale
  const rest = match[2] && match[2] !== '/' ? match[2].replace(/\/+$/, '') : '/'
  const internal = Object.entries(SLUGS).find(([, slugs]) => slugs[locale] === rest)?.[0] ?? rest
  return { locale, path: internal }
}

/** Kanonska adresa i verzije na drugim jezicima, za `metadata.alternates` javne strane. */
export function alternatesFor(locale: AppLocale, path: string) {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(locales.map((l) => [HREFLANG[l], localePath(l, path)])),
      'x-default': localePath('sr-Latn', path),
    },
  }
}

/** Jezici bliski srpskom: posetilac iz regiona čita srpsku verziju. */
const REGIONAL = new Set(['sr', 'hr', 'bs', 'me', 'sh', 'cnr', 'sl', 'mk'])

/**
 * Jezik za prvu posetu, iz `Accept-Language`: prvi poznat jezik po težini; region daje srpski, a
 * nepoznat jezik engleski. Bez zaglavlja (pretraživači) ostaje srpski, kao i do sada.
 */
export function detectLocale(acceptLanguage: string | null | undefined): AppLocale {
  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = Number(
        params
          .find((p) => p.trim().startsWith('q='))
          ?.trim()
          .slice(2) ?? '1',
      )
      return { base: tag.toLowerCase().split('-')[0]!, q: Number.isFinite(q) ? q : 0, i }
    })
    .filter((x) => x.base && x.base !== '*' && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  if (!ranked.length) return 'sr-Latn'
  for (const { base } of ranked) {
    if (REGIONAL.has(base)) return 'sr-Latn'
    if (base === 'uk') return 'uk'
    if (base === 'en') return 'en'
  }
  return 'en'
}

export { isAppLocale }
