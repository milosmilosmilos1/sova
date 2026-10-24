import 'server-only'

import {
  activeModels,
  clearModelCache,
  envModelDefaults,
  MODEL_SLOTS,
  SLOT_KIND,
  type ModelSlot,
} from '@/lib/ai/models'
import { ApiError } from '@/lib/api/errors'
import { clearFlagCache } from '@/lib/flags'
import { clearMaintenanceCache, getMaintenance, type MaintenanceState } from '@/lib/maintenance'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { clearSettingsCache, getTokenPrices, tokenActionSchema, type TokenAction } from '@/lib/tokens/prices'
import { logAdminAction, type AdminContext } from '@/services/admin/audit'
import type { Json } from '@/types/database'

/**
 * Platforma u admin panelu (brif 16): feature flagovi (po mreži i funkciji), cene tokena, aktivni
 * modeli iz dozvoljene liste (D-072) i banner za održavanje. Svaka izmena ide u audit log i briše keš.
 */
export interface FlagView {
  key: string
  enabled: boolean
  description: string | null
  updatedAt: string
  updatedByEmail: string | null
}

export interface PlatformView {
  flags: FlagView[]
  tokenPrices: Record<TokenAction, number>
  allowedModels: Record<'text' | 'image' | 'embedding', string[]>
  activeModels: Record<ModelSlot, string>
  modelOverrides: Partial<Record<ModelSlot, string>>
  envModels: Record<ModelSlot, string>
  maintenance: MaintenanceState
}

async function readSetting(key: string): Promise<Record<string, unknown>> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('platform_settings').select('value').eq('key', key).maybeSingle()
  const v = data?.value
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

async function writeSetting(
  ctx: AdminContext,
  key: string,
  value: Record<string, unknown>,
  isPublic = false,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('platform_settings').upsert(
    {
      key,
      value: value as unknown as NonNullable<Json>,
      is_public: isPublic,
      updated_by: ctx.adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) throw mapDbError(error)
}

export async function getPlatform(): Promise<PlatformView> {
  const admin = createSupabaseAdminClient()
  const { data: flags } = await admin.from('feature_flags').select('*').order('key')
  const updaters = [...new Set((flags ?? []).map((f) => f.updated_by).filter((x): x is string => Boolean(x)))]
  const emails = new Map<string, string>()
  if (updaters.length) {
    const { data } = await admin.from('profiles').select('id, email').in('id', updaters)
    for (const p of data ?? []) emails.set(p.id, p.email)
  }
  clearModelCache()
  const [prices, allowed, overrides, models, maintenance] = await Promise.all([
    getTokenPrices(),
    readSetting('allowed_models'),
    readSetting('active_models'),
    activeModels(),
    getMaintenance(),
  ])
  const list = (k: string) =>
    Array.isArray(allowed[k])
      ? (allowed[k] as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
  return {
    flags: (flags ?? []).map((f) => ({
      key: f.key,
      enabled: f.enabled,
      description: f.description,
      updatedAt: f.updated_at,
      updatedByEmail: f.updated_by ? (emails.get(f.updated_by) ?? null) : null,
    })),
    tokenPrices: prices,
    allowedModels: { text: list('text'), image: list('image'), embedding: list('embedding') },
    activeModels: models,
    modelOverrides: Object.fromEntries(
      Object.entries(overrides).filter(
        ([k, v]) => (MODEL_SLOTS as string[]).includes(k) && typeof v === 'string' && v,
      ),
    ) as Partial<Record<ModelSlot, string>>,
    envModels: envModelDefaults(),
    maintenance,
  }
}

export async function setFlag(ctx: AdminContext, key: string, enabled: boolean): Promise<FlagView> {
  const admin = createSupabaseAdminClient()
  const { data: before } = await admin.from('feature_flags').select('*').eq('key', key).maybeSingle()
  if (!before) throw new ApiError('NOT_FOUND', 'Flag ne postoji.')
  const { data, error } = await admin
    .from('feature_flags')
    .update({ enabled, updated_by: ctx.adminId, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select('*')
    .single()
  if (error || !data) throw mapDbError(error)
  clearFlagCache()
  await logAdminAction(ctx, {
    action: 'flag.update',
    targetType: 'feature_flag',
    targetId: key,
    before: { enabled: before.enabled },
    after: { enabled },
  })
  return {
    key: data.key,
    enabled: data.enabled,
    description: data.description,
    updatedAt: data.updated_at,
    updatedByEmail: ctx.adminEmail,
  }
}

export async function updateTokenPrices(
  ctx: AdminContext,
  prices: Record<string, number>,
): Promise<Record<TokenAction, number>> {
  const keys = tokenActionSchema.options as readonly string[]
  for (const [k, v] of Object.entries(prices)) {
    if (!keys.includes(k)) throw new ApiError('VALIDATION', `Nepoznata akcija: ${k}.`)
    if (!Number.isInteger(v) || v < 0 || v > 1000)
      throw new ApiError('VALIDATION', `Cena za ${k} mora biti ceo broj od 0 do 1000.`)
  }
  const before = await readSetting('token_prices')
  const next = { ...before, ...prices }
  await writeSetting(ctx, 'token_prices', next, true)
  clearSettingsCache()
  await logAdminAction(ctx, {
    action: 'settings.token_prices',
    targetType: 'platform_setting',
    targetId: 'token_prices',
    before,
    after: next,
  })
  return getTokenPrices()
}

export async function updateActiveModels(
  ctx: AdminContext,
  models: Partial<Record<ModelSlot, string | null>>,
): Promise<Record<ModelSlot, string>> {
  const allowed = await readSetting('allowed_models')
  const before = await readSetting('active_models')
  const next: Record<string, unknown> = { ...before }
  for (const [slot, model] of Object.entries(models) as Array<[ModelSlot, string | null | undefined]>) {
    if (!(MODEL_SLOTS as string[]).includes(slot))
      throw new ApiError('VALIDATION', `Nepoznato mesto modela: ${slot}.`)
    if (!model) {
      delete next[slot]
      continue
    }
    const list = allowed[SLOT_KIND[slot]]
    if (!Array.isArray(list) || !list.includes(model)) {
      throw new ApiError('VALIDATION', `Model ${model} nije na dozvoljenoj listi za ${SLOT_KIND[slot]}.`)
    }
    next[slot] = model
  }
  await writeSetting(ctx, 'active_models', next)
  clearModelCache()
  await logAdminAction(ctx, {
    action: 'settings.active_models',
    targetType: 'platform_setting',
    targetId: 'active_models',
    before,
    after: next,
  })
  return activeModels()
}

export async function updateMaintenance(
  ctx: AdminContext,
  input: MaintenanceState,
): Promise<MaintenanceState> {
  const before = await readSetting('maintenance')
  const next = { enabled: input.enabled, message: input.message.trim().slice(0, 300) }
  await writeSetting(ctx, 'maintenance', next, true)
  clearMaintenanceCache()
  await logAdminAction(ctx, {
    action: 'settings.maintenance',
    targetType: 'platform_setting',
    targetId: 'maintenance',
    before,
    after: next,
  })
  return next
}
