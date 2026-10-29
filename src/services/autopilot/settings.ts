import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { POST_FORMATS, type PostFormat } from '@/config/post-formats'
import {
  AUTOPILOT_LEVELS,
  budgetState,
  monthStartUtc,
  nextWeekRange,
  type AutopilotLevel,
  type BudgetState,
} from '@/lib/autopilot/rules'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { isFeatureEnabled } from '@/lib/flags'
import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { UpdateAutopilotInput } from '@/lib/schemas/autopilot'
import { validateScheduleTime } from '@/lib/posts/state-machine'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import { systemTransition } from '@/services/posts/system'
import type { Database, Json } from '@/types/database'

/**
 * Podešavanja Autopilota po brendu (brif 9.2): nivo 0–3, mesečni budžet tokena, rok za odobrenje,
 * šta sa neodobrenim objavama, nalozi za pun autopilot (nivo 3 traži flag, potvrdu imenom brenda
 * i izbor naloga), „Pauziraj sve” i nastavak.
 */
type BrandRow = Database['public']['Tables']['brands']['Row']

export interface AutopilotSettingsJson {
  /** jezik objava Autopilota (D-107); prazno = jezik brenda */
  language?: 'sr-Latn' | 'sr-Cyrl' | 'en' | null
  /** dozvoljene vrste objava (D-107); prazno = sve */
  formats?: PostFormat[]
  /** AI meša dozvoljene vrste kroz nedelju; isključeno = uvek prva dozvoljena */
  mix?: boolean
  level3AccountIds?: string[]
  level3ConfirmedBy?: string | null
  pausedPostIds?: string[]
  pausedBy?: string | null
}

export function autopilotSettings(brand: Pick<BrandRow, 'settings'>): AutopilotSettingsJson {
  const s = (brand.settings ?? {}) as Record<string, unknown>
  const a = s.autopilot
  return a && typeof a === 'object' && !Array.isArray(a) ? (a as AutopilotSettingsJson) : {}
}

/** Jezik, vrste objava i mešanje (D-107) sa podrazumevanim vrednostima: jezik brenda, sve vrste, AI meša. */
export function autopilotContentPrefs(brand: Pick<BrandRow, 'settings' | 'content_locale'>): {
  language: 'sr-Latn' | 'sr-Cyrl' | 'en'
  formats: PostFormat[]
  mix: boolean
} {
  const s = autopilotSettings(brand)
  const formats = (s.formats ?? []).filter((f) => (POST_FORMATS as readonly string[]).includes(f))
  return {
    language: s.language ?? (brand.content_locale as 'sr-Latn' | 'sr-Cyrl' | 'en'),
    formats: formats.length ? formats : [...POST_FORMATS],
    mix: s.mix ?? true,
  }
}

export interface BudgetUsage {
  month: string
  used: number
  budget: number | null
  state: BudgetState
  percent: number | null
  remaining: number | null
}

/** Tokeni koje je Autopilot potrošio u tekućem (UTC) mesecu. */
export async function autopilotUsage(
  brandId: string,
  budget: number | null,
  now = new Date(),
): Promise<BudgetUsage> {
  const admin = createSupabaseAdminClient()
  const month = monthStartUtc(now)
  const { data } = await admin
    .from('ai_generations')
    .select('tokens_charged')
    .eq('brand_id', brandId)
    .eq('input->>autopilot', 'true')
    .gte('created_at', month)
    .limit(5000)
  const used = (data ?? []).reduce((n, r) => n + (r.tokens_charged ?? 0), 0)
  return { month: month.slice(0, 7), used, budget, ...budgetState(used, budget) }
}

export interface AutopilotRunView {
  id: string
  kind: 'weekly' | 'monthly'
  periodStart: string
  level: number
  status: string
  summary: Record<string, Json>
  tokensUsed: number
  createdAt: string
  finishedAt: string | null
}

