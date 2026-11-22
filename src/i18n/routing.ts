import { isAppLocale, type AppLocale } from './config'
import { isPublicPath, localePath, splitLocalePath } from './paths'

/**
 * Odluka proxy-ja o jeziku javnog sajta (D-130), bez Next-a da bi se testirala:
 * - `/en/...` se prepisuje na istu stranu, a kolačić pamti jezik; stare adrese `/uk/...` (ukrajinski je
 *   uklonjen, D-173) trajno vode na istu adresu pod `/en`;
 * - `?lang=` je izričit izbor (birač jezika): kolačić, pa adresa na tom jeziku;
 * - stranica bez prefiksa je srpska. Na englesku verziju ide samo posetilac koji je engleski izabrao
 *   (kolačić iz birača jezika ili sa strane pod `/en`). Jezik pregledača se ne gleda (D-187): Sova je
 *   podrazumevano na srpskom, i kad je pregledač na engleskom.
 */
export type LocaleRoute =
  | { kind: 'redirect'; location: string; cookie: AppLocale | null; permanent?: true }
  | { kind: 'rewrite'; path: string; locale: AppLocale; cookie: AppLocale | null }
  | { kind: 'next'; path: string; locale: AppLocale | null; cookie: AppLocale | null }

export interface LocaleRequest {
  pathname: string
  /** upit sa `?` ili prazan */
  search: string
  cookie: string | undefined
  method: string
  accept: string | null
  /** zahtev za RSC (navigacija unutar aplikacije), ne cela strana */
  rsc: boolean
}

/** Adrese uklonjene ukrajinske verzije sajta (D-173). */
const LEGACY_UK = /^\/uk(\/.*)?$/

export function routeLocale(req: LocaleRequest): LocaleRoute {
  const legacy = LEGACY_UK.exec(req.pathname)
  if (legacy)
    return { kind: 'redirect', location: `/en${legacy[1] ?? ''}${req.search}`, cookie: 'en', permanent: true }
  const prefixed = splitLocalePath(req.pathname)
  if (prefixed) {
    const cookie = req.cookie === prefixed.locale ? null : prefixed.locale
    // /en/app i slično: aplikacija nema prefiks, a jezik se pamti
    if (!isPublicPath(prefixed.path))
      return { kind: 'redirect', location: `${prefixed.path}${req.search}`, cookie }
    // članak bloga sa srpskim slugom pod /en: trajno na adresu sa engleskim slugom (D-186)
    if (prefixed.path.startsWith('/blog/')) {
      const canonical = localePath(prefixed.locale, prefixed.path)
      if (canonical !== req.pathname.replace(/\/+$/, ''))
        return { kind: 'redirect', location: `${canonical}${req.search}`, cookie, permanent: true }
    }
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
  if (document && remembered && remembered !== 'sr-Latn')
    return {
      kind: 'redirect',
      location: `${localePath(remembered, req.pathname)}${req.search}`,
      cookie: null,
    }
  return { kind: 'next', path: req.pathname, locale: 'sr-Latn', cookie: null }
}
