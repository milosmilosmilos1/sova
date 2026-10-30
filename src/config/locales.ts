import { z } from 'zod'

/**
 * Jezici objava (D-108): srpski latinicom i ćirilicom, engleski i ukrajinski. Brend ima svoj jezik
 * (`brands.content_locale`), a Studio i Autopilot mogu da ga promene za jednu objavu ili tok.
 * Jezik interfejsa je posebna stvar (`src/i18n/config.ts`).
 */
export const CONTENT_LOCALES = ['sr-Latn', 'sr-Cyrl', 'en', 'uk'] as const
export type ContentLocale = (typeof CONTENT_LOCALES)[number]
export const contentLocaleSchema = z.enum(CONTENT_LOCALES)

export function isContentLocale(value: unknown): value is ContentLocale {
  return typeof value === 'string' && (CONTENT_LOCALES as readonly string[]).includes(value)
}

/** Jezik brenda iz baze; nepoznata vrednost pada na srpski latinicom. */
export function toContentLocale(value: unknown): ContentLocale {
  return isContentLocale(value) ? value : 'sr-Latn'
}

/** Jezici koji se pišu ćirilicom: kontrola kvaliteta proverava pismo. */
export const CYRILLIC_LOCALES: ReadonlySet<ContentLocale> = new Set(['sr-Cyrl', 'uk'])

/** Uputstvo modelu na jeziku objave; latinica traži kvačice i kad ih izvori (PDF, stare objave) nemaju. */
export const WRITE_IN: Record<ContentLocale, string> = {
  'sr-Latn': 'Piši na srpskom jeziku, latinicom, sa slovima č, ć, ž, š i đ, i kad ih izvori nemaju.',
  'sr-Cyrl': 'Piši na srpskom jeziku, ćirilicom.',
  en: 'Write in English.',
  uk: 'Пиши українською мовою.',
}

/** Kod za `Intl` (datumi i brojevi u tekstu objave). */
export const INTL_LOCALE: Record<ContentLocale, string> = {
  'sr-Latn': 'sr-Latn-RS',
  'sr-Cyrl': 'sr-Cyrl-RS',
  en: 'en-GB',
  uk: 'uk-UA',
}
