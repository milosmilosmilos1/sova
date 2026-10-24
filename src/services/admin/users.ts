import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenBalance } from '@/lib/tokens/reservation'
import { listAudit, logAdminAction, type AdminContext, type AuditRow } from '@/services/admin/audit'
import { listImpersonationSessions, type SessionView } from '@/services/admin/impersonation'
import type { Database } from '@/types/database'

/**
 * Korisnici u admin panelu (brif 16 „Korisnici”): lista sa pretragom, filterima, sortiranjem i
 * paginacijom na serveru; detalj (bez tokena mreža); tokeni, ban, prinudna odjava, ponovna
 * verifikacija i brisanje uz potvrdu emaila. Svaka radnja i otvaranje detalja idu u audit log.
 */
type ProfileRow = Database['public']['Tables']['profiles']['Row']

export interface UserListFilters {
  q?: string | null
  status?: 'active' | 'banned' | 'unverified' | 'admin' | null
  plan?: string | null
  from?: string | null
  to?: string | null
  sort?: 'created_desc' | 'created_asc' | 'email_asc' | 'email_desc'
  page?: number
  pageSize?: number
}

export interface UserListItem {
  id: string
  email: string
  fullName: string | null
  platformRole: ProfileRow['platform_role']
  isBanned: boolean
  emailVerifiedAt: string | null
  createdAt: string
  lastSignInAt: string | null
  mfa: boolean
  workspaces: number
  plan: string
  tokensAvailable: number
}

const ACTIVE_SUB = ['active', 'trialing', 'past_due'] as const

function clean(q: string): string {
  return q.replace(/[,()%_*\\]/g, ' ').trim()
}

async function paidOwnerPlans(): Promise<Map<string, string>> {
  const admin = createSupabaseAdminClient()
  const { data: subs } = await admin
    .from('subscriptions')
    .select('workspace_id, plans(code)')
    .in('status', [...ACTIVE_SUB])
  const wsPlan = new Map<string, string>()
  for (const s of subs ?? []) {
    const code = (s.plans as { code: string } | null)?.code
    if (code) wsPlan.set(s.workspace_id, code)
  }
  if (!wsPlan.size) return new Map()
  const { data: owners } = await admin
    .from('workspace_members')
    .select('user_id, workspace_id')
    .eq('role', 'owner')
    .in('workspace_id', [...wsPlan.keys()])
  const out = new Map<string, string>()
  for (const o of owners ?? []) out.set(o.user_id, wsPlan.get(o.workspace_id)!)
  return out
}

