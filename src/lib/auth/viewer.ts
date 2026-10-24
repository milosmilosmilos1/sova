import 'server-only'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import type { NextRequest } from 'next/server'
import { cache } from 'react'

import { IMP_COOKIE, mintImpersonationJwt, verifySessionCookie } from '@/lib/auth/impersonation-core'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

export type PlatformRole = Database['public']['Enums']['platform_role']

export interface ViewerProfile {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  locale: 'sr-Latn' | 'en'
  timezone: string
  platformRole: PlatformRole
  isBanned: boolean
  emailVerifiedAt: string | null
  onboardingCompletedAt: string | null
}

export interface Impersonation {
  sessionId: string
  adminId: string
  adminEmail: string
  readOnly: boolean
  expiresAt: string
}

export interface Viewer {
  user: { id: string; email: string }
  profile: ViewerProfile
  /** true kad je sesija na AAL2 (TOTP); traži se za admin rute */
  mfaVerified: boolean
  /** postavljeno kad admin gleda aplikaciju kao ovaj korisnik (D-070) */
  impersonation: Impersonation | null
  /** Supabase klijent sa pravima ovog korisnika (RLS) */
  supabase: SupabaseClient<Database>
}

type ProfileRow = Database['public']['Tables']['profiles']['Row']

function toProfile(row: ProfileRow): ViewerProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    locale: row.locale === 'en' ? 'en' : 'sr-Latn',
    timezone: row.timezone,
    platformRole: row.platform_role,
    isBanned: row.is_banned,
    emailVerifiedAt: row.email_verified_at,
    onboardingCompletedAt: row.onboarding_completed_at,
  }
}

async function buildViewer(
  supabase: SupabaseClient<Database>,
  user: User,
  accessToken?: string,
): Promise<Viewer | null> {
  const { data: row, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) {
    logger.error('viewer_profile_load_failed', { userId: user.id, error })
    return null
  }
  if (!row) {
    logger.warn('viewer_profile_missing', { userId: user.id })
    return null
  }
  let mfaVerified = false
  try {
    // sa Bearer tokenom nema sačuvane sesije, pa se nivo čita iz samog tokena
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken)
    mfaVerified = aal?.currentLevel === 'aal2'
  } catch {
    mfaVerified = false
  }
  return {
    user: { id: user.id, email: user.email ?? row.email },
    profile: toProfile(row),
    mfaVerified,
    impersonation: null,
    supabase,
  }
}

export interface RequestMeta {
  method: string
  path: string
  ip: string | null
  userAgent: string | null
  requestId: string | null
}

const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)$/i

export function firstIp(header: string | null | undefined): string | null {
  const ip = (header ?? '').split(',')[0]?.trim() ?? ''
  return ip && IP_RE.test(ip) ? ip : null
}

/**
 * Impersonacija (D-070): samo stvarni platform admin sa AAL2, potpisan cookie i aktivna sesija u bazi.
 * Vraća viewer ciljnog korisnika (Supabase klijent sa JWT-om za njega) ili null kad nema važeće sesije.
 * Svaki razrešen zahtev se upisuje u admin_audit_log.
 */
