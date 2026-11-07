import 'server-only'

import { z } from 'zod'

import { swrCache, type SwrCache } from '@/lib/cache/swr'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** Akcije koje troše Sova tokene (brif 15.2, X sa linkom 6 po D-013). */
export const tokenActionSchema = z.enum([
  'text',
  'rewrite',
  'translate',
  'hashtags',
  'repurpose',
  'variants',
  'visual_template',
  'canva_design',
  'canva_export',
  'image_standard',
  'image_premium',
  'strategy',
  'insights',
  'brand_analyze_first',
  'brand_analyze_again',
  'x_post',
  'x_post_with_link',
  'other_post',
  'photo_describe',
  'studio_chat',
  'inbox_reply',
  'month_plan',
  'profile_bios',
  'profile_highlights',
  'profile_extras',
])
export type TokenAction = z.infer<typeof tokenActionSchema>

export const DEFAULT_TOKEN_PRICES: Record<TokenAction, number> = {
  text: 2,
  rewrite: 1,
  translate: 1,
  hashtags: 1,
  repurpose: 2,
  variants: 1,
  visual_template: 2,
  canva_design: 2,
  canva_export: 2,
  image_standard: 8,
  image_premium: 15,
  strategy: 20,
  insights: 0,
  brand_analyze_first: 0,
  brand_analyze_again: 10,
  x_post: 1,
  x_post_with_link: 6,
  other_post: 0,
  /** opis fotografije iz galerije (D-114) */
  photo_describe: 1,
  /** poruka u Studiju (D-116); poruka koja pravi objavu se ne plaća, plaća se tekst objave */
  studio_chat: 1,
  /** predlog odgovora na komentar, poruku ili recenziju (D-117) */
  inbox_reply: 1,
  /** mesečni plan: teme za sve termine meseca (D-119); svaka objava posle se plaća kao tekst */
  month_plan: 3,
  /** opisi profila za svih osam mreža u jednom pozivu (D-143) */
  profile_bios: 3,
  /** Instagram highlights: naslovi, ikonice i kadrovi priča (D-144); naslovne i priče se crtaju bez tokena */
  profile_highlights: 3,
  /** dodaci za profile po mreži: Pinterest table, YouTube, Google usluge, pitanja, prikačene objave (D-146) */
  profile_extras: 3,
}

export interface ModelPrice {
  input_per_m: number
  output_per_m: number
  per_image_1k?: number
  per_image_2k?: number
  per_image_4k?: number
}

/** Cene provajdera (USD) iz ai.google.dev/gemini-api/docs/pricing, 23.10.2026; admin ih menja u platform_settings. */
export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  'gemini-3.8-flash': { input_per_m: 0.75, output_per_m: 3.75 },
  'gemini-3.6-flash': { input_per_m: 0.75, output_per_m: 3.75 },
  'gemini-3.5-flash-lite': { input_per_m: 0.3, output_per_m: 2.5 },
  'gemini-3.1-flash-lite': { input_per_m: 0.25, output_per_m: 1.5 },
  'gemini-3.1-flash-image': {
    input_per_m: 0.5,
    output_per_m: 3,
    per_image_1k: 0.067,
    per_image_2k: 0.101,
    per_image_4k: 0.151,
  },
  'gemini-3.1-flash-lite-image': { input_per_m: 0.25, output_per_m: 1.5, per_image_1k: 0.0336 },
  'gemini-3-pro-image': {
    input_per_m: 2,
    output_per_m: 12,
    per_image_1k: 0.134,
    per_image_2k: 0.134,
    per_image_4k: 0.24,
  },
  'gemini-nano-banana-2.1': {
    input_per_m: 1.5,
    output_per_m: 7.5,
    per_image_1k: 0.0336,
    per_image_2k: 0.0504,
    per_image_4k: 0.113,
  },
  'gemini-embedding-2': { input_per_m: 0.2, output_per_m: 0 },
}

/**
 * Podešavanja platforme (cene, kursevi, modeli): 60 s iz keša, a posle toga poslednja vrednost dok se
 * nova čita u pozadini, najviše 10 min staro (D-164). Admin posle izmene briše keš svoje instance.
 */
const settings = new Map<string, SwrCache<unknown>>()

function readSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  let cached = settings.get(key) as SwrCache<T> | undefined
  if (!cached) {
    cached = swrCache<T>(
      async () => {
        const { data, error } = await createSupabaseAdminClient()
          .from('platform_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle()
        if (error) throw error
        const parsed = schema.safeParse(data?.value)
        return parsed.success ? parsed.data : fallback
      },
      {
        freshMs: 60_000,
        maxStaleMs: 10 * 60_000,
        fallback: () => fallback,
        errorTtlMs: 10_000,
        onError: (error) => logger.warn('platform_setting_load_failed', { key, error }),
      },
    )
    settings.set(key, cached as SwrCache<unknown>)
  }
  return cached.get()
}

export function clearSettingsCache(): void {
  for (const cached of settings.values()) cached.clear()
}

export async function getTokenPrices(): Promise<Record<TokenAction, number>> {
  const partial = await readSetting('token_prices', z.record(z.string(), z.number().int().min(0)), {})
  return { ...DEFAULT_TOKEN_PRICES, ...(partial as Partial<Record<TokenAction, number>>) }
}

export async function getTokenPrice(action: TokenAction): Promise<number> {
  const prices = await getTokenPrices()
  return prices[action]
}

export async function getModelPrices(): Promise<Record<string, ModelPrice>> {
  const partial = await readSetting(
    'model_prices',
    z.record(
      z.string(),
      z.object({
        input_per_m: z.number().min(0),
        output_per_m: z.number().min(0),
        per_image_1k: z.number().min(0).optional(),
        per_image_2k: z.number().min(0).optional(),
        per_image_4k: z.number().min(0).optional(),
      }),
    ),
    {},
  )
  return { ...DEFAULT_MODEL_PRICES, ...partial }
}

/**
 * Koliko USD vredi jedinica valute; admin statistika preračunava cene planova (EUR) u USD jer je trošak
 * AI-ja u USD (D-099). ECB referentni kurs 23.10.2026; admin ga menja u `platform_settings.fx_usd_rates`.
 */
export const DEFAULT_USD_RATES: Record<string, number> = { USD: 1, EUR: 1.1193 }

export async function getUsdRates(): Promise<Record<string, number>> {
  const partial = await readSetting('fx_usd_rates', z.record(z.string(), z.number().positive()), {})
  return { ...DEFAULT_USD_RATES, ...partial, USD: 1 }
}

export async function getRateLimitSettings(): Promise<{
  generate_per_minute: number
  generate_per_day_free: number
}> {
  return readSetting(
    'rate_limits',
    z
      .object({
        generate_per_minute: z.number().int().min(1),
        generate_per_day_free: z.number().int().min(1),
      })
      .loose(),
    { generate_per_minute: 10, generate_per_day_free: 100 },
  )
}