export interface AutopilotView {
  brandId: string
  brandName: string
  timezone: string
  level: AutopilotLevel
  levels: typeof AUTOPILOT_LEVELS
  tokenBudget: number | null
  approvalDeadlineHours: number
  unapprovedAction: 'skip' | 'publish'
  level3Available: boolean
  level3ConfirmedAt: string | null
  level3AccountIds: string[]
  /** D-107 */
  language: 'sr-Latn' | 'sr-Cyrl' | 'en'
  formats: PostFormat[]
  mix: boolean
  paused: boolean
  pausedAt: string | null
  usage: BudgetUsage
  activeStrategy: { id: string; periodStart: string; periodEnd: string } | null
  nextWeek: { start: string; end: string }
  accounts: Array<{ id: string; name: string; platform: SocialPlatform; status: string }>
  runs: AutopilotRunView[]
}

async function loadBrandAdmin(brandId: string): Promise<BrandRow> {
  const admin = createSupabaseAdminClient()
  return unwrap(await admin.from('brands').select('*').eq('id', brandId).maybeSingle(), 'Brend ne postoji.')
}

export async function getAutopilot(
  viewer: Viewer,
  brandId: string,
  now = new Date(),
): Promise<AutopilotView> {
  await getBrand(viewer, brandId)
  const brand = await loadBrandAdmin(brandId)
  const settings = autopilotSettings(brand)
  const [usage, level3Available, accounts, strategies, runs] = await Promise.all([
    autopilotUsage(brand.id, brand.autopilot_token_budget, now),
    isFeatureEnabled('autopilot_level3'),
    viewer.supabase
      .from('social_accounts_public')
      .select('id, name, platform, status')
      .eq('brand_id', brandId),
    viewer.supabase
      .from('strategies')
      .select('id, period_start, period_end')
      .eq('brand_id', brandId)
      .eq('status', 'active')
      .order('period_start', { ascending: false }),
    viewer.supabase
      .from('autopilot_runs')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  const today = now.toISOString().slice(0, 10)
  const active =
    (strategies.data ?? []).find((s) => s.period_start <= today && s.period_end >= today) ??
    strategies.data?.[0] ??
    null
  return {
    brandId: brand.id,
    brandName: brand.name,
    timezone: brand.timezone,
    level: brand.autopilot_level as AutopilotLevel,
    levels: AUTOPILOT_LEVELS,
    tokenBudget: brand.autopilot_token_budget,
    approvalDeadlineHours: brand.autopilot_approval_deadline_hours,
    unapprovedAction: brand.autopilot_unapproved_action as 'skip' | 'publish',
    level3Available,
    level3ConfirmedAt: brand.autopilot_level3_confirmed_at,
    level3AccountIds: settings.level3AccountIds ?? [],
    ...autopilotContentPrefs(brand),
    paused: brand.status === 'paused',
    pausedAt: brand.paused_at,
    usage,
    activeStrategy: active
      ? { id: active.id, periodStart: active.period_start, periodEnd: active.period_end }
      : null,
    nextWeek: nextWeekRange(now, brand.timezone),
    accounts: (accounts.data ?? []).map((a) => ({
      id: a.id!,
      name: a.name ?? '',
      platform: a.platform as SocialPlatform,
      status: a.status ?? 'active',
    })),
    runs: (runs.data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind as 'weekly' | 'monthly',
      periodStart: r.period_start,
      level: r.level,
      status: r.status,
      summary: (r.summary as Record<string, Json>) ?? {},
      tokensUsed: r.tokens_used,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    })),
  }
}

