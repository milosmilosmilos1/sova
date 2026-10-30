import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { autoTimeFor, nextRunAt } from '@/lib/flows/schedule'
import { enqueueFlowRun } from '@/lib/jobs/enqueue'
import type { CreateFlowInput, FlowFormat, UpdateFlowInput } from '@/lib/schemas/flows'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getBrand, type BrandRow } from '@/services/brands'
import type { Database } from '@/types/database'

/**
 * Tokovi automatizacije (D-108, faza 3): jedna tema po toku, format i stil, raspored pripreme.
 * Čitanje kroz RLS (član brenda), upis kroz service role posle provere uloge, kao Autopilot.
 */
export type FlowRow = Database['public']['Tables']['content_flows']['Row']
export type FlowRunRow = Database['public']['Tables']['content_flow_runs']['Row']

export const MAX_FLOWS_PER_BRAND = 50

export interface FlowView {
  id: string
  brandId: string
  name: string
  topic: string
  cta: string | null
  ctaMode: 'none' | 'dm'
  format: FlowFormat
  styleId: string | null
  slides: number | null
  photoSource: string | null
  galleryCategoryId: string | null
  locale: string | null
  autoAccounts: boolean
  accountIds: string[]
  days: number[]
  timeLocal: string
  autoTime: boolean
  /** vreme pripreme koje važi (kod „Sova bira vreme” stabilan termin toka) */
  effectiveTime: string
  collaborators: string[]
  active: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastRun: {
    id: string
    status: string
    error: string | null
    postId: string | null
    finishedAt: string | null
  } | null
  createdAt: string
}

export function effectiveTime(flow: Pick<FlowRow, 'id' | 'time_local' | 'auto_time'>): string {
  return flow.auto_time ? autoTimeFor(flow.id) : flow.time_local.slice(0, 5)
}

/** Sledeći termin pripreme za aktivan tok; pauziran tok nema termin. */
export function computeNextRun(
  flow: Pick<FlowRow, 'id' | 'days' | 'time_local' | 'auto_time' | 'active'>,
  timeZone: string,
  after = new Date(),
): string | null {
  if (!flow.active) return null
  return nextRunAt({ days: flow.days, timeLocal: effectiveTime(flow), timeZone, after })
}

function toView(row: FlowRow, lastRun: FlowRunRow | null): FlowView {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    topic: row.topic,
    cta: row.cta,
    ctaMode: row.cta_mode as 'none' | 'dm',
    format: row.format as FlowFormat,
    styleId: row.style_id,
    slides: row.slides,
    photoSource: row.photo_source,
    galleryCategoryId: row.gallery_category_id,
    locale: row.locale,
    autoAccounts: row.auto_accounts,
    accountIds: row.account_ids,
    days: row.days,
    timeLocal: row.time_local.slice(0, 5),
    autoTime: row.auto_time,
    effectiveTime: effectiveTime(row),
    collaborators: row.collaborators,
    active: row.active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          error: lastRun.error,
          postId: lastRun.post_id,
          finishedAt: lastRun.finished_at,
        }
      : null,
    createdAt: row.created_at,
  }
}

async function lastRuns(flowIds: string[]): Promise<Map<string, FlowRunRow>> {
  if (!flowIds.length) return new Map()
  const { data } = await createSupabaseAdminClient()
    .from('content_flow_runs')
    .select('*')
    .in('flow_id', flowIds)
    .order('created_at', { ascending: false })
    .limit(flowIds.length * 5)
  const map = new Map<string, FlowRunRow>()
  for (const r of data ?? []) if (!map.has(r.flow_id)) map.set(r.flow_id, r)
  return map
}

export async function listFlows(viewer: Viewer, brandId: string): Promise<FlowView[]> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('content_flows')
    .select('*')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw mapDbError(error)
  const runs = await lastRuns((data ?? []).map((f) => f.id))
  return (data ?? []).map((f) => toView(f, runs.get(f.id) ?? null))
}

