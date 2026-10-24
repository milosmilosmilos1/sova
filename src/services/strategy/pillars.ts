import 'server-only'

import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type {
  campaignInputSchema,
  campaignPatchSchema,
  pillarInputSchema,
  pillarPatchSchema,
} from '@/lib/schemas/strategy'
import { pillarColor } from '@/lib/strategy/plan'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import type { Database } from '@/types/database'

/**
 * Stubovi sadržaja i kampanje (faza 10a): čitanje kroz RLS, upis kroz service role posle
 * provere uloge (owner, admin, editor). Strategija ih puni iz AI izlaza, korisnik ih doteruje.
 */
type PillarRow = Database['public']['Tables']['content_pillars']['Row']
type CampaignRow = Database['public']['Tables']['campaigns']['Row']

export interface PillarView {
  id: string
  brandId: string
  strategyId: string | null
  name: string
  description: string | null
  sharePercent: number | null
  color: string | null
  sortOrder: number
  isActive: boolean
}

export interface CampaignView {
  id: string
  brandId: string
  strategyId: string | null
  name: string
  goal: string | null
  startsOn: string | null
  endsOn: string | null
  keyMessage: string | null
  offer: string | null
  cta: string | null
  utmCampaign: string | null
  createdAt: string
}

export function toPillarView(r: PillarRow): PillarView {
  return {
    id: r.id,
    brandId: r.brand_id,
    strategyId: r.strategy_id,
    name: r.name,
    description: r.description,
    sharePercent: r.share_percent,
    color: r.color,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  }
}

export function toCampaignView(r: CampaignRow): CampaignView {
  return {
    id: r.id,
    brandId: r.brand_id,
    strategyId: r.strategy_id,
    name: r.name,
    goal: r.goal,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    keyMessage: r.key_message,
    offer: r.offer,
    cta: r.cta,
    utmCampaign: r.utm_campaign,
    createdAt: r.created_at,
  }
}

async function editorFor(viewer: Viewer, brandId: string) {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  return brand
}

export async function listPillars(
  viewer: Viewer,
  brandId: string,
  includeInactive = false,
): Promise<PillarView[]> {
  await getBrand(viewer, brandId)
  let q = viewer.supabase
    .from('content_pillars')
    .select('*')
    .eq('brand_id', brandId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  return (data ?? []).map(toPillarView)
}

export async function createPillar(
  viewer: Viewer,
  input: z.infer<typeof pillarInputSchema>,
): Promise<PillarView> {
  await editorFor(viewer, input.brandId)
  const admin = createSupabaseAdminClient()
  const existing = await listPillars(viewer, input.brandId, true)
  if (existing.some((p) => p.name.toLowerCase() === input.name.toLowerCase()))
    throw new ApiError('CONFLICT', 'Stub sa tim imenom već postoji.')
  const row = unwrap(
    await admin
      .from('content_pillars')
      .insert({
        brand_id: input.brandId,
        name: input.name,
        description: input.description ?? null,
        share_percent: input.sharePercent ?? null,
        color: input.color ?? pillarColor(existing.length),
        sort_order: existing.length,
      })
      .select('*')
      .single(),
  )
  return toPillarView(row)
}

async function loadPillar(viewer: Viewer, id: string): Promise<PillarRow> {
  return unwrap(
    await viewer.supabase.from('content_pillars').select('*').eq('id', id).maybeSingle(),
    'Stub sadržaja ne postoji ili nemate pristup.',
  )
}

export async function updatePillar(
  viewer: Viewer,
  id: string,
  patch: z.infer<typeof pillarPatchSchema>,
): Promise<PillarView> {
  const row = await loadPillar(viewer, id)
  await editorFor(viewer, row.brand_id)
  const admin = createSupabaseAdminClient()
  const update: Database['public']['Tables']['content_pillars']['Update'] = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.description !== undefined) update.description = patch.description
  if (patch.sharePercent !== undefined) update.share_percent = patch.sharePercent
  if (patch.color !== undefined) update.color = patch.color
  if (patch.isActive !== undefined) update.is_active = patch.isActive
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder
  const updated = unwrap(await admin.from('content_pillars').update(update).eq('id', id).select('*').single())
  return toPillarView(updated)
}

export async function deletePillar(viewer: Viewer, id: string): Promise<void> {
  const row = await loadPillar(viewer, id)
  await editorFor(viewer, row.brand_id)
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('content_pillars').delete().eq('id', id)
  if (error) throw mapDbError(error)
}

export async function listCampaigns(viewer: Viewer, brandId: string): Promise<CampaignView[]> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('campaigns')
    .select('*')
    .eq('brand_id', brandId)
    .order('starts_on', { ascending: true, nullsFirst: false })
  if (error) throw mapDbError(error)
  return (data ?? []).map(toCampaignView)
}

export async function createCampaign(
  viewer: Viewer,
  input: z.infer<typeof campaignInputSchema>,
): Promise<CampaignView> {
  await editorFor(viewer, input.brandId)
  const admin = createSupabaseAdminClient()
  const row = unwrap(
    await admin
      .from('campaigns')
      .insert({
        brand_id: input.brandId,
        strategy_id: input.strategyId ?? null,
        name: input.name,
        goal: input.goal ?? null,
        starts_on: input.startsOn ?? null,
        ends_on: input.endsOn ?? null,
        key_message: input.keyMessage ?? null,
        offer: input.offer ?? null,
        cta: input.cta ?? null,
        utm_campaign: input.utmCampaign ?? null,
      })
      .select('*')
      .single(),
  )
  return toCampaignView(row)
}

async function loadCampaign(viewer: Viewer, id: string): Promise<CampaignRow> {
  return unwrap(
    await viewer.supabase.from('campaigns').select('*').eq('id', id).maybeSingle(),
    'Kampanja ne postoji ili nemate pristup.',
  )
}

export async function updateCampaign(
  viewer: Viewer,
  id: string,
  patch: z.infer<typeof campaignPatchSchema>,
): Promise<CampaignView> {
  const row = await loadCampaign(viewer, id)
  await editorFor(viewer, row.brand_id)
  const admin = createSupabaseAdminClient()
  const update: Database['public']['Tables']['campaigns']['Update'] = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.goal !== undefined) update.goal = patch.goal
  if (patch.startsOn !== undefined) update.starts_on = patch.startsOn
  if (patch.endsOn !== undefined) update.ends_on = patch.endsOn
  if (patch.keyMessage !== undefined) update.key_message = patch.keyMessage
  if (patch.offer !== undefined) update.offer = patch.offer
  if (patch.cta !== undefined) update.cta = patch.cta
  if (patch.utmCampaign !== undefined) update.utm_campaign = patch.utmCampaign
  const startsOn = update.starts_on === undefined ? row.starts_on : update.starts_on
  const endsOn = update.ends_on === undefined ? row.ends_on : update.ends_on
  if (startsOn && endsOn && endsOn < startsOn)
    throw new ApiError('VALIDATION', 'Kraj kampanje je pre početka.')
  const updated = unwrap(await admin.from('campaigns').update(update).eq('id', id).select('*').single())
  return toCampaignView(updated)
}

export async function deleteCampaign(viewer: Viewer, id: string): Promise<void> {
  const row = await loadCampaign(viewer, id)
  await editorFor(viewer, row.brand_id)
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('campaigns').delete().eq('id', id)
  if (error) throw mapDbError(error)
}