export async function listUsers(
  filters: UserListFilters,
): Promise<{ items: UserListItem[]; total: number; page: number; pageSize: number }> {
  const admin = createSupabaseAdminClient()
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100)
  let q = admin.from('profiles').select('*', { count: 'exact' })
  const term = filters.q ? clean(filters.q) : ''
  if (term) {
    const { data: ws } = await admin.from('workspaces').select('id').ilike('name', `%${term}%`).limit(100)
    const wsIds = (ws ?? []).map((w) => w.id)
    let memberIds: string[] = []
    if (wsIds.length) {
      const { data: members } = await admin
        .from('workspace_members')
        .select('user_id')
        .in('workspace_id', wsIds)
        .limit(500)
      memberIds = [...new Set((members ?? []).map((m) => m.user_id))]
    }
    const ors = [`email.ilike.%${term}%`, `full_name.ilike.%${term}%`]
    if (memberIds.length) ors.push(`id.in.(${memberIds.join(',')})`)
    q = q.or(ors.join(','))
  }
  if (filters.status === 'banned') q = q.eq('is_banned', true)
  if (filters.status === 'active') q = q.eq('is_banned', false)
  if (filters.status === 'unverified') q = q.is('email_verified_at', null)
  if (filters.status === 'admin') q = q.eq('platform_role', 'platform_admin')
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to)
    q = q.lte('created_at', filters.to.length === 10 ? `${filters.to}T23:59:59.999Z` : filters.to)
  const paid = await paidOwnerPlans()
  if (filters.plan) {
    const ids = [...paid.entries()].filter(([, code]) => code === filters.plan).map(([id]) => id)
    if (filters.plan === 'free') {
      if (paid.size) q = q.not('id', 'in', `(${[...paid.keys()].join(',')})`)
    } else {
      if (!ids.length) return { items: [], total: 0, page, pageSize }
      q = q.in('id', ids)
    }
  }
  const sort = filters.sort ?? 'created_desc'
  q = q.order(sort.startsWith('email') ? 'email' : 'created_at', { ascending: sort.endsWith('asc') })
  const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw mapDbError(error)
  const rows = data ?? []
  const ids = rows.map((r) => r.id)
  const [authInfo, memberships] = await Promise.all([
    ids.length ? admin.rpc('admin_auth_users', { p_ids: ids }) : Promise.resolve({ data: [] as never[] }),
    ids.length
      ? admin.from('workspace_members').select('user_id, workspace_id, role').in('user_id', ids)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const authById = new Map(
    ((authInfo.data ?? []) as Array<{ id: string; last_sign_in_at: string | null; factors: number }>).map(
      (a) => [a.id, a],
    ),
  )
  const owned = new Map<string, string[]>()
  const wsCount = new Map<string, number>()
  for (const m of (memberships.data ?? []) as Array<{
    user_id: string
    workspace_id: string
    role: string
  }>) {
    wsCount.set(m.user_id, (wsCount.get(m.user_id) ?? 0) + 1)
    if (m.role === 'owner') owned.set(m.user_id, [...(owned.get(m.user_id) ?? []), m.workspace_id])
  }
  const balances = new Map<string, number>()
  for (const wsId of [...new Set([...owned.values()].flat())]) {
    try {
      balances.set(wsId, (await getTokenBalance(wsId)).available)
    } catch {
      balances.set(wsId, 0)
    }
  }
  return {
    page,
    pageSize,
    total: count ?? rows.length,
    items: rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      platformRole: r.platform_role,
      isBanned: r.is_banned,
      emailVerifiedAt: r.email_verified_at,
      createdAt: r.created_at,
      lastSignInAt: authById.get(r.id)?.last_sign_in_at ?? null,
      mfa: (authById.get(r.id)?.factors ?? 0) > 0,
      workspaces: wsCount.get(r.id) ?? 0,
      plan: paid.get(r.id) ?? 'free',
      tokensAvailable: (owned.get(r.id) ?? []).reduce((n, w) => n + (balances.get(w) ?? 0), 0),
    })),
  }
}

export interface UserDetail {
  profile: {
    id: string
    email: string
    fullName: string | null
    platformRole: ProfileRow['platform_role']
    isBanned: boolean
    bannedReason: string | null
    emailVerifiedAt: string | null
    createdAt: string
    locale: string
    timezone: string
  }
  auth: {
    lastSignInAt: string | null
    emailConfirmedAt: string | null
    bannedUntil: string | null
    mfaFactors: number
  }
  workspaces: Array<{
    id: string
    name: string
    type: string
    role: string
    plan: string
    subscriptionStatus: string | null
    tokens: { total: number; reserved: number; available: number }
    otherMembers: number
  }>
  brands: Array<{ id: string; name: string; workspaceId: string; status: string; autopilotLevel: number }>
  socialAccounts: Array<{
    id: string
    brandId: string
    platform: string
    name: string
    status: string
    assistedOnly: boolean
    lastSyncedAt: string | null
  }>
  ledger: Array<{
    id: number
    workspaceId: string
    delta: number
    balanceAfter: number
    reason: string
    note: string | null
    createdAt: string
  }>
  generations: Array<{
    id: string
    type: string
    status: string
    model: string | null
    tokensCharged: number
    costUsd: number | null
    createdAt: string
    errorMessage: string | null
  }>
  failedTargets: Array<{
    id: string
    postId: string
    platform: string
    errorCode: string | null
    errorMessage: string | null
    updatedAt: string
  }>
  flags: Array<{ kind: string; count: number; lastAt: string; note: string | null }>
  impersonations: SessionView[]
  audit: AuditRow[]
}

