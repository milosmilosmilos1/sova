import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import type { Database } from '@/types/database'

export type WorkspaceRole = Database['public']['Enums']['workspace_role']
export type WorkspaceType = Database['public']['Enums']['workspace_type']

export const WORKSPACE_COOKIE = 'sova_ws'

export interface Membership {
  workspaceId: string
  name: string
  type: WorkspaceType
  role: WorkspaceRole
  allBrands: boolean
  ownerId: string
}

const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 5, admin: 4, editor: 3, approver: 2, viewer: 1 }

export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

export const EDIT_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor']
export const ADMIN_ROLES: WorkspaceRole[] = ['owner', 'admin']
export const APPROVE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'approver']

/** Sva članstva korisnika (RLS vraća samo njegova). Memoizovano po zahtevu. */
export const listMemberships = cache(async (viewer: Viewer): Promise<Membership[]> => {
  const { data, error } = await viewer.supabase
    .from('workspace_members')
    .select('workspace_id, role, all_brands, workspaces!inner(id, name, type, owner_id, deleted_at)')
    .eq('user_id', viewer.user.id)
    .order('created_at', { ascending: true })
  if (error) throw new ApiError('INTERNAL', undefined, { cause: error })
  return (data ?? [])
    .filter((m) => m.workspaces && !m.workspaces.deleted_at)
    .map((m) => ({
      workspaceId: m.workspace_id,
      name: m.workspaces.name,
      type: m.workspaces.type,
      role: m.role,
      allBrands: m.all_brands,
      ownerId: m.workspaces.owner_id,
    }))
})

/** Članstvo u konkretnom workspace-u ili null. */
export async function getMembership(viewer: Viewer, workspaceId: string): Promise<Membership | null> {
  const all = await listMemberships(viewer)
  return all.find((m) => m.workspaceId === workspaceId) ?? null
}

/** Baca 404 ako korisnik nije član (ne otkrivamo postojanje), 403 ako uloga nije dovoljna. */
export async function requireMembership(
  viewer: Viewer,
  workspaceId: string,
  allowed?: WorkspaceRole[],
): Promise<Membership> {
  const membership = await getMembership(viewer, workspaceId)
  if (!membership) throw new ApiError('NOT_FOUND', 'Radni prostor ne postoji ili nemate pristup.')
  if (allowed && !allowed.includes(membership.role)) throw new ApiError('FORBIDDEN')
  if (viewer.impersonation?.readOnly)
    throw new ApiError('FORBIDDEN', 'Režim pregleda: izmene nisu dozvoljene.')
  return membership
}

/** Trenutni workspace iz cookie-ja, inače prvi; null kad korisnik nema nijedan. */
export async function getCurrentWorkspace(viewer: Viewer): Promise<Membership | null> {
  const memberships = await listMemberships(viewer)
  if (memberships.length === 0) return null
  const store = await cookies()
  const wanted = store.get(WORKSPACE_COOKIE)?.value
  return memberships.find((m) => m.workspaceId === wanted) ?? memberships[0]!
}

export async function setCurrentWorkspaceCookie(workspaceId: string): Promise<void> {
  const store = await cookies()
  store.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}
