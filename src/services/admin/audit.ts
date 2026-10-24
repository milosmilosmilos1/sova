import 'server-only'

import type { NextRequest } from 'next/server'

import { toCsv } from '@/lib/admin/csv'
import { firstIp, type Viewer } from '@/lib/auth/viewer'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import type { Json } from '@/types/database'

/**
 * Audit log admin akcija (brif 16, D-071): append-only tabela, upis kroz service role.
 * Svaka izmena u admin panelu i otvaranje detalja korisnika pišu red sa stanjem pre i posle.
 */
export interface AdminContext {
  adminId: string
  adminEmail: string
  ip: string | null
  userAgent: string | null
  requestId: string | null
}

export function adminContextFromRequest(req: NextRequest, viewer: Viewer, requestId: string): AdminContext {
  return {
    adminId: viewer.user.id,
    adminEmail: viewer.user.email,
    ip: firstIp(req.headers.get('x-forwarded-for')),
    userAgent: req.headers.get('user-agent'),
    requestId,
  }
}

export interface AuditInput {
  action: string
  targetType?: string | null
  targetId?: string | null
  before?: unknown
  after?: unknown
  impersonationSessionId?: string | null
}

export async function logAdminAction(ctx: AdminContext, input: AuditInput): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('admin_audit_log').insert({
    admin_id: ctx.adminId,
    admin_email: ctx.adminEmail,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    before: (input.before ?? null) as Json,
    after: (input.after ?? null) as Json,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    impersonation_session_id: input.impersonationSessionId ?? null,
    request_id: ctx.requestId,
  })
  if (error) {
    // audit se ne preskače tiho: greška upisa je greška akcije
    logger.error('admin_audit_insert_failed', { action: input.action, error })
    throw mapDbError(error, 'Upis u audit log nije uspeo.')
  }
}

export interface AuditFilters {
  adminEmail?: string | null
  action?: string | null
  /** email ili ID korisnika koji je cilj akcije */
  target?: string | null
  from?: string | null
  to?: string | null
  page?: number
  pageSize?: number
}

export interface AuditRow {
  id: number
  createdAt: string
  adminId: string
  adminEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  targetEmail: string | null
  before: Json | null
  after: Json | null
  ip: string | null
  userAgent: string | null
  impersonationSessionId: string | null
  requestId: string | null
}

async function resolveIdsByEmail(fragment: string): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', `%${fragment.replace(/[%_]/g, '')}%`)
    .limit(200)
  return (data ?? []).map((p) => p.id)
}

export async function listAudit(
  filters: AuditFilters,
): Promise<{ items: AuditRow[]; total: number; page: number; pageSize: number }> {
  const admin = createSupabaseAdminClient()
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 1000)
  let q = admin.from('admin_audit_log').select('*', { count: 'exact' }).order('id', { ascending: false })
  if (filters.action) q = q.ilike('action', `${filters.action.replace(/[%_]/g, '')}%`)
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to)
    q = q.lte('created_at', filters.to.length === 10 ? `${filters.to}T23:59:59.999Z` : filters.to)
  // snimak emaila u zapisu: radi i za admine čiji nalog više ne postoji
  if (filters.adminEmail) q = q.ilike('admin_email', `%${filters.adminEmail.trim().replace(/[%_]/g, '')}%`)
  if (filters.target) {
    const t = filters.target.trim()
    const ids = /^[0-9a-f-]{36}$/i.test(t) ? [t] : await resolveIdsByEmail(t)
    if (!ids.length) return { items: [], total: 0, page, pageSize }
    q = q.in('target_id', ids)
  }
  const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw mapDbError(error)
  const rows = data ?? []
  const profileIds = [
    ...new Set([
      ...rows.map((r) => r.admin_id),
      ...rows.map((r) => r.target_id).filter((x): x is string => Boolean(x && /^[0-9a-f-]{36}$/i.test(x))),
    ]),
  ]
  const emails = new Map<string, string>()
  if (profileIds.length) {
    const { data: profiles } = await admin.from('profiles').select('id, email').in('id', profileIds)
    for (const p of profiles ?? []) emails.set(p.id, p.email)
  }
  return {
    page,
    pageSize,
    total: count ?? rows.length,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      adminId: r.admin_id,
      adminEmail: r.admin_email ?? emails.get(r.admin_id) ?? null,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      targetEmail: r.target_id ? (emails.get(r.target_id) ?? null) : null,
      before: r.before,
      after: r.after,
      ip: r.ip as string | null,
      userAgent: r.user_agent,
      impersonationSessionId: r.impersonation_session_id,
      requestId: r.request_id,
    })),
  }
}

export async function auditCsv(filters: AuditFilters): Promise<string> {
  const { items } = await listAudit({ ...filters, page: 1, pageSize: 1000 })
  return toCsv(
    [
      'vreme',
      'admin',
      'akcija',
      'tip cilja',
      'cilj',
      'email cilja',
      'pre',
      'posle',
      'ip',
      'user agent',
      'sesija impersonacije',
      'request id',
    ],
    items.map((r) => [
      r.createdAt,
      r.adminEmail ?? r.adminId,
      r.action,
      r.targetType,
      r.targetId,
      r.targetEmail,
      r.before,
      r.after,
      r.ip,
      r.userAgent,
      r.impersonationSessionId,
      r.requestId,
    ]),
  )
}