export async function getUserDetail(ctx: AdminContext, userId: string): Promise<UserDetail> {
  const admin = createSupabaseAdminClient()
  const { data: p } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (!p) throw new ApiError('NOT_FOUND', 'Korisnik ne postoji.')
  await logAdminAction(ctx, { action: 'user.view', targetType: 'user', targetId: userId })
  const [{ data: authRows }, { data: memberships }, { data: flags }] = await Promise.all([
    admin.rpc('admin_auth_users', { p_ids: [userId] }),
    admin
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, type, deleted_at)')
      .eq('user_id', userId),
    admin.from('user_flags').select('kind, count, last_at, note').eq('user_id', userId),
  ])
  const authRow = (
    (authRows ?? []) as Array<{
      last_sign_in_at: string | null
      email_confirmed_at: string | null
      banned_until: string | null
      factors: number
    }>
  )[0]
  const wsRows = (memberships ?? []).filter(
    (m) => m.workspaces && !(m.workspaces as { deleted_at: string | null }).deleted_at,
  )
  const wsIds = wsRows.map((m) => m.workspace_id)
  const [subs, brandsRes, otherMembers, ledgerRes, gensRes] = await Promise.all([
    wsIds.length
      ? admin
          .from('subscriptions')
          .select('workspace_id, status, plans(code)')
          .in('workspace_id', wsIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    wsIds.length
      ? admin
          .from('brands')
          .select('id, name, workspace_id, status, autopilot_level')
          .in('workspace_id', wsIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as never[] }),
    wsIds.length
      ? admin
          .from('workspace_members')
          .select('workspace_id, user_id')
          .in('workspace_id', wsIds)
          .neq('user_id', userId)
      : Promise.resolve({ data: [] as never[] }),
    wsIds.length
      ? admin
          .from('token_ledger')
          .select('id, workspace_id, delta, balance_after, reason, note, created_at')
          .in('workspace_id', wsIds)
          .order('id', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as never[] }),
    admin
      .from('ai_generations')
      .select(
        'id, type, status, model, tokens_charged, cost_usd, created_at, error_message, user_id, workspace_id',
      )
      .or(wsIds.length ? `user_id.eq.${userId},workspace_id.in.(${wsIds.join(',')})` : `user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(15),
  ])
  const subByWs = new Map<string, { status: string; code: string }>()
  for (const s of (subs.data ?? []) as Array<{
    workspace_id: string
    status: string
    plans: { code: string } | null
  }>) {
    if (!subByWs.has(s.workspace_id))
      subByWs.set(s.workspace_id, { status: s.status, code: s.plans?.code ?? 'free' })
  }
  const others = new Map<string, number>()
  for (const m of (otherMembers.data ?? []) as Array<{ workspace_id: string }>)
    others.set(m.workspace_id, (others.get(m.workspace_id) ?? 0) + 1)
  const workspaces: UserDetail['workspaces'] = []
  for (const m of wsRows) {
    const w = m.workspaces as { id: string; name: string; type: string }
    const sub = subByWs.get(m.workspace_id)
    workspaces.push({
      id: w.id,
      name: w.name,
      type: w.type,
      role: m.role,
      plan: sub && (ACTIVE_SUB as readonly string[]).includes(sub.status) ? sub.code : 'free',
      subscriptionStatus: sub?.status ?? null,
      tokens: await getTokenBalance(m.workspace_id).catch(() => ({ total: 0, reserved: 0, available: 0 })),
      otherMembers: others.get(m.workspace_id) ?? 0,
    })
  }
  const brands = (brandsRes.data ?? []) as Array<{
    id: string
    name: string
    workspace_id: string
    status: string
    autopilot_level: number
  }>
  const brandIds = brands.map((b) => b.id)
  const [accounts, failed] = await Promise.all([
    brandIds.length
      ? admin
          .from('social_accounts')
          .select('id, brand_id, platform, name, status, assisted_only, last_synced_at')
          .in('brand_id', brandIds)
      : Promise.resolve({ data: [] as never[] }),
    brandIds.length
      ? admin
          .from('post_targets')
          .select('id, post_id, platform, last_error_code, last_error_message, updated_at')
          .in('brand_id', brandIds)
          .eq('status', 'failed')
          .order('updated_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const [impersonations, audit] = await Promise.all([
    listImpersonationSessions({ userId, limit: 10 }),
    listAudit({ target: userId, pageSize: 20 }),
  ])
  return {
    profile: {
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      platformRole: p.platform_role,
      isBanned: p.is_banned,
      bannedReason: p.banned_reason,
      emailVerifiedAt: p.email_verified_at,
      createdAt: p.created_at,
      locale: p.locale,
      timezone: p.timezone,
    },
    auth: {
      lastSignInAt: authRow?.last_sign_in_at ?? null,
      emailConfirmedAt: authRow?.email_confirmed_at ?? null,
      bannedUntil: authRow?.banned_until ?? null,
      mfaFactors: authRow?.factors ?? 0,
    },
    workspaces,
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      workspaceId: b.workspace_id,
      status: b.status,
      autopilotLevel: b.autopilot_level,
    })),
    socialAccounts: (
      (accounts.data ?? []) as Array<{
        id: string
        brand_id: string
        platform: string
        name: string
        status: string
        assisted_only: boolean
        last_synced_at: string | null
      }>
    ).map((a) => ({
      id: a.id,
      brandId: a.brand_id,
      platform: a.platform,
      name: a.name,
      status: a.status,
      assistedOnly: a.assisted_only,
      lastSyncedAt: a.last_synced_at,
    })),
    ledger: (
      (ledgerRes.data ?? []) as Array<{
        id: number
        workspace_id: string
        delta: number
        balance_after: number
        reason: string
        note: string | null
        created_at: string
      }>
    ).map((l) => ({
      id: l.id,
      workspaceId: l.workspace_id,
      delta: l.delta,
      balanceAfter: l.balance_after,
      reason: l.reason,
      note: l.note,
      createdAt: l.created_at,
    })),
    generations: (
      (gensRes.data ?? []) as Array<{
        id: string
        type: string
        status: string
        model: string | null
        tokens_charged: number
        cost_usd: number | null
        created_at: string
        error_message: string | null
      }>
    ).map((g) => ({
      id: g.id,
      type: g.type,
      status: g.status,
      model: g.model,
      tokensCharged: g.tokens_charged,
      costUsd: g.cost_usd === null ? null : Number(g.cost_usd),
      createdAt: g.created_at,
      errorMessage: g.error_message,
    })),
    failedTargets: (
      (failed.data ?? []) as Array<{
        id: string
        post_id: string
        platform: string
        last_error_code: string | null
        last_error_message: string | null
        updated_at: string
      }>
    ).map((t) => ({
      id: t.id,
      postId: t.post_id,
      platform: t.platform,
      errorCode: t.last_error_code,
      errorMessage: t.last_error_message,
      updatedAt: t.updated_at,
    })),
    flags: (flags ?? []).map((f) => ({ kind: f.kind, count: f.count, lastAt: f.last_at, note: f.note })),
    impersonations,
    audit: audit.items,
  }
}

async function loadTarget(userId: string): Promise<ProfileRow> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (!data) throw new ApiError('NOT_FOUND', 'Korisnik ne postoji.')
  return data
}

function assertNotAdminTarget(ctx: AdminContext, target: ProfileRow, what: string) {
  if (target.id === ctx.adminId) throw new ApiError('VALIDATION', `Ne možete ${what} sopstveni nalog.`)
  if (target.platform_role === 'platform_admin')
    throw new ApiError('FORBIDDEN', `Drugom adminu se ne može ${what}.`)
}

export async function adjustTokens(
  ctx: AdminContext,
  userId: string,
  input: { workspaceId: string; delta: number; reason: string },
): Promise<{ before: number; after: number }> {
  const admin = createSupabaseAdminClient()
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle()
  if (!member) throw new ApiError('VALIDATION', 'Radni prostor ne pripada ovom korisniku.')
  const before = (await getTokenBalance(input.workspaceId)).available
  if (input.delta < 0 && before + input.delta < 0) {
    throw new ApiError(
      'VALIDATION',
      `Radni prostor ima ${before} dostupnih tokena; ne može se oduzeti ${-input.delta}.`,
    )
  }
  const { error } = await admin.rpc('admin_adjust_tokens', {
    p_workspace_id: input.workspaceId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_admin_id: ctx.adminId,
    // audit zapis nastaje u istoj transakciji kao i promena (migracija 019)
    p_audit: {
      admin_email: ctx.adminEmail,
      target_user_id: userId,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      request_id: ctx.requestId,
    },
  })
  if (error) throw mapDbError(error)
  const after = (await getTokenBalance(input.workspaceId)).available
  return { before, after }
}

export async function banUser(ctx: AdminContext, userId: string, reason: string): Promise<void> {
  const target = await loadTarget(userId)
  assertNotAdminTarget(ctx, target, 'blokirati')
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_banned: true, banned_reason: reason })
    .eq('id', userId)
  if (error) throw mapDbError(error)
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  if (authError) logger.warn('auth_ban_failed', { userId, error: authError.message })
  const { data: sessions } = await admin.rpc('admin_revoke_user_sessions', { p_user_id: userId })
  await logAdminAction(ctx, {
    action: 'user.ban',
    targetType: 'user',
    targetId: userId,
    before: { isBanned: target.is_banned, reason: target.banned_reason },
    after: { isBanned: true, reason, sessionsRevoked: sessions ?? 0 },
  })
}

export async function unbanUser(ctx: AdminContext, userId: string): Promise<void> {
  const target = await loadTarget(userId)
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_banned: false, banned_reason: null })
    .eq('id', userId)
  if (error) throw mapDbError(error)
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  if (authError) logger.warn('auth_unban_failed', { userId, error: authError.message })
  await logAdminAction(ctx, {
    action: 'user.unban',
    targetType: 'user',
    targetId: userId,
    before: { isBanned: target.is_banned, reason: target.banned_reason },
    after: { isBanned: false },
  })
}

export async function forceLogout(ctx: AdminContext, userId: string): Promise<{ sessions: number }> {
  const target = await loadTarget(userId)
  if (target.id === ctx.adminId) throw new ApiError('VALIDATION', 'Za svoj nalog koristite odjavu.')
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('admin_revoke_user_sessions', { p_user_id: userId })
  if (error) throw mapDbError(error)
  const sessions = Number(data ?? 0)
  await logAdminAction(ctx, {
    action: 'user.logout_all',
    targetType: 'user',
    targetId: userId,
    after: { sessions },
  })
  return { sessions }
}

export async function resendVerification(ctx: AdminContext, userId: string): Promise<void> {
  const target = await loadTarget(userId)
  const admin = createSupabaseAdminClient()
  const { data: authRows } = await admin.rpc('admin_auth_users', { p_ids: [userId] })
  const confirmed = ((authRows ?? []) as Array<{ email_confirmed_at: string | null }>)[0]?.email_confirmed_at
  if (confirmed || target.email_verified_at) throw new ApiError('CONFLICT', 'Email je već potvrđen.')
  const { error } = await admin.auth.resend({
    type: 'signup',
    email: target.email,
    options: { emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/app/onboarding` },
  })
  if (error) throw new ApiError('PROVIDER_ERROR', `Slanje nije uspelo: ${error.message}`)
  await logAdminAction(ctx, { action: 'user.resend_verification', targetType: 'user', targetId: userId })
}

