import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { CreateBrandInput } from '@/lib/schemas/workspace'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getWorkspacePlan } from '@/services/plans'
import type { Database } from '@/types/database'

export type BrandRow = Database['public']['Tables']['brands']['Row']

const BRAND_COLUMNS =
  'id, workspace_id, name, website_url, timezone, content_locale, autopilot_level, status, logo_asset_id, report_emails, created_at, updated_at, setup_completed_at'

export type BrandSummary = Pick<
  BrandRow,
  | 'id'
  | 'workspace_id'
  | 'name'
  | 'website_url'
  | 'timezone'
  | 'content_locale'
  | 'autopilot_level'
  | 'status'
  | 'logo_asset_id'
  | 'report_emails'
  | 'created_at'
  | 'updated_at'
  | 'setup_completed_at'
>

export async function listBrands(viewer: Viewer, workspaceId: string): Promise<BrandSummary[]> {
  await requireMembership(viewer, workspaceId)
  return unwrap(
    await viewer.supabase
      .from('brands')
      .select(BRAND_COLUMNS)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  )
}

export async function getBrand(viewer: Viewer, brandId: string): Promise<BrandRow> {
  const row = unwrap(
    await viewer.supabase.from('brands').select('*').eq('id', brandId).is('deleted_at', null).maybeSingle(),
    'Brend ne postoji ili nemate pristup.',
  )
  return row
}

export async function createBrand(viewer: Viewer, input: CreateBrandInput): Promise<BrandSummary> {
  await requireMembership(viewer, input.workspaceId, EDIT_ROLES)
  const plan = await getWorkspacePlan(input.workspaceId)
  const { count } = await viewer.supabase
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', input.workspaceId)
    .is('deleted_at', null)
  if ((count ?? 0) >= plan.limits.brands) {
    throw new ApiError(
      'PLAN_LIMIT',
      `Vaš plan dozvoljava ${plan.limits.brands} ${plan.limits.brands === 1 ? 'brend' : 'brenda'}. Nadogradite plan za više brendova.`,
    )
  }
  return unwrap(
    await viewer.supabase
      .from('brands')
      .insert({
        workspace_id: input.workspaceId,
        name: input.name,
        website_url: input.websiteUrl ?? null,
        timezone: input.timezone,
        content_locale: input.contentLocale,
        created_by: viewer.user.id,
      })
      .select(BRAND_COLUMNS)
      .single(),
    'Brend nije sačuvan.',
  )
}

export async function updateBrand(
  viewer: Viewer,
  brandId: string,
  patch: Partial<
    Pick<BrandRow, 'name' | 'website_url' | 'timezone' | 'content_locale' | 'status' | 'report_emails'>
  >,
): Promise<BrandSummary> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  // izveštaj tada odlazi van tima: adrese menja vlasnik ili administrator (D-094)
  if (patch.report_emails !== undefined && !ADMIN_ROLES.includes(membership.role))
    throw new ApiError('FORBIDDEN', 'Primaoce mesečnog izveštaja menja vlasnik ili administrator.')
  const update: Database['public']['Tables']['brands']['Update'] = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.website_url !== undefined) update.website_url = patch.website_url
  if (patch.timezone !== undefined) update.timezone = patch.timezone
  if (patch.content_locale !== undefined) update.content_locale = patch.content_locale
  if (patch.report_emails !== undefined)
    update.report_emails = [...new Set(patch.report_emails.map((e) => e.trim().toLowerCase()))]
  if (patch.status !== undefined) {
    update.status = patch.status
    update.paused_at = patch.status === 'paused' ? new Date().toISOString() : null
    update.paused_by = patch.status === 'paused' ? viewer.user.id : null
  }
  return unwrap(
    await viewer.supabase.from('brands').update(update).eq('id', brandId).select(BRAND_COLUMNS).single(),
  )
}

/** Meko brisanje (arhiva); upis kroz service role posle provere uloge, jer SELECT politika skriva obrisan red (D-081). */
export async function deleteBrand(viewer: Viewer, brandId: string): Promise<void> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, ADMIN_ROLES)
  const { count } = await viewer.supabase
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', brand.workspace_id)
    .is('deleted_at', null)
  if ((count ?? 0) <= 1) throw new ApiError('CONFLICT', 'Radni prostor mora imati bar jedan brend.')
  const { error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
}
