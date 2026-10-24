'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { isDisposableEmail } from '@/config/disposable-domains'
import { isApiError } from '@/lib/api/errors'
import { formValues, parseForm, type FormState } from '@/lib/auth/form-state'
import { authErrorMessage } from '@/lib/auth/messages'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { getRealViewer, getViewer, type Viewer } from '@/lib/auth/viewer'
import {
  clearImpersonationCookieName,
  endImpersonationForAdmin,
} from '@/services/admin/impersonation-actions'
import { getMembership, setCurrentWorkspaceCookie } from '@/lib/auth/workspace'
import { setCurrentBrandCookie } from '@/lib/auth/brand'
import { env } from '@/lib/env'
import { LOCALE_COOKIE } from '@/i18n/config'
import { actionBlock, type ActionKind } from '@/lib/auth/impersonation-core'
import { logger } from '@/lib/logger'
import { cancelScheduledPostsForBrand } from '@/services/posts/publisher'
import { rateLimit } from '@/lib/ratelimit'
import {
  forgotPasswordSchema,
  loginSchema,
  magicLinkSchema,
  nextPathSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from '@/lib/schemas/auth'
import {
  createBrandSchema,
  createInvitationSchema,
  createWorkspaceSchema,
  removeMemberSchema,
  updateMemberSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
} from '@/lib/schemas/workspace'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createBrand, deleteBrand } from '@/services/brands'
import {
  acceptInvitation,
  createInvitation,
  removeMember,
  revokeInvitation,
  updateMember,
} from '@/services/team'
import { createWorkspace, updateWorkspace } from '@/services/workspaces'

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? '127.0.0.1'
}

/** redirect() sa typedRoutes traži Route tip; putanje su već validirane (nextPathSchema). */
function go(path: string): never {
  redirect(path as Route)
}

function callbackUrl(next?: string): string {
  const base = `${env.NEXT_PUBLIC_APP_URL}/auth/callback`
  return next ? `${base}?next=${encodeURIComponent(next)}` : base
}

function fail(message: string, values?: Record<string, string>, code?: string): FormState {
  return { ok: false, message, values, code }
}

/** Impersonacija (D-070): šta serverska akcija sme dok admin gleda kao korisnik. */
function impersonationGuard(viewer: Viewer, kind: ActionKind): string | null {
  return viewer.impersonation ? actionBlock(viewer.impersonation.readOnly, kind) : null
}

function errorState(error: unknown, values?: Record<string, string>): FormState {
  if (isApiError(error)) return fail(error.message, values, error.code)
  logger.error('action_failed', { error })
  return fail('Došlo je do greške. Pokušajte ponovo.', values)
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData)
  if (!parsed.success) return parsed.state
  const { email, password, next } = parsed.data
  const ip = await clientIp()
  const rl = await rateLimit(`login:${ip}:${email}`, { limit: 5, windowSec: 15 * 60 })
  if (!rl.success)
    return fail('Previše pokušaja prijave. Sačekajte 15 minuta pa pokušajte ponovo.', { email })

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const unverified = error.message.toLowerCase().includes('not confirmed')
    return fail(authErrorMessage(error.message), { email }, unverified ? 'unverified' : undefined)
  }
  go(next ?? '/app')
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(registerSchema, formData)
  if (!parsed.success) return parsed.state
  const { fullName, email, password, turnstileToken, next } = parsed.data
  const values = { fullName, email }
  const ip = await clientIp()

  const rl = await rateLimit(`register:${ip}`, { limit: 3, windowSec: 60 * 60 })
  if (!rl.success) return fail('Previše registracija sa ove adrese. Pokušajte za sat vremena.', values)
  if (isDisposableEmail(email)) {
    return fail('Jednokratne email adrese nisu dozvoljene. Upotrebite stalnu adresu.', values)
  }
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return fail('Provera da niste bot nije uspela. Osvežite stranicu pa pokušajte ponovo.', values)
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: callbackUrl(next ?? '/app/onboarding') },
  })
  if (error) return fail(authErrorMessage(error.message), values)
  if (data.session) go(next ?? '/app/onboarding')
  // Potvrda emaila je obavezna; i za već postojeći email vraćamo isti ekran (bez otkrivanja).
  go(`/verify-email?email=${encodeURIComponent(email)}`)
}

