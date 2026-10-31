import { isAppLocale, type AppLocale } from './config'
import { detectLocale, isPublicPath, localePath, splitLocalePath } from './paths'

/**
 * Odluka proxy-ja o jeziku javnog sajta (D-130), bez Next-a da bi se testirala:
 * - `/en/...` i `/uk/...` se prepisuju na istu stranu, a kolačić pamti jezik;
 * - `?lang=` je izričit izbor (birač jezika): kolačić, pa adresa na tom jeziku;
 * - stranica bez prefiksa je srpska; posetilac koji je izabrao drugi jezik (kolačić) ili čiji
 *   pregledač pri prvoj poseti traži engleski ili ukrajinski ide na tu verziju. Botovi i servisi za
 *   pregled linkova ostaju na adresi koju su tražili, da deljen link ima pravi jezik.
 */
export type LocaleRoute =
  | { kind: 'redirect'; location: string; cookie: AppLocale | null }
  | { kind: 'rewrite'; path: string; locale: AppLocale; cookie: AppLocale | null }
  | { kind: 'next'; path: string; locale: AppLocale | null; cookie: AppLocale | null }

export interface LocaleRequest {
  pathname: string
  /** upit sa `?` ili prazan */
  search: string
  cookie: string | undefined
  method: string
  accept: string | null
  acceptLanguage: string | null
  userAgent: string | null
  /** zahtev za RSC (navigacija unutar aplikacije), ne cela strana */
  rsc: boolean
}

const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|preview|embed|whatsapp|telegram|discord|linkedin|skype|vkshare|pinterest|headless/i

export function routeLocale(req: LocaleRequest): LocaleRoute {
  const prefixed = splitLocalePath(req.pathname)
  if (prefixed) {
    const cookie = req.cookie === prefixed.locale ? null : prefixed.locale
    // /en/app i slično: aplikacija nema prefiks, a jezik se pamti
    if (!isPublicPath(prefixed.path))
      return { kind: 'redirect', location: `${prefixed.path}${req.search}`, cookie }
    return { kind: 'rewrite', path: prefixed.path, locale: prefixed.locale, cookie }
  }
  if (!isPublicPath(req.pathname)) return { kind: 'next', path: req.pathname, locale: null, cookie: null }

  const params = new URLSearchParams(req.search)
  const asked = params.get('lang')
  if (isAppLocale(asked)) {
    params.delete('lang')
    const rest = params.toString()
    return {
      kind: 'redirect',
      location: `${localePath(asked, req.pathname)}${rest ? `?${rest}` : ''}`,
      cookie: asked,
    }
  }

  const remembered = isAppLocale(req.cookie) ? req.cookie : null
  const document = req.method === 'GET' && !req.rsc && (req.accept ?? '').includes('text/html')
  if (document) {
    const target =
      remembered ?? (BOT.test(req.userAgent ?? '') ? 'sr-Latn' : detectLocale(req.acceptLanguage))
    if (target !== 'sr-Latn')
      return {
        kind: 'redirect',
        location: `${localePath(target, req.pathname)}${req.search}`,
        cookie: remembered ? null : target,
      }
  }
  return {
    kind: 'next',
    path: req.pathname,
    locale: 'sr-Latn',
    cookie: remembered || !document ? null : 'sr-Latn',
  }
}