/**
 * Brisanje naloga (brif 16): potvrda kucanjem emaila; vlasnik radnog prostora sa drugim članovima
 * mora prvo da prenese vlasništvo (kaskada bi obrisala radni prostor svima). Radni prostori u kojima
 * je korisnik sam brišu se kaskadno sa nalogom; nalozi mreža se pre toga opozivaju.
 */
export async function deleteUserAccount(
  ctx: AdminContext,
  userId: string,
  confirmEmail: string,
): Promise<{ workspacesDeleted: number }> {
  const target = await loadTarget(userId)
  assertNotAdminTarget(ctx, target, 'obrisati')
  if (confirmEmail.trim().toLowerCase() !== String(target.email).toLowerCase()) {
    throw new ApiError('VALIDATION', 'Upišite tačan email korisnika kao potvrdu.', {
      fields: { confirmEmail: ['email ne odgovara'] },
    })
  }
  const admin = createSupabaseAdminClient()
  const { data: owned } = await admin
    .from('workspaces')
    .select('id, name')
    .eq('owner_id', userId)
    .is('deleted_at', null)
  const blocking: string[] = []
  const solo: string[] = []
  for (const w of owned ?? []) {
    const { count } = await admin
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', w.id)
      .neq('user_id', userId)
    if ((count ?? 0) > 0) blocking.push(w.name)
    else solo.push(w.id)
  }
  if (blocking.length) {
    throw new ApiError(
      'CONFLICT',
      `Korisnik je vlasnik radnih prostora sa drugim članovima (${blocking.join(', ')}). Prvo prenesite vlasništvo.`,
    )
  }
  const before = {
    email: target.email,
    fullName: target.full_name,
    createdAt: target.created_at,
    workspaces: solo.length,
  }
  if (solo.length) {
    const { data: brands } = await admin.from('brands').select('id').in('workspace_id', solo)
    const brandIds = (brands ?? []).map((b) => b.id)
    if (brandIds.length) {
      await admin
        .from('social_accounts')
        .update({
          status: 'revoked',
          access_token_enc: null,
          refresh_token_enc: null,
          status_reason: 'Nalog obrisan iz admin panela.',
        })
        .in('brand_id', brandIds)
    }
  }
  // audit pre brisanja: posle njega korisnik više ne postoji
  await logAdminAction(ctx, { action: 'user.delete', targetType: 'user', targetId: userId, before })
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    logger.error('admin_delete_user_failed', { userId, error: error.message })
    throw new ApiError('INTERNAL', `Brisanje nije uspelo: ${error.message}`)
  }
  return { workspacesDeleted: solo.length }
}
