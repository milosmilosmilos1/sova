export const locales = ['sr-Latn', 'en', 'uk'] as const
export type AppLocale = (typeof locales)[number]
export const defaultLocale: AppLocale = 'sr-Latn'
export const LOCALE_COOKIE = 'sova_locale'

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}