export async function updateAutopilot(
  viewer: Viewer,
  brandId: string,
  input: UpdateAutopilotInput,
): Promise<AutopilotView> {
  const viewerBrand = await getBrand(viewer, brandId)
  await requireMembership(viewer, viewerBrand.workspace_id, ADMIN_ROLES)
  const brand = await loadBrandAdmin(brandId)
  const settings = autopilotSettings(brand)
  const update: Database['public']['Tables']['brands']['Update'] = {}
  if (input.tokenBudget !== undefined) update.autopilot_token_budget = input.tokenBudget
  if (input.approvalDeadlineHours !== undefined)
    update.autopilot_approval_deadline_hours = input.approvalDeadlineHours
  if (input.unapprovedAction !== undefined) update.autopilot_unapproved_action = input.unapprovedAction
  const nextSettings: AutopilotSettingsJson = { ...settings }
  if (input.language !== undefined) nextSettings.language = input.language
  if (input.formats !== undefined) nextSettings.formats = input.formats
  if (input.mix !== undefined) nextSettings.mix = input.mix

  const level = input.level ?? (brand.autopilot_level as AutopilotLevel)
  if (level === 3) {
    const enteringOrChanging = brand.autopilot_level !== 3 || input.level3AccountIds !== undefined
    if (enteringOrChanging) {
      if (!(await isFeatureEnabled('autopilot_level3'))) {
        throw new ApiError('FORBIDDEN', 'Pun autopilot još nije dostupan na ovom nalogu.')
      }
      if ((input.confirm ?? '').trim().toLowerCase() !== brand.name.trim().toLowerCase()) {
        throw new ApiError('VALIDATION', 'Za pun autopilot upišite tačan naziv brenda kao potvrdu.', {
          fields: { confirm: ['Upišite naziv brenda.'] },
        })
      }
      const ids = input.level3AccountIds ?? settings.level3AccountIds ?? []
      if (!ids.length) {
        throw new ApiError('VALIDATION', 'Izaberite bar jedan nalog na kome Sova objavljuje bez odobrenja.', {
          fields: { level3AccountIds: ['obavezno'] },
        })
      }
      const admin = createSupabaseAdminClient()
      const { data: accounts } = await admin
        .from('social_accounts')
        .select('id, platform')
        .eq('brand_id', brandId)
        .eq('status', 'active')
        .in('id', ids)
      if ((accounts?.length ?? 0) !== ids.length) {
        throw new ApiError('VALIDATION', 'Neki od izabranih naloga ne pripadaju brendu ili nisu aktivni.')
      }
      // pravila Pinterest-a: svaki pin bira korisnik, pa Pinterest ne može na nivo 3 (D-085)
      if ((accounts ?? []).some((a) => a.platform === 'pinterest')) {
        throw new ApiError(
          'VALIDATION',
          'Pinterest ne dozvoljava objave bez izbora korisnika, pa ne može na nivo 3 Autopilota.',
          {
            fields: { level3AccountIds: ['pinterest'] },
          },
        )
      }
      update.autopilot_level3_confirmed_at = new Date().toISOString()
      nextSettings.level3AccountIds = ids
      nextSettings.level3ConfirmedBy = viewer.user.id
    }
  } else if (brand.autopilot_level === 3 || input.level !== undefined) {
    update.autopilot_level3_confirmed_at = null
    nextSettings.level3AccountIds = []
    nextSettings.level3ConfirmedBy = null
  }
  if (input.level !== undefined) update.autopilot_level = input.level
  update.settings = {
    ...((brand.settings as Record<string, Json>) ?? {}),
    autopilot: nextSettings as unknown as Json,
  } as unknown as NonNullable<Json>

  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('brands').update(update).eq('id', brandId)
  if (error) throw mapDbError(error)
  logger.info('autopilot_updated', {
    brandId,
    by: viewer.user.id,
    level: update.autopilot_level ?? brand.autopilot_level,
    budget: update.autopilot_token_budget,
  })
  return getAutopilot(viewer, brandId)
}

export interface PauseResult {
  paused: number
  resumed: number
  expired: number
}

