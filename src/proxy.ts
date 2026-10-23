import { NextResponse, type NextRequest } from 'next/server'

import { buildCsp } from '@/lib/security/csp'

/**
 * Proxy (Next.js 16, nasleđuje middleware): request id, CSP sa nonce-om,
 * bezbednosni headeri. Autorizacija po resursu je na serveru i u bazi,
 * ovde samo grubi gate (dodaje se u fazi 4 uz osvežavanje Supabase sesije).
 */
export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const csp = buildCsp({ nonce, isDev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', csp)
  response.headers.set('x-request-id', requestId)
  if (request.nextUrl.pathname.startsWith('/admin')) {
    response.headers.set('x-robots-tag', 'noindex, nofollow')
  }
  return response
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
