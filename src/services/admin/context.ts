import 'server-only'

import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { firstIp, getRealViewer, type Viewer } from '@/lib/auth/viewer'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { AdminContext } from '@/services/admin/audit'

/**
 * Provera admina za svaku admin stranicu (brif 16: proxy, stranica i ruta, baza): stvarni korisnik
 * (i tokom impersonacije), platform admin, nije blokiran, sesija na AAL2. Ne-admin dobija 404.
 */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getRealViewer()
  if (!viewer) redirect('/login?next=/admin')
  if (viewer.profile.platformRole !== 'platform_admin' || viewer.profile.isBanned) notFound()
  if (!viewer.mfaVerified) redirect('/app/settings/security?reason=admin')
  return viewer
}

export async function adminContextFromHeaders(viewer: Viewer): Promise<AdminContext> {
  const h = await headers()
  return {
    adminId: viewer.user.id,
    adminEmail: viewer.user.email,
    ip: firstIp(h.get('x-forwarded-for')),
    userAgent: h.get('user-agent'),
    requestId: h.get('x-request-id'),
  }
}

/** Aktivna sesija impersonacije admina (za traku u admin panelu). */
export async function activeImpersonationFor(
  adminId: string,
): Promise<{ userId: string; userEmail: string; readOnly: boolean; expiresAt: string } | null> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('impersonation_sessions')
    .select('user_id, mode, expires_at')
    .eq('admin_id', adminId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
  const s = data?.[0]
  if (!s) return null
  const { data: p } = await admin.from('profiles').select('email').eq('id', s.user_id).maybeSingle()
  return {
    userId: s.user_id,
    userEmail: p?.email ?? s.user_id,
    readOnly: s.mode === 'read_only',
    expiresAt: s.expires_at,
  }
}
