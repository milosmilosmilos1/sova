import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { isAppLocale, LOCALE_COOKIE, type AppLocale } from '@/i18n/config'
import { LOCALE_HEADER, localePath, PATH_HEADER } from '@/i18n/paths'
import { routeLocale } from '@/i18n/routing'
import { buildCsp } from '@/lib/security/csp'

/**
 * Proxy (Next.js 16): osvežava Supabase sesiju u cookie-jima, grubo štiti
 * /app i /admin, dodaje request id, nonce i CSP, i vodi jezik javnog sajta
 * (D-130: /en i /uk). Autorizacija po resursu je na serveru i u bazi (RLS), ne ovde.
 */
const PROTECTED_PREFIXES = ['/app', '/admin']
const AUTH_PAGES = new Set(['/login', '/register', '/forgot-password'])
const LOCALE_COOKIE_OPTIONS = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const }

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const csp = buildCsp({ nonce, isDev, supabaseUrl })
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const route = routeLocale({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookie: cookieLocale,
    method: request.method,
    accept: request.headers.get('accept'),
    acceptLanguage: request.headers.get('accept-language'),
    userAgent: request.headers.get('user-agent'),
    rsc: request.headers.has('rsc'),
  })
  // interna putanja: bez prefiksa jezika (/en/contact → /kontakt)
  const pathname = route.kind === 'redirect' ? request.nextUrl.pathname : route.path

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('x-method', request.method)
  requestHeaders.set('content-security-policy', csp)
  // jezik strane dolazi samo iz adrese; zaglavlje od klijenta se ne prihvata
  requestHeaders.delete(LOCALE_HEADER)
  requestHeaders.delete(PATH_HEADER)
  if (route.kind !== 'redirect' && route.locale) {
    requestHeaders.set(LOCALE_HEADER, route.locale)
    requestHeaders.set(PATH_HEADER, pathname)
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  let userId: string | null = null
  let supabase: ReturnType<typeof createServerClient> | null = null
  if (supabaseUrl && supabaseAnonKey) {
    supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request: { headers: requestHeaders } })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    })
    // getClaims proverava potpis JWT-a (lokalno preko JWKS keša) i po potrebi osvežava sesiju.
    const { data } = await supabase.auth.getClaims()
    userId = (data?.claims?.sub as string | undefined) ?? null
  }

  const locale: AppLocale = isAppLocale(cookieLocale) ? cookieLocale : 'sr-Latn'
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (isProtected && !userId) {
    const loginUrl = new URL(localePath(locale, '/login'), request.url)
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return finalize(NextResponse.redirect(loginUrl), response, csp, requestId, pathname)
  }
  if (AUTH_PAGES.has(pathname) && userId) {
    return finalize(NextResponse.redirect(new URL('/app', request.url)), response, csp, requestId, pathname)
  }

  // /admin: ko nije platform_admin dobija pravi 404 (rewrite na nepostojeću rutu), da se panel ne otkriva.
  // Layout to proverava ponovo zajedno sa MFA nivoom; ovde je prva linija jer streaming inače već pošalje 200.
  if (supabase && userId && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('platform_role, is_banned')
      .eq('id', userId)
      .maybeSingle()
    const isAdmin = profile?.platform_role === 'platform_admin' && !profile?.is_banned
    if (!isAdmin) {
      return finalize(
        NextResponse.rewrite(new URL('/__admin-not-found__', request.url)),
        response,
        csp,
        requestId,
        pathname,
      )
    }
  }

  // prijavljen korisnik bez kolačića jezika (nov uređaj, link iz mejla): jezik iz profila (D-130)
  let profileLocale: AppLocale | null = null
  if (
    supabase &&
    userId &&
    !isAppLocale(cookieLocale) &&
    route.kind === 'next' &&
    !route.locale &&
    !pathname.startsWith('/api/')
  ) {
    const { data: row } = await supabase.from('profiles').select('locale').eq('id', userId).maybeSingle()
    if (isAppLocale(row?.locale)) profileLocale = row.locale
  }

  // jezik javnog sajta (D-130): preusmerenje na verziju na jeziku ili prepisivanje /en i /uk
  let target = response
  if (profileLocale) {
    requestHeaders.set(LOCALE_HEADER, profileLocale)
    target = NextResponse.next({ request: { headers: requestHeaders } })
    target.cookies.set(LOCALE_COOKIE, profileLocale, LOCALE_COOKIE_OPTIONS)
  }
  if (route.kind === 'redirect') target = NextResponse.redirect(new URL(route.location, request.url))
  if (route.kind === 'rewrite') {
    const url = request.nextUrl.clone()
    url.pathname = route.path
    target = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }
  if (route.cookie) target.cookies.set(LOCALE_COOKIE, route.cookie, LOCALE_COOKIE_OPTIONS)
  return finalize(target, response, csp, requestId, pathname)
}

function finalize(
  target: NextResponse,
  source: NextResponse,
  csp: string,
  requestId: string,
  pathname: string,
) {
  if (target !== source) {
    for (const cookie of source.cookies.getAll()) target.cookies.set(cookie)
  }
  target.headers.set('content-security-policy', csp)
  target.headers.set('x-request-id', requestId)
  if (pathname.startsWith('/admin') || pathname.startsWith('/app')) {
    target.headers.set('x-robots-tag', 'noindex, nofollow')
  }
  return target
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    // i unapred učitane strane na jeziku idu kroz proxy: bez prepisivanja /en/... nema stranu iza sebe
    '/(en|uk)',
    '/(en|uk)/:path*',
  ],
}
