import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { buildCsp } from '@/lib/security/csp'

/**
 * Proxy (Next.js 16): osvežava Supabase sesiju u cookie-jima, grubo štiti
 * /app i /admin, dodaje request id, nonce i CSP. Autorizacija po resursu je
 * na serveru i u bazi (RLS), ne ovde.
 */
const PROTECTED_PREFIXES = ['/app', '/admin']
const AUTH_PAGES = new Set(['/login', '/register', '/forgot-password'])

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const csp = buildCsp({ nonce, isDev, supabaseUrl })
  const pathname = request.nextUrl.pathname

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('x-method', request.method)
  requestHeaders.set('content-security-policy', csp)

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

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (isProtected && !userId) {
    const loginUrl = new URL('/login', request.url)
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

  return finalize(response, response, csp, requestId, pathname)
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
  ],
}
