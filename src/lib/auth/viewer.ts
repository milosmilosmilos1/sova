import 'server-only'

import { cache } from 'react'

/**
 * Ko gleda: prijavljen korisnik, njegov profil i (od faze 13) impersonacija.
 * Faza 2: samo tipovi i prazna implementacija. Faza 4 puni iz Supabase Auth i `profiles`.
 */
export type PlatformRole = 'user' | 'platform_admin'

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
  /** true kad je sesija na AAL2 (TOTP), traži se za admin rute */
  mfaVerified: boolean
  impersonation: Impersonation | null
}

/**
 * Vraća trenutnog korisnika ili null. Memoizovano po zahtevu (React cache).
 * Do faze 4 uvek vraća null.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  return null
})