export async function magicLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(magicLinkSchema, formData)
  if (!parsed.success) return parsed.state
  const { email, next } = parsed.data
  const ip = await clientIp()
  const rl = await rateLimit(`magic:${ip}`, { limit: 5, windowSec: 15 * 60 })
  if (!rl.success) return fail('Previše zahteva. Sačekajte 15 minuta.', { email })

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next ?? '/app'), shouldCreateUser: false },
  })
  if (error && !error.message.toLowerCase().includes('signups not allowed')) {
    return fail(authErrorMessage(error.message), { email })
  }
  return {
    ok: true,
    code: 'check_email',
    values: { email },
    message: 'Ako nalog postoji, poslali smo link za prijavu.',
  }
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  const next = nextPathSchema.parse(formData.get('next')?.toString())
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl(next ?? '/app'),
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  })
  if (error || !data.url) {
    logger.error('google_oauth_start_failed', { error })
    redirect('/login?error=google')
  }
  go(data.url)
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(forgotPasswordSchema, formData)
  if (!parsed.success) return parsed.state
  const { email } = parsed.data
  const ip = await clientIp()
  const rl = await rateLimit(`forgot:${ip}`, { limit: 5, windowSec: 15 * 60 })
  if (!rl.success) return fail('Previše zahteva. Sačekajte 15 minuta.', { email })

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl('/reset-password'),
  })
  if (error && error.message.toLowerCase().includes('rate limit'))
    return fail(authErrorMessage(error.message), { email })
  return {
    ok: true,
    code: 'check_email',
    values: { email },
    message: 'Ako nalog postoji, poslali smo link za promenu lozinke.',
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(resetPasswordSchema, formData)
  if (!parsed.success) return parsed.state
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Link za promenu lozinke je istekao. Zatražite nov.', undefined, 'expired')
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return fail(authErrorMessage(error.message))
  redirect('/app?password=changed')
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(resendVerificationSchema, formData)
  if (!parsed.success) return parsed.state
  const { email } = parsed.data
  const ip = await clientIp()
  const rl = await rateLimit(`resend:${ip}:${email}`, { limit: 3, windowSec: 60 * 60 })
  if (!rl.success)
    return fail('Već smo poslali nekoliko poruka. Proverite i spam folder, pa pokušajte kasnije.', { email })
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: callbackUrl('/app/onboarding') },
  })
  if (error && error.message.toLowerCase().includes('rate limit'))
    return fail(authErrorMessage(error.message), { email })
  return { ok: true, message: 'Poslali smo novu poruku za potvrdu.', values: { email } }
}

export async function signOutAction(): Promise<void> {
  const viewer = await getViewer()
  if (viewer?.impersonation) {
    const real = await getRealViewer()
    const h = await headers()
    if (real) {
      await endImpersonationForAdmin(real, 'sign_out', {
        ip: h.get('x-forwarded-for'),
        userAgent: h.get('user-agent'),
        requestId: h.get('x-request-id'),
      })
    }
    ;(await cookies()).delete(clearImpersonationCookieName)
    redirect(`/admin/users/${viewer.user.id}` as Route)
  }
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  // `odjava=1`: strana za prijavu javlja ostalim tabovima da je sesija završena (EDGE_CASES A7)
  redirect('/login?odjava=1')
}

// ---------------------------------------------------------------------------
// Workspace, tim, brendovi
// ---------------------------------------------------------------------------

export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/onboarding')
  const blocked = impersonationGuard(viewer, 'forbidden')
  if (blocked) return fail(blocked)
  const parsed = parseForm(createWorkspaceSchema, formData)
  if (!parsed.success) return parsed.state
  let result: { workspaceId: string; brandId: string }
  try {
    result = await createWorkspace(viewer, parsed.data)
  } catch (error) {
    return errorState(error, formValues(formData, ['name', 'type', 'brandName', 'websiteUrl']))
  }
  await setCurrentWorkspaceCookie(result.workspaceId)
  await setCurrentBrandCookie(result.brandId)
  await viewer.supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', viewer.user.id)
    .is('onboarding_completed_at', null)
  redirect('/app')
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const workspaceId = formData.get('workspaceId')?.toString() ?? ''
  const membership = await getMembership(viewer, workspaceId)
  if (membership) {
    await setCurrentWorkspaceCookie(workspaceId)
    const store = await cookies()
    store.delete('sova_brand')
  }
  const back = nextPathSchema.parse(formData.get('next')?.toString()) ?? '/app'
  go(back)
}

export async function switchBrandAction(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const brandId = formData.get('brandId')?.toString() ?? ''
  if (/^[0-9a-f-]{36}$/i.test(brandId)) await setCurrentBrandCookie(brandId)
  const back = nextPathSchema.parse(formData.get('next')?.toString()) ?? '/app'
  go(back)
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const blocked = impersonationGuard(viewer, 'edit')
  if (blocked) return fail(blocked)
  const parsed = parseForm(updateProfileSchema, formData)
  if (!parsed.success) return parsed.state
  const { fullName, locale, timezone } = parsed.data
  const { error } = await viewer.supabase
    .from('profiles')
    .update({ full_name: fullName, locale, timezone })
    .eq('id', viewer.user.id)
  if (error) return errorState(error, { fullName, locale, timezone })
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/app', 'layout')
  return { ok: true, message: 'Profil je sačuvan.', values: { fullName, locale, timezone } }
}

