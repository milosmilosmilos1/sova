import 'server-only'

import { toContentLocale } from '@/config/locales'
import type { SocialPlatform } from '@/config/platforms'
import { PLATFORM_FORMATS, POST_FORMATS, type PostFormat } from '@/config/post-formats'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueMonthPlan, enqueueMonthPlanGenerate } from '@/lib/jobs/enqueue'
import { buildSlots, planPeriod, slotMonths } from '@/lib/plans/slots'
import type { PlanItemUpdate, PlanRequestInput } from '@/lib/schemas/plans'
import type { BestTimes } from '@/lib/strategy/plan'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrices } from '@/lib/tokens/prices'
import { getTokenBalance } from '@/lib/tokens/reservation'
import { wallClock, zonedToUtc } from '@/lib/zoned-time'
import { assertDailyQuota } from '@/services/ai/generations'
import { getBrand, type BrandRow } from '@/services/brands'
import type { Json } from '@/types/database'

import { pendingItems, planSettings, type ItemRow, type PlanRow, type PlanSettings } from './runner'

/**
 * Mesečni plan (D-119): Sova bira termine, vrste i teme za ceo mesec ili do tri meseca unapred
 * (D-120); korisnik izbaci šta ne želi, promeni temu ili termin, pa „Generiši sve” pravi sve nacrte
 * u pozadini. Plan za iste mesece koji još nije pokrenut zamenjuje se novim; pokrenuti planovi ostaju.
 */
export interface PlanItemView {
  id: string
  scheduledFor: string
  date: string
  time: string
  format: PostFormat
  platforms: SocialPlatform[]
  topic: string
  brief: string
  goal: string
  pillar: string | null
  cta: string | null
  status: 'planned' | 'generating' | 'done' | 'failed'
  postId: string | null
  error: string | null
}

export interface PlanView {
  id: string
  month: string
  periodStart: string
  periodEnd: string
  status: 'planning' | 'ready' | 'generating' | 'done' | 'failed'
  settings: Omit<PlanSettings, 'slots'>
  error: string | null
  tokensCharged: number
  createdAt: string
  items: PlanItemView[]
  counts: { planned: number; generating: number; done: number; failed: number }
}

export interface PlanPageView {
  plan: PlanView | null
  options: {
    platforms: SocialPlatform[]
    months: Array<{ kind: 'current' | 'next'; month: string; start: string; end: string }>
    prices: { plan: number; post: number }
    balance: number
    timezone: string
    locale: string
    canSchedule: boolean
  }
}

function toView(plan: PlanRow, items: ItemRow[], timeZone: string): PlanView {
  const { slots: _slots, ...settings } = planSettings(plan)
  const views = items
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for) || a.position - b.position)
    .map((i) => {
      const local = wallClock(i.scheduled_for, timeZone)
      return {
        id: i.id,
        scheduledFor: i.scheduled_for,
        date: local.date,
        time: local.time,
        format: i.format as PostFormat,
        platforms: i.platforms as SocialPlatform[],
        topic: i.topic,
        brief: i.brief,
        goal: i.goal,
        pillar: i.pillar,
        cta: i.cta,
        status: i.status as PlanItemView['status'],
        postId: i.post_id,
        error: i.error,
      }
    })
  const counts = { planned: 0, generating: 0, done: 0, failed: 0 }
  for (const i of views) counts[i.status]++
  return {
    id: plan.id,
    month: plan.month,
    periodStart: plan.period_start,
    periodEnd: plan.period_end,
    status: plan.status as PlanView['status'],
    settings,
    error: plan.error,
    tokensCharged: plan.tokens_charged,
    createdAt: plan.created_at,
    items: views,
    counts,
  }
}

async function activePlatforms(brandId: string): Promise<SocialPlatform[]> {
  const { data } = await createSupabaseAdminClient()
    .from('social_accounts')
    .select('platform')
    .eq('brand_id', brandId)
    .eq('status', 'active')
  return [...new Set((data ?? []).map((a) => a.platform as SocialPlatform))]
}

async function loadPlanFor(viewer: Viewer, planId: string): Promise<{ plan: PlanRow; brand: BrandRow }> {
  const { data: plan, error } = await viewer.supabase
    .from('month_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!plan) throw new ApiError('NOT_FOUND', 'Plan ne postoji.')
  return { plan, brand: await getBrand(viewer, plan.brand_id) }
}

async function planView(plan: PlanRow, brand: BrandRow): Promise<PlanView> {
  const { data: items, error } = await createSupabaseAdminClient()
    .from('month_plan_items')
    .select('*')
    .eq('plan_id', plan.id)
  if (error) throw mapDbError(error)
  return toView(plan, items ?? [], brand.timezone)
}

export async function getPlanPage(viewer: Viewer, brandId: string): Promise<PlanPageView> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id)
  const admin = createSupabaseAdminClient()
  const [{ data: latest }, platforms, prices, balance] = await Promise.all([
    admin
      .from('month_plans')
      .select('*')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    activePlatforms(brand.id),
    getTokenPrices(),
    getTokenBalance(brand.workspace_id),
  ])
  const today = wallClock(new Date().toISOString(), brand.timezone).date
  const months = (['current', 'next'] as const).flatMap((kind) => {
    const p = planPeriod(kind, today)
    return p ? [{ kind, ...p }] : []
  })
  return {
    plan: latest ? await planView(latest, brand) : null,
    options: {
      platforms,
      months,
      prices: { plan: prices.month_plan, post: prices.text },
      balance: balance.available,
      timezone: brand.timezone,
      locale: brand.content_locale,
      canSchedule: ADMIN_ROLES.includes(membership.role),
    },
  }
}

