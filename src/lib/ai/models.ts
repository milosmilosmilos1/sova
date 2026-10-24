import 'server-only'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Aktivni modeli (D-072): podrazumevano iz env-a (brif 3), a admin ih menja bez deploya kroz
 * `platform_settings.active_models`, samo modelom iz `allowed_models` za tu vrstu. Keš 60 s.
 */
export type ModelSlot = 'text' | 'text_fallback' | 'image' | 'image_premium' | 'image_fallback' | 'embedding'
export type ModelKind = 'text' | 'image' | 'embedding'

export const MODEL_SLOTS: ModelSlot[] = [
  'text',
  'text_fallback',
  'image',
  'image_premium',
  'image_fallback',
  'embedding',
]
export const SLOT_KIND: Record<ModelSlot, ModelKind> = {
  text: 'text',
  text_fallback: 'text',
  image: 'image',
  image_premium: 'image',
  image_fallback: 'image',
  embedding: 'embedding',
}

export function envModelDefaults(): Record<ModelSlot, string> {
  return {
    text: env.GEMINI_TEXT_MODEL,
    text_fallback: env.GEMINI_TEXT_FALLBACK_MODEL,
    image: env.GEMINI_IMAGE_MODEL,
    image_premium: env.GEMINI_IMAGE_PREMIUM_MODEL,
    image_fallback: env.GEMINI_IMAGE_FALLBACK_MODEL,
    embedding: env.GEMINI_EMBEDDING_MODEL,
  }
}

/** Spaja env i admin izbor; model van dozvoljene liste se ignoriše (čista funkcija, testirana). */
export function mergeActiveModels(
  defaults: Record<ModelSlot, string>,
  active: Record<string, unknown>,
  allowed: Record<string, unknown>,
): { models: Record<ModelSlot, string>; rejected: Array<{ slot: ModelSlot; model: string }> } {
  const models = { ...defaults }
  const rejected: Array<{ slot: ModelSlot; model: string }> = []
  for (const slot of MODEL_SLOTS) {
    const v = active[slot]
    if (typeof v !== 'string' || !v) continue
    const list = allowed[SLOT_KIND[slot]]
    if (Array.isArray(list) && list.includes(v)) models[slot] = v
    else rejected.push({ slot, model: v })
  }
  return { models, rejected }
}

const TTL = 60_000
let cache: { value: Record<ModelSlot, string>; at: number } | null = null

export async function activeModels(): Promise<Record<ModelSlot, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.value
  const defaults = envModelDefaults()
  let value = defaults
  try {
    const { data } = await createSupabaseAdminClient()
      .from('platform_settings')
      .select('key, value')
      .in('key', ['active_models', 'allowed_models'])
    const pick = (key: string) => {
      const v = data?.find((r) => r.key === key)?.value
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    }
    const merged = mergeActiveModels(defaults, pick('active_models'), pick('allowed_models'))
    value = merged.models
    for (const r of merged.rejected) logger.warn('active_model_not_allowed', r)
  } catch (error) {
    logger.warn('active_models_load_failed', { error })
  }
  cache = { value, at: Date.now() }
  return value
}

export function clearModelCache(): void {
  cache = null
}

export async function textModelChain(): Promise<string[]> {
  const m = await activeModels()
  return unique([m.text, m.text_fallback])
}

export async function imageModelChain(quality: 'standard' | 'premium'): Promise<string[]> {
  const m = await activeModels()
  if (quality === 'premium') return unique([m.image_premium, m.image, m.image_fallback])
  return unique([m.image, m.image_fallback])
}

export async function embeddingModel(): Promise<string> {
  return (await activeModels()).embedding
}

function unique(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))]
}
