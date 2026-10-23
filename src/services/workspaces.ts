import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, listMemberships, requireMembership, type Membership } from '@/lib/auth/workspace'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import type { CreateWorkspaceInput } from '@/lib/schemas/workspace'
import type { Database } from '@/types/database'

type WorkspaceRow = Database['public']['Tables']['workspaces']['Row']

export interface WorkspaceSummary extends Membership {
  createdAt: string
}

export async function createWorkspace(
  viewer: Viewer,
  input: CreateWorkspaceInput,
): Promise<{ workspaceId: string; brandId: string }> {
  const { data, error } = await viewer.supabase.rpc('create_workspace', {
    p_name: input.name,
    p_type: input.type,
    p_brand_name: input.brandName ?? undefined,
    p_website_url: input.websiteUrl ?? undefined,
  })
  if (error) throw mapDbError(error, 'Kreiranje radnog prostora nije uspelo.')
  const result = data as { workspace_id: string; brand_id: string }
  return { workspaceId: result.workspace_id, brandId: result.brand_id }
}

export async function listWorkspaces(viewer: Viewer): Promise<Membership[]> {
  return listMemberships(viewer)
}

export async function getWorkspace(
  viewer: Viewer,
  workspaceId: string,
): Promise<WorkspaceRow & { role: Membership['role'] }> {
  const membership = await requireMembership(viewer, workspaceId)
  const row = unwrap(await viewer.supabase.from('workspaces').select('*').eq('id', workspaceId).maybeSingle())
  return { ...row, role: membership.role }
}

export async function updateWorkspace(
  viewer: Viewer,
  workspaceId: string,
  patch: {
    name?: string
    type?: Database['public']['Enums']['workspace_type']
    billingEmail?: string
    country?: string
  },
): Promise<WorkspaceRow> {
  await requireMembership(viewer, workspaceId, ADMIN_ROLES)
  const update: Database['public']['Tables']['workspaces']['Update'] = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.type !== undefined) update.type = patch.type
  if (patch.billingEmail !== undefined) update.billing_email = patch.billingEmail
  if (patch.country !== undefined) update.country = patch.country
  return unwrap(
    await viewer.supabase.from('workspaces').update(update).eq('id', workspaceId).select('*').single(),
  )
}

/** Meko brisanje; samo owner. Zakazane objave i Inngest run-ovi se otkazuju u fazi 9. */
export async function deleteWorkspace(viewer: Viewer, workspaceId: string): Promise<void> {
  await requireMembership(viewer, workspaceId, ['owner'])
  const memberships = await listMemberships(viewer)
  if (memberships.length <= 1) {
    throw new ApiError(
      'CONFLICT',
      'Ne možete obrisati jedini radni prostor. Umesto toga obrišite nalog u Podešavanjima.',
    )
  }
  const { error } = await viewer.supabase
    .from('workspaces')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', workspaceId)
  if (error) throw mapDbError(error)
}