export async function getPlan(viewer: Viewer, planId: string): Promise<PlanView> {
  const { plan, brand } = await loadPlanFor(viewer, planId)
  return planView(plan, brand)
}

/** Najbolja vremena iz aktivne strategije brenda (ako postoji), za termine plana. */
async function strategyBestTimes(brandId: string): Promise<BestTimes | undefined> {
  const { data } = await createSupabaseAdminClient()
    .from('strategies')
    .select('best_times')
    .eq('brand_id', brandId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.best_times as BestTimes | null) ?? undefined
}

export async function requestPlan(viewer: Viewer, input: PlanRequestInput): Promise<PlanView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)
  const connected = await activePlatforms(brand.id)
  const platforms = (input.platforms.length ? input.platforms : connected).filter((p) =>
    connected.includes(p),
  )
  if (!platforms.length)
    throw new ApiError('VALIDATION', 'Povežite bar jednu mrežu u Mrežama, pa napravite plan.')
  const today = wallClock(new Date().toISOString(), brand.timezone).date
  const period = planPeriod(input.kind, today, input.months)
  if (!period) throw new ApiError('VALIDATION', 'Ovaj mesec je završen. Napravite plan za sledeći mesec.')
  const formats = POST_FORMATS.filter((f) => input.formats.includes(f))
  const slots = buildSlots({
    start: period.start,
    end: period.end,
    perWeek: input.perWeek,
    formats,
    platforms,
    bestTimes: await strategyBestTimes(brand.id),
  })
  if (!slots.length)
    throw new ApiError(
      'VALIDATION',
      'Izabrane mreže ne primaju izabrane vrste objava. Dodajte vrstu ili mrežu.',
    )
  // teme se biraju mesec po mesec, pa plan košta cenu plana za svaki mesec
  const prices = await getTokenPrices()
  const planCost = prices.month_plan * slotMonths(slots).length
  const balance = await getTokenBalance(brand.workspace_id)
  if (balance.available < planCost)
    throw new ApiError(
      'INSUFFICIENT_TOKENS',
      `Za plan treba ${planCost} tokena. Dopunite tokene pa pokušajte ponovo.`,
    )

  const admin = createSupabaseAdminClient()
  // plan koji pokriva iste dane zamenjuje se novim, osim plana iz kog su već napravljeni nacrti
  const { data: old } = await admin
    .from('month_plans')
    .select('id, status')
    .eq('brand_id', brand.id)
    .lte('period_start', period.end)
    .gte('period_end', period.start)
  if ((old ?? []).some((o) => o.status === 'generating'))
    throw new ApiError('CONFLICT', 'Nacrti za ove mesece se upravo prave. Sačekajte da se završi.')
  const oldIds = (old ?? []).map((o) => o.id)
  if (oldIds.length) {
    const { data: used } = await admin
      .from('month_plan_items')
      .select('plan_id')
      .in('plan_id', oldIds)
      .not('post_id', 'is', null)
    const keep = new Set((used ?? []).map((u) => u.plan_id))
    const remove = oldIds.filter((id) => !keep.has(id))
    if (remove.length) {
      const { error: cleanError } = await admin.from('month_plans').delete().in('id', remove)
      if (cleanError) throw mapDbError(cleanError)
    }
  }
  const settings: PlanSettings = {
    kind: input.kind,
    months: input.months,
    look: input.look,
    perWeek: input.perWeek,
    platforms,
    formats,
    locale: toContentLocale(input.locale ?? brand.content_locale),
    notes: input.notes?.trim() || null,
    slots,
  }
  const { data: plan, error } = await admin
    .from('month_plans')
    .insert({
      workspace_id: brand.workspace_id,
      brand_id: brand.id,
      month: period.month,
      period_start: period.start,
      period_end: period.end,
      status: 'planning',
      settings: settings as unknown as Json,
      created_by: viewer.user.id,
    })
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  try {
    await enqueueMonthPlan(plan.id, brand.id)
  } catch (enqueueError) {
    // bez posla u redu plan bi zauvek „pravio teme”
    await admin.from('month_plans').delete().eq('id', plan.id)
    throw enqueueError
  }
  return planView(plan, brand)
}

function assertEditable(plan: PlanRow): void {
  if (plan.status === 'planning')
    throw new ApiError('CONFLICT', 'Sova još pravi plan. Sačekajte da se pojave teme.')
  if (plan.status === 'generating')
    throw new ApiError('CONFLICT', 'Nacrti se upravo prave. Sačekajte da se završi.')
}