export async function updateWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const blocked = impersonationGuard(viewer, 'edit')
  if (blocked) return fail(blocked)
  const workspaceId = formData.get('workspaceId')?.toString() ?? ''
  const parsed = parseForm(updateWorkspaceSchema, formData)
  if (!parsed.success) return parsed.state
  try {
    await updateWorkspace(viewer, workspaceId, parsed.data)
  } catch (error) {
    return errorState(error, formValues(formData, ['name', 'type']))
  }
  revalidatePath('/app', 'layout')
  return { ok: true, message: 'Radni prostor je sačuvan.', values: formValues(formData, ['name', 'type']) }
}

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const blocked = impersonationGuard(viewer, 'forbidden')
  if (blocked) return fail(blocked)
  const brandIdsRaw = formData.getAll('brandIds').map(String).filter(Boolean)
  const parsed = createInvitationSchema.safeParse({
    workspaceId: formData.get('workspaceId'),
    email: formData.get('email'),
    role: formData.get('role'),
    brandIds: brandIdsRaw.length ? brandIdsRaw : undefined,
  })
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Proverite unos.', formValues(formData, ['email', 'role']))
  }
  try {
    const result = await createInvitation(viewer, parsed.data)
    revalidatePath('/app/team')
    return {
      ok: true,
      message: result.acceptUrl
        ? `Pozivnica je napravljena. Email servis nije podešen u DEV-u, pa je link ovde: ${result.acceptUrl}`
        : `Pozivnica je poslata na ${parsed.data.email}.`,
    }
  } catch (error) {
    return errorState(error, formValues(formData, ['email', 'role']))
  }
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (impersonationGuard(viewer, 'forbidden')) return
  const workspaceId = formData.get('workspaceId')?.toString() ?? ''
  const parsed = updateMemberSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role') || undefined,
  })
  if (parsed.success) {
    try {
      await updateMember(viewer, workspaceId, parsed.data)
    } catch (error) {
      logger.warn('update_member_failed', { error })
    }
  }
  revalidatePath('/app/team')
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (impersonationGuard(viewer, 'forbidden')) return
  const workspaceId = formData.get('workspaceId')?.toString() ?? ''
  const parsed = removeMemberSchema.safeParse({ userId: formData.get('userId') })
  if (parsed.success) {
    try {
      await removeMember(viewer, workspaceId, parsed.data.userId)
    } catch (error) {
      logger.warn('remove_member_failed', { error })
    }
  }
  revalidatePath('/app/team')
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (impersonationGuard(viewer, 'forbidden')) return
  const workspaceId = formData.get('workspaceId')?.toString() ?? ''
  const invitationId = formData.get('invitationId')?.toString() ?? ''
  try {
    await revokeInvitation(viewer, workspaceId, invitationId)
  } catch (error) {
    logger.warn('revoke_invitation_failed', { error })
  }
  revalidatePath('/app/team')
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const token = formData.get('token')?.toString() ?? ''
  const viewer = await getViewer()
  if (!viewer) go(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
  if (impersonationGuard(viewer, 'forbidden'))
    go(`/invite/${token}?error=${encodeURIComponent('Pozivnica se ne prihvata tokom impersonacije.')}`)
  try {
    const result = await acceptInvitation(viewer, token)
    await setCurrentWorkspaceCookie(result.workspaceId)
  } catch (error) {
    const message = isApiError(error) ? error.message : 'Pozivnica nije važeća.'
    go(`/invite/${token}?error=${encodeURIComponent(message)}`)
  }
  redirect('/app')
}

export async function createBrandAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const blocked = impersonationGuard(viewer, 'edit')
  if (blocked) return fail(blocked)
  const parsed = createBrandSchema.safeParse({
    workspaceId: formData.get('workspaceId'),
    name: formData.get('name'),
    websiteUrl: formData.get('websiteUrl') || undefined,
    timezone: formData.get('timezone') || undefined,
    contentLocale: formData.get('contentLocale') || undefined,
  })
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? 'Proverite unos.',
      formValues(formData, ['name', 'websiteUrl']),
    )
  }
  try {
    const brand = await createBrand(viewer, parsed.data)
    await setCurrentBrandCookie(brand.id)
  } catch (error) {
    return errorState(error, formValues(formData, ['name', 'websiteUrl']))
  }
  revalidatePath('/app', 'layout')
  return { ok: true, message: 'Brend je napravljen.' }
}

export async function deleteBrandAction(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (impersonationGuard(viewer, 'forbidden')) return
  const brandId = formData.get('brandId')?.toString() ?? ''
  try {
    await deleteBrand(viewer, brandId)
    const canceled = await cancelScheduledPostsForBrand(brandId, viewer.user.id)
    if (canceled) logger.info('brand_deleted_posts_canceled', { brandId, canceled })
  } catch (error) {
    logger.warn('delete_brand_failed', { error })
  }
  revalidatePath('/app', 'layout')
}
