import 'server-only'

import { z } from 'zod'

import { toContentLocale } from '@/config/locales'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildProfileBiosPrompt,
  buildProfileBiosSystemPrompt,
  normalizeProfileBios,
  profileBiosJsonSchema,
  profileBiosOutputSchema,
  type ProfileBios,
} from '@/lib/ai/prompts/profile-bios'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { toBrandContext } from '@/lib/brand/compose'
import { brandProfileSchema, type BrandProfile } from '@/lib/brand/profile-schema'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand } from '@/services/brands'
import type { Json } from '@/types/database'

/**
 * Profili na mrežama (D-143): opisi profila za svih osam mreža iz profila brenda, jednim pozivom
 * (3 tokena). Rezultat se čuva u `brands.settings.profileKit`, pa ostaje dok se ne napravi nov.
 */
const storedKitSchema = z.object({
  bios: profileBiosOutputSchema.optional(),
  biosAt: z.string().optional(),
})
type StoredKit = z.infer<typeof storedKitSchema>

export interface ProfileKitView {
  website: string | null
  bios: ProfileBios | null
  biosAt: string | null
  prices: { bios: number }
  /** brend ima profil (analiza sajta ili ručno popunjen Brain), bez njega opisi nemaju iz čega */
  hasProfile: boolean
  canEdit: boolean
}

function storedKit(settings: unknown): StoredKit {
  const raw = (settings as { profileKit?: unknown } | null)?.profileKit
  const parsed = storedKitSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : {}
}

export async function getProfileKit(viewer: Viewer, brandId: string): Promise<ProfileKitView> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id)
  const [row, price] = await Promise.all([getCurrentProfileRow(brand.id), getTokenPrice('profile_bios')])
  const kit = storedKit(brand.settings)
  return {
    website: brand.website_url,
    bios: kit.bios ?? null,
    biosAt: kit.biosAt ?? null,
    prices: { bios: price },
    hasProfile: Boolean(row && brandProfileSchema.safeParse(row.data).success),
    canEdit: EDIT_ROLES.includes(membership.role),
  }
}

function profileLines(p: BrandProfile, lockedFields: readonly string[]): string[] {
  const c = toBrandContext(p, lockedFields)
  const city = [p.identity.location.value.city, p.identity.location.value.country].filter(Boolean).join(', ')
  return [
    c.description ? `Opis: ${c.description}` : null,
    p.identity.tagline.value ? `Slogan sa sajta: ${p.identity.tagline.value}` : null,
    p.identity.industry.value ? `Delatnost: ${p.identity.industry.value}` : null,
    city ? `Mesto: ${city}` : null,
    c.services.length ? `Usluge i proizvodi: ${c.services.slice(0, 15).join(', ')}` : null,
    c.audience ? `Publika: ${c.audience}` : null,
    c.tone ? `Ton: ${c.tone}` : null,
    c.keyTerms.length ? `Ključni pojmovi: ${c.keyTerms.slice(0, 12).join(', ')}` : null,
    c.facts.length ? `Činjenice: ${c.facts.slice(0, 10).join('; ')}` : null,
  ].filter((l): l is string => Boolean(l))
}

/** „Napravi opise”: jedan Gemini poziv za svih osam mreža; čuva se u podešavanjima brenda. */
export async function generateProfileBios(
  viewer: Viewer,
  brandId: string,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<{ kit: ProfileKitView; tokensCharged: number }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const row = await getCurrentProfileRow(brand.id)
  const parsedProfile = row ? brandProfileSchema.safeParse(row.data) : null
  if (!row || !parsedProfile?.success) {
    throw new ApiError(
      'VALIDATION',
      'Za opise profila treba profil brenda: analizirajte sajt ili popunite stranu Brain.',
    )
  }
  const profile = parsedProfile.data
  const context = toBrandContext(profile, row.locked_fields ?? [])
  await assertDailyQuota(brand.workspace_id)
  const price = await getTokenPrice('profile_bios')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'text',
    tokens: price,
    input: { profileBios: true, website: Boolean(brand.website_url) },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildProfileBiosSystemPrompt(),
          prompt: buildProfileBiosPrompt({
            brandName: context.name || brand.name,
            locale: toContentLocale(brand.content_locale),
            website: brand.website_url,
            emoji: context.emoji,
            address: context.address,
            profile: profileLines(profile, row.locked_fields ?? []),
          }),
          jsonSchema: profileBiosJsonSchema(),
          maxOutputTokens: 4096,
          temperature: 0.6,
          thinking: 'low',
          // Netlify seče zahtev na 30 s
          timeoutMs: 25_000,
        }),
      { label: 'profile-bios' },
    )
    const parsed = profileBiosOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    }
    const bios = normalizeProfileBios(parsed.data, brand.website_url)
    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: bios as unknown as NonNullable<Json>,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    // ostali ključevi podešavanja (Autopilot i drugo) ostaju kakvi jesu
    const { data: fresh } = await admin.from('brands').select('settings').eq('id', brand.id).single()
    const settings = (fresh?.settings as Record<string, Json> | null) ?? {}
    const kit: StoredKit = { ...storedKit(settings), bios, biosAt: new Date().toISOString() }
    const { error } = await admin
      .from('brands')
      .update({ settings: { ...settings, profileKit: kit as unknown as Json } })
      .eq('id', brand.id)
    if (error) throw mapDbError(error)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { kit: await getProfileKit(viewer, brand.id), tokensCharged: price }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}