export async function updatePlanItem(
  viewer: Viewer,
  planId: string,
  itemId: string,
  input: PlanItemUpdate,
): Promise<PlanView> {
  const { plan, brand } = await loadPlanFor(viewer, planId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  assertEditable(plan)
  const admin = createSupabaseAdminClient()
  const { data: item } = await admin
    .from('month_plan_items')
    .select('*')
    .eq('id', itemId)
    .eq('plan_id', plan.id)
    .maybeSingle()
  if (!item) throw new ApiError('NOT_FOUND', 'Stavka plana ne postoji.')
  if (item.status === 'done')
    throw new ApiError('CONFLICT', 'Nacrt je već napravljen; menjajte ga u Odobravanju.')
  const patch: Partial<ItemRow> = { updated_at: new Date().toISOString() }
  if (input.topic !== undefined) patch.topic = input.topic
  if (input.brief !== undefined) patch.brief = input.brief
  if (input.format !== undefined) {
    const settings = planSettings(plan)
    const platforms = settings.platforms.filter((p) => PLATFORM_FORMATS[p].includes(input.format!))
    if (!platforms.length)
      throw new ApiError('VALIDATION', 'Nijedna mreža iz plana ne prima ovu vrstu objave.')
    patch.format = input.format
    patch.platforms = platforms
  }
  if (input.date !== undefined || input.time !== undefined) {
    const local = wallClock(item.scheduled_for, brand.timezone)
    const date = input.date ?? local.date
    if (date < plan.period_start || date > plan.period_end)
      throw new ApiError('VALIDATION', 'Datum mora biti u periodu plana.')
    patch.scheduled_for = zonedToUtc(date, input.time ?? local.time, brand.timezone)
  }
  const { error } = await admin.from('month_plan_items').update(patch).eq('id', item.id)
  if (error) throw mapDbError(error)
  return planView(plan, brand)
}

/** Brisanje označenih stavki; napravljeni nacrti ostaju u Odobravanju. */
export async function deletePlanItems(viewer: Viewer, planId: string, ids: string[]): Promise<PlanView> {
  const { plan, brand } = await loadPlanFor(viewer, planId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  assertEditable(plan)
  const { error } = await createSupabaseAdminClient()
    .from('month_plan_items')
    .delete()
    .eq('plan_id', plan.id)
    .in('id', ids)
    .neq('status', 'generating')
  if (error) throw mapDbError(error)
  return planView(plan, brand)
}

export async function deletePlan(viewer: Viewer, planId: string): Promise<void> {
  const { plan, brand } = await loadPlanFor(viewer, planId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (plan.status === 'generating')
    throw new ApiError('CONFLICT', 'Nacrti se upravo prave. Sačekajte da se završi.')
  const { error } = await createSupabaseAdminClient().from('month_plans').delete().eq('id', plan.id)
  if (error) throw mapDbError(error)
}

/** „Generiši sve”: proverava tokene za sve preostale stavke i pokreće pravljenje u pozadini. */
export async function startPlanGeneration(
  viewer: Viewer,
  planId: string,
  mode: 'review' | 'schedule',
): Promise<PlanView> {
  const { plan, brand } = await loadPlanFor(viewer, planId)
  const membership = await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  assertEditable(plan)
  if (mode === 'schedule' && !ADMIN_ROLES.includes(membership.role))
    throw new ApiError('FORBIDDEN', 'Zakazivanje bez odobravanja može samo vlasnik ili administrator.')
  const pending = await pendingItems(plan.id)
  if (!pending.length) throw new ApiError('VALIDATION', 'U planu nema objava za pravljenje.')
  const prices = await getTokenPrices()
  const need = pending.length * prices.text
  const balance = await getTokenBalance(brand.workspace_id)
  if (balance.available < need)
    throw new ApiError(
      'INSUFFICIENT_TOKENS',
      `Za ${pending.length} objava treba ${need} tokena, a dostupno je ${balance.available}. Obrišite deo plana ili dopunite tokene.`,
      { details: { required: need, shortfall: need - balance.available } },
    )
  const admin = createSupabaseAdminClient()
  const settings = { ...planSettings(plan), mode }
  const { data: updated, error } = await admin
    .from('month_plans')
    .update({
      status: 'generating',
      settings: settings as unknown as Json,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id)
    .in('status', ['ready', 'done', 'failed'])
    .select('*')
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!updated) throw new ApiError('CONFLICT', 'Plan je u međuvremenu pokrenut.')
  await admin
    .from('month_plan_items')
    .update({ status: 'planned', error: null })
    .eq('plan_id', plan.id)
    .eq('status', 'failed')
  try {
    await enqueueMonthPlanGenerate(plan.id, brand.id)
  } catch (enqueueError) {
    // bez posla u redu plan bi ostao zaključan u „pravim nacrte”
    await admin.from('month_plans').update({ status: plan.status }).eq('id', plan.id)
    throw enqueueError
  }
  return planView(updated, brand)
}
