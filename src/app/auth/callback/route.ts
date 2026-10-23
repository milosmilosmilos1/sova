import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { nextPathSchema } from '@/lib/schemas/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

/**
 * Povratak sa Supabase Auth linkova (potvrda emaila, magic link, reset lozinke)
 * i OAuth provajdera. PKCE `code` se menja za sesiju; cookie-ji se upisuju ovde.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = nextPathSchema.parse(params.get('next') ?? undefined) ?? '/app'
  const base = env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createSupabaseServerClient()

  const code = params.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, base))
    logger.warn('auth_callback_exchange_failed', { message: error.message })
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('link')}`, base))
  }

  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(new URL(next, base))
    logger.warn('auth_callback_otp_failed', { message: error.message, type })
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('link')}`, base))
  }

  const providerError = params.get('error_description') ?? params.get('error')
  if (providerError) logger.warn('auth_callback_provider_error', { providerError })
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(providerError ? 'provider' : 'link')}`, base),
  )
}
