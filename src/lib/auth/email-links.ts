import 'server-only'

import { createElement } from 'react'

import { AUTH_LINK_COPY, AuthLinkEmail, type AuthLinkKind } from '@/emails/auth-link'
import { isAppLocale, type AppLocale } from '@/i18n/config'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Mejlove za nalog šalje Sova, ne Supabase (D-187). `admin.generateLink` pravi token bez slanja, a link
 * vodi na naš callback sa `token_hash`. Zato link radi u svakom pregledaču i na telefonu (ne treba PKCE
 * verifier iz pregledača u kom je nalog napravljen), stiže sa EMAIL_FROM preko Resend-a i na jeziku
 * naloga. Ne zavisi od SMTP-a i šablona u Supabase podešavanjima.
 *
 * Pravila koja se ne vide spolja: postojanje naloga se ne otkriva (pozivalac uvek vraća isti odgovor),
 * a `magiclink` se pravi samo za nalog koji postoji, jer bi ga generateLink inače napravio.
 */

export class AuthEmailError extends Error {}

export function authLinkUrl(kind: AuthLinkKind, tokenHash: string, next: string): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: kind === 'recovery' ? 'recovery' : 'email',
    next,
  })
  return `${env.NEXT_PUBLIC_APP_URL}/auth/callback?${params.toString()}`
}

async function deliver(input: {
  kind: AuthLinkKind
  to: string
  tokenHash: string
  next: string
  locale: AppLocale
  name: string | null
}): Promise<void> {
  const url = authLinkUrl(input.kind, input.tokenHash, input.next)
  await sendEmail({
    to: input.to,
    subject: AUTH_LINK_COPY[input.locale][input.kind].subject,
    react: createElement(AuthLinkEmail, { kind: input.kind, url, name: input.name, locale: input.locale }),
    tags: { type: `auth_${input.kind}` },
  })
}

interface Account {
  id: string
  name: string | null
  locale: AppLocale | null
}

async function findAccount(email: string): Promise<Account | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('profiles')
    .select('id, full_name, locale')
    .eq('email', email)
    .maybeSingle()
  if (error) {
    logger.error('auth_email_lookup_failed', { error: error.message })
    throw new AuthEmailError(error.message)
  }
  if (!data) return null
  return { id: data.id, name: data.full_name, locale: isAppLocale(data.locale) ? data.locale : null }
}

export type SignupResult =
  | { status: 'sent'; userId: string }
  /** potvrđen nalog sa tim emailom već postoji: ništa se ne šalje, ekran je isti */
  | { status: 'exists' }
  | { status: 'rejected'; message: string }

/** Nov nalog (ili nalog koji još nije potvrđen) dobija mejl sa linkom za potvrdu. */
export async function startSignup(input: {
  email: string
  password: string
  fullName: string
  locale: AppLocale
  next: string
}): Promise<SignupResult> {
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: 'signup',
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, locale: input.locale } },
  })
  if (error) {
    if (error.code === 'email_exists' || error.code === 'user_already_exists') return { status: 'exists' }
    if (error.status && error.status < 500 && error.code !== 'over_email_send_rate_limit')
      return { status: 'rejected', message: error.message }
    logger.error('auth_signup_link_failed', { code: error.code, status: error.status })
    throw new AuthEmailError(error.message)
  }
  await deliver({
    kind: 'confirm',
    to: input.email,
    tokenHash: data.properties.hashed_token,
    next: input.next,
    locale: input.locale,
    name: input.fullName,
  })
  return { status: 'sent', userId: data.user.id }
}

/** Link za prijavu, samo za postojeći nalog. Vraća da li je mejl poslat (pozivalac to ne otkriva). */
export async function sendLoginLink(input: {
  email: string
  next: string
  locale: AppLocale
}): Promise<boolean> {
  const account = await findAccount(input.email)
  if (!account) return false
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
  })
  if (error) {
    logger.error('auth_login_link_failed', { code: error.code, status: error.status })
    throw new AuthEmailError(error.message)
  }
  await deliver({
    kind: 'login',
    to: input.email,
    tokenHash: data.properties.hashed_token,
    next: input.next,
    locale: account.locale ?? input.locale,
    name: account.name,
  })
  return true
}

/**
 * Ponovo šalje link za potvrdu nalogu koji još nije potvrđen. Link je `magiclink`: Supabase pri
 * proveri potvrđuje adresu i prijavljuje korisnika, a lozinka ostaje ista.
 */
export async function resendConfirmation(input: {
  email: string
  locale: AppLocale
  next?: string
}): Promise<'sent' | 'confirmed' | 'missing'> {
  const account = await findAccount(input.email)
  if (!account) return 'missing'
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
  })
  if (error) {
    logger.error('auth_confirm_link_failed', { code: error.code, status: error.status })
    throw new AuthEmailError(error.message)
  }
  if (data.user.email_confirmed_at) return 'confirmed'
  await deliver({
    kind: 'confirm',
    to: input.email,
    tokenHash: data.properties.hashed_token,
    next: input.next ?? '/app/onboarding',
    locale: account.locale ?? input.locale,
    name: account.name,
  })
  return 'sent'
}

/** Link za novu lozinku, samo za postojeći nalog. */
export async function sendRecoveryLink(input: { email: string; locale: AppLocale }): Promise<boolean> {
  const account = await findAccount(input.email)
  if (!account) return false
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: 'recovery',
    email: input.email,
  })
  if (error) {
    if (error.code === 'user_not_found') return false
    logger.error('auth_recovery_link_failed', { code: error.code, status: error.status })
    throw new AuthEmailError(error.message)
  }
  await deliver({
    kind: 'recovery',
    to: input.email,
    tokenHash: data.properties.hashed_token,
    next: '/reset-password',
    locale: account.locale ?? input.locale,
    name: account.name,
  })
  return true
}
