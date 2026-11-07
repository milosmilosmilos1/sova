import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { ApiError } from '@/lib/api/errors'
import { requestMemo } from '@/lib/auth/request-memo'
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

/** Upit članstava; isti koristi i prvo čitanje strane (app-prefetch). */
export function membershipsQuery(supabase: Viewer['supabase'], userId: string) {
  return supabase
    .from('workspace_members')
    .select('workspace_id, role, all_brands, workspaces!inner(id, name, type, owner_id, deleted_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
}

type MembershipRow = NonNullable<Awaited<ReturnType<typeof membershipsQuery>>['data']>[number]

export function toMemberships(rows: MembershipRow[]): Membership[] {
  return rows
    .filter((m) => m.workspaces && !m.workspaces.deleted_at)
    .map((m) => ({
      workspaceId: m.workspace_id,
      name: m.workspaces.name,
      type: m.workspaces.type,
      role: m.role,
      allBrands: m.all_brands,
      ownerId: m.workspaces.owner_id,
    }))
}

async function loadMemberships(viewer: Viewer): Promise<Membership[]> {
  const { data, error } = await membershipsQuery(viewer.supabase, viewer.user.id)
  if (error) throw new ApiError('INTERNAL', undefined, { cause: error })
  return toMemberships(data ?? [])
}

/**
 * Sva članstva korisnika (RLS vraća samo njegova). Memoizovano po zahtevu: React cache u renderu, a u
 * API čitanjima uz Viewer (request-memo, D-164), jer cache() u Route Handlerima ne radi.
 */
export const listMemberships = cache((viewer: Viewer): Promise<Membership[]> =>
  requestMemo(viewer, 'memberships', () => loadMemberships(viewer)),
)

/** Članstvo u konkretnom workspace-u ili null. */
export async function getMembership(viewer: Viewer, workspaceId: string): Promise<Membership | null> {
  const all = await listMemberships(viewer)
  return all.find((m) => m.workspaceId === workspaceId) ?? null
}

/**
 * Članstvo iz već pročitane liste (npr. pročitane u istom krugu kao objava); iste greške kao
 * requireMembership: 404 ako korisnik nije član, 403 ako uloga nije dovoljna.
 */
export function membershipIn(
  memberships: Membership[],
  workspaceId: string,
  allowed?: WorkspaceRole[],
): Membership {
  const membership = memberships.find((m) => m.workspaceId === workspaceId)
  if (!membership) throw new ApiError('NOT_FOUND', 'Radni prostor ne postoji ili nemate pristup.')
  if (allowed && !allowed.includes(membership.role)) throw new ApiError('FORBIDDEN')
  // read-only impersonacija se ne proverava ovde (funkcija služi i čitanju): izmene blokiraju
  // handler, serverske akcije i RLS (D-070)
  return membership
}

/** Baca 404 ako korisnik nije član (ne otkrivamo postojanje), 403 ako uloga nije dovoljna. */
export async function requireMembership(
  viewer: Viewer,
  workspaceId: string,
  allowed?: WorkspaceRole[],
): Promise<Membership> {
  return membershipIn(await listMemberships(viewer), workspaceId, allowed)
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