/** „Pauziraj sve” (brif 9.3): brend `paused`, sve zakazane objave pauzirane, run-ovi otkazani. */
export async function pauseAll(viewer: Viewer, brandId: string): Promise<PauseResult> {
  const viewerBrand = await getBrand(viewer, brandId)
  await requireMembership(viewer, viewerBrand.workspace_id, EDIT_ROLES)
  const brand = await loadBrandAdmin(brandId)
  const admin = createSupabaseAdminClient()
  const { data: posts } = await admin
    .from('posts')
    .select('id')
    .eq('brand_id', brandId)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
  const pausedIds: string[] = []
  for (const p of posts ?? []) {
    const { data: targets } = await admin
      .from('post_targets')
      .select('id')
      .eq('post_id', p.id)
      .eq('status', 'scheduled')
    for (const t of targets ?? []) {
      await enqueueTargetUnscheduled(t.id)
      await admin.from('post_targets').update({ status: 'paused' }).eq('id', t.id).eq('status', 'scheduled')
    }
    try {
      await systemTransition(p.id, 'paused', 'Pauziraj sve')
      pausedIds.push(p.id)
    } catch (error) {
      logger.warn('pause_all_post_failed', { postId: p.id, error })
    }
  }
  const settings = autopilotSettings(brand)
  const { error } = await admin
    .from('brands')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      paused_by: viewer.user.id,
      settings: {
        ...((brand.settings as Record<string, Json>) ?? {}),
        autopilot: {
          ...settings,
          pausedPostIds: [...new Set([...(settings.pausedPostIds ?? []), ...pausedIds])],
        } as unknown as Json,
      } as unknown as NonNullable<Json>,
    })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
  logger.warn('brand_paused_all', { brandId, by: viewer.user.id, posts: pausedIds.length })
  return { paused: pausedIds.length, resumed: 0, expired: 0 }
}

/** Nastavak: brend aktivan; objave pauzirane kroz „Pauziraj sve” vraćaju se u red ako termin nije prošao. */
export async function resumeAll(viewer: Viewer, brandId: string): Promise<PauseResult> {
  const viewerBrand = await getBrand(viewer, brandId)
  await requireMembership(viewer, viewerBrand.workspace_id, ADMIN_ROLES)
  const brand = await loadBrandAdmin(brandId)
  const settings = autopilotSettings(brand)
  const admin = createSupabaseAdminClient()
  let resumed = 0
  let expired = 0
  const ids = settings.pausedPostIds ?? []
  if (ids.length) {
    const { data: posts } = await admin
      .from('posts')
      .select('id, scheduled_for, status')
      .in('id', ids)
      .eq('status', 'paused')
      .is('deleted_at', null)
    for (const p of posts ?? []) {
      if (!p.scheduled_for || !validateScheduleTime(new Date(p.scheduled_for)).ok) {
        expired += 1
        continue
      }
      try {
        const version = await systemTransition(p.id, 'scheduled', 'nastavak posle „Pauziraj sve”')
        const { data: targets } = await admin
          .from('post_targets')
          .select('id, scheduled_at, social_account_id')
          .eq('post_id', p.id)
          .eq('status', 'paused')
        for (const t of targets ?? []) {
          await admin.from('post_targets').update({ status: 'scheduled' }).eq('id', t.id)
          await enqueueTargetScheduled(t.id, t.scheduled_at ?? p.scheduled_for, version, t.social_account_id)
        }
        resumed += 1
      } catch (error) {
        logger.warn('resume_all_post_failed', { postId: p.id, error })
      }
    }
  }
  const { error } = await admin
    .from('brands')
    .update({
      status: 'active',
      paused_at: null,
      paused_by: null,
      settings: {
        ...((brand.settings as Record<string, Json>) ?? {}),
        autopilot: { ...settings, pausedPostIds: [] } as unknown as Json,
      } as unknown as NonNullable<Json>,
    })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
  logger.info('brand_resumed_all', { brandId, by: viewer.user.id, resumed, expired })
  return { paused: 0, resumed, expired }
}
