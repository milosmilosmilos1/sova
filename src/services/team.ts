import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { InvitationEmail } from '@/emails/invitation'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, requireMembership, type WorkspaceRole } from '@/lib/auth/workspace'
import { sendEmail } from '@/lib/email/send'
import { env, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { CreateInvitationInput } from '@/lib/schemas/workspace'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getWorkspacePlan } from '@/services/plans'

export interface TeamMember {
  userId: string
  role: WorkspaceRole
  allBrands: boolean
  brandIds: string[]
  fullName: string | null
  email: string
  avatarUrl: string | null
  joinedAt: string
}

export interface PendingInvitation {
  id: string
  email: string
  role: WorkspaceRole
  brandIds: string[] | null
  expiresAt: string
  createdAt: string
}

const INVITE_DAYS = 7

export async function listMembers(viewer: Viewer, workspaceId: string): Promise<TeamMember[]> {
  await requireMembership(viewer, workspaceId)
  const rows = unwrap(
    await viewer.supabase
      .from('workspace_members')
      .select('user_id, role, all_brands, created_at, profiles!user_id!inner(full_name, email, avatar_url)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
  )
  const access = unwrap(
    await viewer.supabase
      .from('member_brand_access')
      .select('user_id, brand_id')
      .eq('workspace_id', workspaceId),
  )
  const byUser = new Map<string, string[]>()
  for (const a of access) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a.brand_id])
  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    allBrands: r.all_brands,
    brandIds: byUser.get(r.user_id) ?? [],
    fullName: r.profiles.full_name,
    email: r.profiles.email,
    avatarUrl: r.profiles.avatar_url,
    joinedAt: r.created_at,
  }))
}

export async function updateMember(
  viewer: Viewer,
  workspaceId: string,
  input: { userId: string; role?: WorkspaceRole; allBrands?: boolean; brandIds?: string[] },
): Promise<void> {
  const me = await requireMembership(viewer, workspaceId, ADMIN_ROLES)
  const target = unwrap(
    await viewer.supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', input.userId)
      .maybeSingle(),
    'Član ne postoji.',
  )
  if (target.role === 'owner' && me.role !== 'owner') {
    throw new ApiError('FORBIDDEN', 'Samo vlasnik može da menja vlasnika.')
  }
  if (input.role === ('owner' as WorkspaceRole)) {
    throw new ApiError('VALIDATION', 'Prenos vlasništva ide kroz posebnu radnju.')
  }

  const update: { role?: WorkspaceRole; all_brands?: boolean } = {}
  if (input.role !== undefined) update.role = input.role
  if (input.allBrands !== undefined) update.all_brands = input.allBrands
  if (input.brandIds !== undefined && input.allBrands === undefined) update.all_brands = false

  if (Object.keys(update).length) {
    const { error } = await viewer.supabase
      .from('workspace_members')
      .update(update)
      .eq('workspace_id', workspaceId)
      .eq('user_id', input.userId)
    if (error) throw mapDbError(error)
  }

  if (input.brandIds !== undefined) {
    const { error: delErr } = await viewer.supabase
      .from('member_brand_access')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', input.userId)
    if (delErr) throw mapDbError(delErr)
    if (input.brandIds.length) {
      const { error: insErr } = await viewer.supabase.from('member_brand_access').insert(
        input.brandIds.map((brandId) => ({
          workspace_id: workspaceId,
          user_id: input.userId,
          brand_id: brandId,
        })),
      )
      if (insErr) throw mapDbError(insErr)
    }
  }
}

export async function removeMember(viewer: Viewer, workspaceId: string, userId: string): Promise<void> {
  const me = await requireMembership(viewer, workspaceId)
  const isSelf = userId === viewer.user.id
  if (!isSelf && !ADMIN_ROLES.includes(me.role)) throw new ApiError('FORBIDDEN')
  const { error } = await viewer.supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) throw mapDbError(error)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createInvitation(
  viewer: Viewer,
  input: CreateInvitationInput,
): Promise<{ id: string; acceptUrl: string | null }> {
  const me = await requireMembership(viewer, input.workspaceId, ADMIN_ROLES)

  const plan = await getWorkspacePlan(input.workspaceId)
  const { count: members } = await viewer.supabase
    .from('workspace_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('workspace_id', input.workspaceId)
  const { count: pending } = await viewer.supabase
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'pending')
  if ((members ?? 0) + (pending ?? 0) >= plan.limits.members) {
    throw new ApiError(
      'PLAN_LIMIT',
      `Vaš plan dozvoljava najviše ${plan.limits.members} ${plan.limits.members === 1 ? 'člana' : 'članova'}. Nadogradite plan za više.`,
    )
  }

  const { data: existing } = await viewer.supabase
    .from('workspace_members')
    .select('user_id, profiles!user_id!inner(email)')
    .eq('workspace_id', input.workspaceId)
    .eq('profiles.email', input.email)
    .maybeSingle()
  if (existing) throw new ApiError('CONFLICT', 'Ta osoba je već član radnog prostora.')

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString()
  const row = unwrap(
    await viewer.supabase
      .from('invitations')
      .insert({
        workspace_id: input.workspaceId,
        email: input.email,
        role: input.role,
        brand_ids: input.brandIds && input.brandIds.length ? input.brandIds : null,
        token_hash: hashToken(token),
        invited_by: viewer.user.id,
        expires_at: expiresAt,
      })
      .select('id')
      .single(),
    'Pozivnica nije sačuvana.',
  )

  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`
  try {
    await sendEmail({
      to: input.email,
      subject: `${viewer.profile.fullName ?? viewer.user.email} vas poziva u ${me.name} (Sova)`,
      react: InvitationEmail({
        inviterName: viewer.profile.fullName ?? viewer.user.email,
        workspaceName: me.name,
        role: input.role,
        acceptUrl,
        expiresInDays: INVITE_DAYS,
      }),
      tags: { type: 'invitation' },
    })
  } catch (error) {
    logger.error('invitation_email_failed', { invitationId: row.id, error })
    await viewer.supabase.from('invitations').update({ status: 'revoked' }).eq('id', row.id)
    throw new ApiError('PROVIDER_ERROR', 'Slanje pozivnice emailom nije uspelo. Pokušajte ponovo.')
  }

  // U DEV (bez Resend-a) link se vraća da se tok može proveriti bez pošte.
  return { id: row.id, acceptUrl: isProd ? null : acceptUrl }
}

export async function listInvitations(viewer: Viewer, workspaceId: string): Promise<PendingInvitation[]> {
  await requireMembership(viewer, workspaceId, ADMIN_ROLES)
  const rows = unwrap(
    await viewer.supabase
      .from('invitations')
      .select('id, email, role, brand_ids, expires_at, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    brandIds: r.brand_ids,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }))
}

export async function revokeInvitation(
  viewer: Viewer,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await requireMembership(viewer, workspaceId, ADMIN_ROLES)
  const { error } = await viewer.supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
  if (error) throw mapDbError(error)
}

export async function acceptInvitation(
  viewer: Viewer,
  token: string,
): Promise<{ workspaceId: string; role: WorkspaceRole }> {
  const { data, error } = await viewer.supabase.rpc('accept_invitation', { p_token: token })
  if (error) {
    if (error.message.includes('email_mismatch')) {
      throw new ApiError('FORBIDDEN', 'Pozivnica je poslata na drugu email adresu. Prijavite se tim nalogom.')
    }
    throw mapDbError(error, 'Pozivnica nije važeća.')
  }
  const result = data as { workspace_id: string; role: WorkspaceRole }
  return { workspaceId: result.workspace_id, role: result.role }
}