async function loadFlow(viewer: Viewer, flowId: string): Promise<{ flow: FlowRow; brand: BrandRow }> {
  const { data, error } = await viewer.supabase
    .from('content_flows')
    .select('*')
    .eq('id', flowId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('NOT_FOUND', 'Tok ne postoji.')
  return { flow: data, brand: await getBrand(viewer, data.brand_id) }
}

export async function getFlow(viewer: Viewer, flowId: string): Promise<FlowView> {
  const { flow } = await loadFlow(viewer, flowId)
  return toView(flow, (await lastRuns([flow.id])).get(flow.id) ?? null)
}

/** Nalozi iz izbora moraju pripadati brendu. */
async function assertGalleryCategory(brandId: string, categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return
  const { data } = await createSupabaseAdminClient()
    .from('gallery_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('brand_id', brandId)
    .maybeSingle()
  if (!data) throw new ApiError('VALIDATION', 'Kategorija galerije ne pripada ovom brendu.')
}

async function assertAccounts(brandId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const { data } = await createSupabaseAdminClient()
    .from('social_accounts')
    .select('id')
    .eq('brand_id', brandId)
    .in('id', ids)
  if ((data ?? []).length !== new Set(ids).size)
    throw new ApiError('VALIDATION', 'Izabrani nalog ne pripada ovom brendu.')
}

export async function createFlow(viewer: Viewer, input: CreateFlowInput): Promise<FlowView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  await assertAccounts(brand.id, input.accountIds)
  await assertGalleryCategory(brand.id, input.galleryCategoryId)
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('content_flows')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
    .is('deleted_at', null)
  if ((count ?? 0) >= MAX_FLOWS_PER_BRAND)
    throw new ApiError('PLAN_LIMIT', `Brend može imati najviše ${MAX_FLOWS_PER_BRAND} tokova.`)
  const id = crypto.randomUUID()
  const row = {
    id,
    days: input.days,
    time_local: input.timeLocal,
    auto_time: input.autoTime,
    active: input.active,
  }
  const { data, error } = await admin
    .from('content_flows')
    .insert({
      ...row,
      workspace_id: brand.workspace_id,
      brand_id: brand.id,
      name: input.name,
      topic: input.topic,
      cta: input.cta ?? null,
      cta_mode: input.ctaMode,
      format: input.format,
      style_id: input.styleId ?? null,
      slides: input.slides ?? null,
      photo_source: input.photoSource ?? null,
      gallery_category_id: input.galleryCategoryId ?? null,
      locale: input.locale ?? null,
      auto_accounts: input.autoAccounts,
      account_ids: input.accountIds,
      collaborators: input.collaborators,
      next_run_at: computeNextRun(row, brand.timezone),
      created_by: viewer.user.id,
    })
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  return toView(data, null)
}

export async function updateFlow(viewer: Viewer, flowId: string, input: UpdateFlowInput): Promise<FlowView> {
  const { flow, brand } = await loadFlow(viewer, flowId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (input.accountIds) await assertAccounts(brand.id, input.accountIds)
  await assertGalleryCategory(brand.id, input.galleryCategoryId)
  const update: Database['public']['Tables']['content_flows']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  if (input.name !== undefined) update.name = input.name
  if (input.topic !== undefined) update.topic = input.topic
  if (input.cta !== undefined) update.cta = input.cta
  if (input.ctaMode !== undefined) update.cta_mode = input.ctaMode
  if (input.format !== undefined) update.format = input.format
  if (input.styleId !== undefined) update.style_id = input.styleId
  if (input.slides !== undefined) update.slides = input.slides
  if (input.photoSource !== undefined) update.photo_source = input.photoSource
  if (input.galleryCategoryId !== undefined) update.gallery_category_id = input.galleryCategoryId
  if (input.locale !== undefined) update.locale = input.locale
  if (input.autoAccounts !== undefined) update.auto_accounts = input.autoAccounts
  if (input.accountIds !== undefined) update.account_ids = input.accountIds
  if (input.days !== undefined) update.days = input.days
  if (input.timeLocal !== undefined) update.time_local = input.timeLocal
  if (input.autoTime !== undefined) update.auto_time = input.autoTime
  if (input.collaborators !== undefined) update.collaborators = input.collaborators
  if (input.active !== undefined) update.active = input.active
  const merged = {
    id: flow.id,
    days: update.days ?? flow.days,
    time_local: update.time_local ?? flow.time_local,
    auto_time: update.auto_time ?? flow.auto_time,
    active: update.active ?? flow.active,
  }
  update.next_run_at = computeNextRun(merged, brand.timezone)
  const { data, error } = await createSupabaseAdminClient()
    .from('content_flows')
    .update(update)
    .eq('id', flow.id)
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  return toView(data, (await lastRuns([flow.id])).get(flow.id) ?? null)
}

export async function deleteFlow(viewer: Viewer, flowId: string): Promise<void> {
  const { flow, brand } = await loadFlow(viewer, flowId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { error } = await createSupabaseAdminClient()
    .from('content_flows')
    .update({ deleted_at: new Date().toISOString(), active: false, next_run_at: null })
    .eq('id', flow.id)
  if (error) throw mapDbError(error)
}

export interface FlowRunView {
  id: string
  flowId: string
  status: string
  step: string | null
  postId: string | null
  error: string | null
  tokens: number
  createdAt: string
  finishedAt: string | null
}

const runView = (r: FlowRunRow): FlowRunView => ({
  id: r.id,
  flowId: r.flow_id,
  status: r.status,
  step: r.step,
  postId: r.post_id,
  error: r.error,
  tokens: r.tokens,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
})

/**
 * „Generiši odmah”: novi prolaz odmah, bez čekanja termina. Prolaz koji je već u toku za isti tok
 * se vraća umesto novog, da dvostruki klik ne potroši tokene dvaput.
 */
export async function startManualRun(viewer: Viewer, flowId: string): Promise<FlowRunView> {
  const { flow, brand } = await loadFlow(viewer, flowId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const admin = createSupabaseAdminClient()
  const { data: running } = await admin
    .from('content_flow_runs')
    .select('*')
    .eq('flow_id', flow.id)
    .in('status', ['queued', 'running'])
    .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (running) return runView(running)
  const { data, error } = await admin
    .from('content_flow_runs')
    .insert({
      flow_id: flow.id,
      brand_id: brand.id,
      workspace_id: brand.workspace_id,
      slot_at: new Date().toISOString(),
      trigger: 'manual',
      triggered_by: viewer.user.id,
    })
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  await enqueueFlowRun(data.id, flow.workspace_id)
  return runView(data)
}

export async function getRun(viewer: Viewer, runId: string): Promise<FlowRunView> {
  const { data, error } = await viewer.supabase
    .from('content_flow_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('NOT_FOUND', 'Prolaz toka ne postoji.')
  return runView(data)
}

/**
 * Tokovi kojima je došao termin: za svaki se upisuje prolaz (jedan po toku i terminu, pa ponovljen
 * cron ne pravi duplikat) i računa sledeći termin od sada, da posle zastoja ne krene zaostatak.
 */
export async function claimDueRuns(
  now = new Date(),
  limit = 100,
): Promise<Array<{ runId: string; workspaceId: string }>> {
  const admin = createSupabaseAdminClient()
  const { data: due } = await admin
    .from('content_flows')
    .select('*, brands!inner(timezone, status, deleted_at)')
    .eq('active', true)
    .is('deleted_at', null)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(limit)
  const claimed: Array<{ runId: string; workspaceId: string }> = []
  for (const flow of due ?? []) {
    const brand = flow.brands as unknown as { timezone: string; status: string; deleted_at: string | null }
    const next = computeNextRun(flow, brand.timezone, now)
    await admin.from('content_flows').update({ next_run_at: next }).eq('id', flow.id)
    if (brand.deleted_at || brand.status !== 'active') continue
    const { data: run } = await admin
      .from('content_flow_runs')
      .upsert(
        {
          flow_id: flow.id,
          brand_id: flow.brand_id,
          workspace_id: flow.workspace_id,
          slot_at: flow.next_run_at!,
        },
        { onConflict: 'flow_id,slot_at', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    if (run) claimed.push({ runId: run.id, workspaceId: flow.workspace_id })
  }
  return claimed
}
