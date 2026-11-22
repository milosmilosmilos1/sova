import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { nextPathSchema } from '@/lib/schemas/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

/**
 * Kuda posle prijave. OAuth i stari linkovi nose `next` direktno. Šabloni mejlova
 * (supabase/templates) šalju `redirect_to={{ .RedirectTo }}`, a to je ovaj isti
 * callback sa `?next=`, pa se `next` čita iz njega.
 */
function nextFrom(params: URLSearchParams): string | undefined {
  const direct = nextPathSchema.parse(params.get('next') ?? undefined)
  if (direct) return direct
  const redirectTo = params.get('redirect_to')
  if (!redirectTo) return undefined
  try {
    return nextPathSchema.parse(new URL(redirectTo).searchParams.get('next') ?? undefined)
  } catch {
    return undefined
  }
}

/**
 * Povratak sa Supabase Auth linkova (potvrda emaila, magic link, reset lozinke)
 * i OAuth provajdera. Cookie-ji sesije se upisuju ovde.
 *
 * Mejlovi nose `token_hash`, pa link radi i kad se otvori u drugom pregledaču ili
 * na telefonu. PKCE `code` (Google i podrazumevani Supabase šabloni) traži verifier
 * iz pregledača u kom je tok počeo.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = nextFrom(params) ?? '/app'
  const base = env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const toLogin = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, base))
  const supabase = await createSupabaseServerClient()

  const code = params.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, base))
    logger.warn('auth_callback_exchange_failed', { message: error.message, code: error.code })
    // Link iz mejla otvoren u drugom pregledaču: Supabase je adresu potvrdio pre
    // preusmeravanja, ali sesija ne može da se napravi bez verifier-a.
    return toLogin(error.code === 'pkce_code_verifier_not_found' ? 'browser' : 'link')
  }

  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(new URL(next, base))
    logger.warn('auth_callback_otp_failed', { message: error.message, type })
    return toLogin('link')
  }

  const providerError = params.get('error_description') ?? params.get('error')
  if (providerError) logger.warn('auth_callback_provider_error', { providerError })
  return toLogin(providerError ? 'provider' : 'link')
}
