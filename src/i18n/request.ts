import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { defaultLocale, isAppLocale, LOCALE_COOKIE, type AppLocale } from './config'

async function resolveLocale(): Promise<AppLocale> {
  try {
    const store = await cookies()
    const fromCookie = store.get(LOCALE_COOKIE)?.value
    if (isAppLocale(fromCookie)) return fromCookie
  } catch {
    // van konteksta zahteva (npr. statičke stranice)
  }
  return defaultLocale
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  const messages = (await import(`./messages/${locale}.json`)).default
  return { locale, messages, timeZone: 'Europe/Belgrade' }
})
