import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { defaultLocale, isAppLocale, LOCALE_COOKIE, type AppLocale } from './config'
import { LOCALE_HEADER } from './paths'

/**
 * Jezik zahteva: javna strana ga dobija iz adrese (proxy šalje zaglavlje, D-130), a aplikacija iz
 * kolačića koji postavljaju javni sajt, birač jezika i prijava (iz profila).
 */
async function resolveLocale(): Promise<AppLocale> {
  try {
    const fromUrl = (await headers()).get(LOCALE_HEADER)
    if (isAppLocale(fromUrl)) return fromUrl
    const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
    if (isAppLocale(fromCookie)) return fromCookie
  } catch {
    // van konteksta zahteva (npr. statičke stranice)
  }
  return defaultLocale
}

/** Delovi poruka (D-130): stari ekrani se prevode po delovima, svaki deo ima svoje imenske prostore. */
const PARTS = ['a', 'b', 'c', 'd'] as const

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  const [base, ...parts] = await Promise.all([
    import(`./messages/${locale}.json`),
    ...PARTS.map((part) => import(`./messages/parts/${part}/${locale}.json`)),
  ])
  const messages = Object.assign({}, base.default, ...parts.map((m) => m.default))
  return { locale, messages, timeZone: 'Europe/Belgrade' }
})
