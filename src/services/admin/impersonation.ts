import 'server-only'

import { IMP_COOKIE, IMP_MAX_MINUTES, signSessionCookie } from '@/lib/auth/impersonation-core'
import { ApiError } from '@/lib/api/errors'
import { env, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { logAdminAction, type AdminContext } from '@/services/admin/audit'

/**
 * Impersonacija (brif 16, D-070): sesija u `impersonation_sessions`, potpisan httpOnly cookie,
 * read-only podrazumevano, pun režim uz potvrdu emaila i poseban zapis, najviše 30 minuta.
 */
export interface StartInput {
  userId: string
  reason: string
  mode: 'read_only' | 'full'
  /** za pun režim: email korisnika ukucan kao potvrda */
  confirmEmail?: string | null
}

export interface StartedImpersonation {
  sessionId: string
  userId: string
  userEmail: string
  mode: 'read_only' | 'full'
  expiresAt: string
  cookie: string
}

export function impersonationCookie(value: string, maxAgeSec: number): string {
  return `${IMP_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}${isProd ? '; Secure' : ''}`
}

export function clearImpersonationCookie(): string {
  return `${IMP_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`
}

export async function startImpersonation(
  ctx: AdminContext,
  input: StartInput,
): Promise<StartedImpersonation> {
  if (!env.SUPABASE_JWT_SECRET || !env.IMPERSONATION_SECRET) {
    throw new ApiError('INTERNAL', 'Impersonacija nije podešena (SUPABASE_JWT_SECRET, IMPERSONATION_SECRET).')
  }
  const reason = input.reason.trim()
  if (reason.length < 10) {
    throw new ApiError('VALIDATION', 'Razlog mora imati bar 10 znakova.', {
      fields: { reason: ['najmanje 10 znakova'] },
    })
  }
  if (input.userId === ctx.adminId)
    throw new ApiError('VALIDATION', 'Ne možete impersonirati sopstveni nalog.')
  const admin = createSupabaseAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, email, platform_role, is_banned')
    .eq('id', input.userId)
    .maybeSingle()
  if (!target) throw new ApiError('NOT_FOUND', 'Korisnik ne postoji.')
  if (target.platform_role === 'platform_admin')
    throw new ApiError('FORBIDDEN', 'Drugi admin se ne može impersonirati.')
  if (input.mode === 'full') {
    if ((input.confirmEmail ?? '').trim().toLowerCase() !== String(target.email).toLowerCase()) {
      throw new ApiError('VALIDATION', 'Za pun režim upišite tačan email korisnika kao potvrdu.', {
        fields: { confirmEmail: ['email ne odgovara'] },
      })
    }
  }
  const now = new Date()
  // jedan admin ima najviše jednu aktivnu sesiju
  const { data: previous } = await admin
    .from('impersonation_sessions')
    .update({ ended_at: now.toISOString(), end_reason: 'replaced' })
    .eq('admin_id', ctx.adminId)
    .is('ended_at', null)
    .select('id, user_id')
  for (const p of previous ?? []) {
    await logAdminAction(ctx, {
      action: 'impersonation.end',
      targetType: 'user',
      targetId: p.user_id,
      after: { reason: 'replaced' },
      impersonationSessionId: p.id,
    })
  }
  const expiresAt = new Date(now.getTime() + IMP_MAX_MINUTES * 60_000).toISOString()
  const { data: session, error } = await admin
    .from('impersonation_sessions')
    .insert({
      admin_id: ctx.adminId,
      user_id: target.id,
      reason,
      mode: input.mode,
      expires_at: expiresAt,
      ip: ctx.ip,
    })
    .select('id')
    .single()
  if (error || !session) throw mapDbError(error, 'Sesija impersonacije nije napravljena.')
  await logAdminAction(ctx, {
    action: 'impersonation.start',
    targetType: 'user',
    targetId: target.id,
    after: { reason, mode: input.mode, expiresAt },
    impersonationSessionId: session.id,
  })
  if (input.mode === 'full') {
    await logAdminAction(ctx, {
      action: 'impersonation.full_mode',
      targetType: 'user',
      targetId: target.id,
      after: { reason, confirmedEmail: target.email },
      impersonationSessionId: session.id,
    })
  }
  logger.warn('impersonation_started', {
    adminId: ctx.adminId,
    userId: target.id,
    mode: input.mode,
    sessionId: session.id,
  })
  return {
    sessionId: session.id,
    userId: target.id,
    userEmail: target.email,
    mode: input.mode,
    expiresAt,
    cookie: impersonationCookie(
      signSessionCookie(session.id, env.IMPERSONATION_SECRET),
      IMP_MAX_MINUTES * 60,
    ),
  }
}

/** Kraj aktivnih sesija admina (izlaz, odjava); vraća korisnika poslednje sesije radi povratka na njegov detalj. */
export async function endImpersonation(
  ctx: AdminContext,
  reason: string,
): Promise<{ ended: number; userId: string | null }> {
  const admin = createSupabaseAdminClient()
  const { data: ended } = await admin
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString(), end_reason: reason })
    .eq('admin_id', ctx.adminId)
    .is('ended_at', null)
    .select('id, user_id')
  for (const s of ended ?? []) {
    await logAdminAction(ctx, {
      action: 'impersonation.end',
      targetType: 'user',
      targetId: s.user_id,
      after: { reason },
      impersonationSessionId: s.id,
    })
  }
  return { ended: ended?.length ?? 0, userId: ended?.[0]?.user_id ?? null }
}

export interface SessionView {
  id: string
  adminEmail: string | null
  userId: string
  userEmail: string | null
  reason: string
  mode: 'read_only' | 'full'
  startedAt: string
  expiresAt: string
  endedAt: string | null
  endReason: string | null
  requests: number
}

export async function listImpersonationSessions(
  filter: { userId?: string; limit?: number } = {},
): Promise<SessionView[]> {
  const admin = createSupabaseAdminClient()
  let q = admin
    .from('impersonation_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(filter.limit ?? 20)
  if (filter.userId) q = q.eq('user_id', filter.userId)
  const { data } = await q
  const rows = data ?? []
  const ids = [...new Set(rows.flatMap((r) => [r.admin_id, r.user_id]))]
  const emails = new Map<string, string>()
  if (ids.length) {
    const { data: profiles } = await admin.from('profiles').select('id, email').in('id', ids)
    for (const p of profiles ?? []) emails.set(p.id, p.email)
  }
  const counts = new Map<string, number>()
  if (rows.length) {
    const { data: reqs } = await admin
      .from('admin_audit_log')
      .select('impersonation_session_id')
      .eq('action', 'impersonation.request')
      .in(
        'impersonation_session_id',
        rows.map((r) => r.id),
      )
      .limit(5000)
    for (const r of reqs ?? []) {
      if (r.impersonation_session_id)
        counts.set(r.impersonation_session_id, (counts.get(r.impersonation_session_id) ?? 0) + 1)
    }
  }
  return rows.map((r) => ({
    id: r.id,
    adminEmail: emails.get(r.admin_id) ?? null,
    userId: r.user_id,
    userEmail: emails.get(r.user_id) ?? null,
    reason: r.reason,
    mode: r.mode,
    startedAt: r.started_at,
    expiresAt: r.expires_at,
    endedAt: r.ended_at,
    endReason: r.end_reason,
    requests: counts.get(r.id) ?? 0,
  }))
}
