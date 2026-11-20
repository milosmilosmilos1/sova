import { z } from 'zod'

/**
 * Jezici objava (D-108): srpski latinicom i ćirilicom i engleski (ukrajinski uklonjen, D-173). Brend ima svoj jezik
 * (`brands.content_locale`), a Studio i Autopilot mogu da ga promene za jednu objavu ili tok.
 * Jezik interfejsa je posebna stvar (`src/i18n/config.ts`).
 */
export const CONTENT_LOCALES = ['sr-Latn', 'sr-Cyrl', 'en'] as const
export type ContentLocale = (typeof CONTENT_LOCALES)[number]
export const contentLocaleSchema = z.enum(CONTENT_LOCALES)

export function isContentLocale(value: unknown): value is ContentLocale {
  return typeof value === 'string' && (CONTENT_LOCALES as readonly string[]).includes(value)
}

/** Jezik objava novog brenda po jeziku interfejsa (D-156): engleski korisnik ne dobija srpski brend. */
export function contentLocaleForUi(uiLocale: string): ContentLocale {
  return uiLocale === 'en' ? 'en' : 'sr-Latn'
}

/** Jezik brenda iz baze; nepoznata vrednost pada na srpski latinicom. */
export function toContentLocale(value: unknown): ContentLocale {
  return isContentLocale(value) ? value : 'sr-Latn'
}

/** Jezici koji se pišu ćirilicom: kontrola kvaliteta proverava pismo. */
export const CYRILLIC_LOCALES: ReadonlySet<ContentLocale> = new Set(['sr-Cyrl'])

/** Uputstvo modelu na jeziku objave; latinica traži kvačice i kad ih izvori (PDF, stare objave) nemaju. */
export const WRITE_IN: Record<ContentLocale, string> = {
  'sr-Latn': 'Piši na srpskom jeziku, latinicom, sa slovima č, ć, ž, š i đ, i kad ih izvori nemaju.',
  'sr-Cyrl': 'Piši na srpskom jeziku, ćirilicom.',
  en: 'Write in English.',
}

const LANGUAGE_NAME: Record<ContentLocale, string> = {
  'sr-Latn': 'srpskom jeziku, latinicom',
  'sr-Cyrl': 'srpskom jeziku, ćirilicom',
  en: 'engleskom jeziku',
}

/**
 * Jedan jezik u objavi (vlasnik, 21.11.2026: „šta je na engleskom ide samo engleski, šta je srpski
 * ide samo srpski”): sve što ide u objavu je na jeziku objave. Podaci o brendu, teme i poziv na
 * akciju na drugom jeziku se prevode, a vlastita imena ostaju. Ide uz `WRITE_IN` u svako uputstvo
 * koje piše tekst za objavu ili profil.
 */
export const ONE_LANGUAGE: Record<ContentLocale, string> = Object.fromEntries(
  CONTENT_LOCALES.map((locale) => [
    locale,
    `Sav tekst koji pišeš je samo na ${LANGUAGE_NAME[locale]}: naslovi, tekst slajdova, opis, heštegovi i poziv na akciju. Podatke o brendu, teme i poziv na akciju koji su na drugom jeziku prevedi na taj jezik. Ne mešaj jezike u istom tekstu; na drugom jeziku ostaju samo vlastita imena (naziv brenda, mesta, proizvoda).`,
  ]),
) as Record<ContentLocale, string>

/** Kod za `Intl` (datumi i brojevi u tekstu objave). */
export const INTL_LOCALE: Record<ContentLocale, string> = {
  'sr-Latn': 'sr-Latn-RS',
  'sr-Cyrl': 'sr-Cyrl-RS',
  en: 'en-GB',
}