async function resolveImpersonation(
  real: Viewer,
  cookieValue: string,
  meta: RequestMeta,
): Promise<Viewer | null> {
  if (real.profile.platformRole !== 'platform_admin' || real.profile.isBanned || !real.mfaVerified)
    return null
  if (!env.IMPERSONATION_SECRET) return null
  const sessionId = verifySessionCookie(cookieValue, env.IMPERSONATION_SECRET)
  if (!sessionId) return null
  if (!env.SUPABASE_JWT_SECRET) {
    logger.error('impersonation_jwt_secret_missing', { sessionId })
    return null
  }
  const admin = createSupabaseAdminClient()
  const { data: s } = await admin.from('impersonation_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!s || s.admin_id !== real.user.id || s.ended_at) return null
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    await admin
      .from('impersonation_sessions')
      .update({ ended_at: new Date().toISOString(), end_reason: 'expired' })
      .eq('id', s.id)
      .is('ended_at', null)
    await admin.from('admin_audit_log').insert({
      admin_id: real.user.id,
      admin_email: real.user.email,
      action: 'impersonation.expired',
      target_type: 'user',
      target_id: s.user_id,
      impersonation_session_id: s.id,
      ip: meta.ip,
      user_agent: meta.userAgent,
      request_id: meta.requestId,
    })
    return null
  }
  const { data: row } = await admin.from('profiles').select('*').eq('id', s.user_id).maybeSingle()
  if (!row || row.platform_role === 'platform_admin') return null
  const readOnly = s.mode === 'read_only'
  const token = mintImpersonationJwt(
    {
      userId: row.id,
      email: row.email,
      sessionId: s.id,
      adminId: real.user.id,
      readOnly,
      expiresAt: s.expires_at,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
    },
    env.SUPABASE_JWT_SECRET,
  )
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_id: real.user.id,
    admin_email: real.user.email,
    action: 'impersonation.request',
    target_type: 'user',
    target_id: row.id,
    after: { method: meta.method, path: meta.path },
    ip: meta.ip,
    user_agent: meta.userAgent,
    impersonation_session_id: s.id,
    request_id: meta.requestId,
  })
  // brif 16: svaki zahtev tokom impersonacije se beleži; bez zapisa nema impersonacije (fail closed)
  if (auditError) {
    logger.error('impersonation_audit_failed', { sessionId: s.id, error: auditError })
    return null
  }
  return {
    user: { id: row.id, email: row.email },
    profile: toProfile(row),
    mfaVerified: false,
    impersonation: {
      sessionId: s.id,
      adminId: real.user.id,
      adminEmail: real.user.email,
      readOnly,
      expiresAt: s.expires_at,
    },
    supabase,
  }
}

/** Stvarni korisnik iz cookie sesije, bez impersonacije (admin panel, provera admina). */
export const getRealViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return buildViewer(supabase, user)
})

/**
 * Efektivni korisnik (Server Components, Server Actions): ciljni korisnik tokom važeće impersonacije,
 * inače stvarni korisnik iz cookie sesije. Memoizovano po zahtevu.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const real = await getRealViewer()
  if (!real) return null
  let value: string | undefined
  let meta: RequestMeta
  try {
    value = (await cookies()).get(IMP_COOKIE)?.value
    if (!value) return real
    const h = await headers()
    meta = {
      method: h.get('x-method') ?? 'GET',
      path: h.get('x-pathname') ?? '',
      ip: firstIp(h.get('x-forwarded-for')),
      userAgent: h.get('user-agent'),
      requestId: h.get('x-request-id'),
    }
  } catch {
    return real
  }
  return (await resolveImpersonation(real, value, meta)) ?? real
})

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

/**
 * Korisnik iz zahteva: `Authorization: Bearer <access token>` (API klijenti, testovi) ili cookie sesija;
 * zatim impersonacija iz cookie-ja `sova_imp` (osim kad je `real: true`, npr. za admin rute).
 * Bearer tok ne koristi next/headers pa radi i van Next konteksta.
 */
export async function getViewerFromRequest(
  req: NextRequest,
  options: { real?: boolean } = {},
): Promise<Viewer | null> {
  const token = bearerToken(req)
  let real: Viewer | null
  if (!token) {
    try {
      real = await getRealViewer()
    } catch (error) {
      // Van Next request konteksta (npr. testovi u procesu) cookies() baca grešku: nema sesije.
      logger.debug('viewer_cookie_context_unavailable', { error })
      return null
    }
  } else {
    const supabase = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL!,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    )
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)
    if (error || !user) return null
    real = await buildViewer(supabase, user, token)
  }
  if (!real || options.real) return real
  const value = req.cookies.get(IMP_COOKIE)?.value
  if (!value) return real
  const meta: RequestMeta = {
    method: req.method,
    path: req.nextUrl.pathname,
    ip: firstIp(req.headers.get('x-forwarded-for')),
    userAgent: req.headers.get('user-agent'),
    requestId: req.headers.get('x-request-id'),
  }
  return (await resolveImpersonation(real, value, meta)) ?? real
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('UNAUTHENTICATED')
    this.name = 'UnauthenticatedError'
  }
}

/** Za Server Components: vraća korisnika ili baca grešku koju layout pretvara u redirect. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) throw new UnauthenticatedError()
  return viewer
}
