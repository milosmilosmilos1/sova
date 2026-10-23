import 'server-only'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { cache } from 'react'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
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
  readOnly: boolean
  expiresAt: string
}

export interface Viewer {
  user: { id: string; email: string }
  profile: ViewerProfile
  /** true kad je sesija na AAL2 (TOTP); traži se za admin rute */
  mfaVerified: boolean
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

async function buildViewer(supabase: SupabaseClient<Database>, user: User): Promise<Viewer | null> {
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
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
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

/** Korisnik iz cookie sesije (Server Components, Server Actions, Route Handlers). Memoizovano po zahtevu. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return buildViewer(supabase, user)
})

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

/**
 * Korisnik iz zahteva: `Authorization: Bearer <access token>` (API klijenti, testovi)
 * ili cookie sesija. Bearer tok ne koristi next/headers pa radi i van Next konteksta.
 */
export async function getViewerFromRequest(req: NextRequest): Promise<Viewer | null> {
  const token = bearerToken(req)
  if (!token) {
    try {
      return await getViewer()
    } catch (error) {
      // Van Next request konteksta (npr. testovi u procesu) cookies() baca grešku: nema sesije.
      logger.debug('viewer_cookie_context_unavailable', { error })
      return null
    }
  }
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return buildViewer(supabase, user)
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
