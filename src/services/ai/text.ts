import 'server-only'

import { validateText, type SocialPlatform } from '@/config/platforms'
import { formatsForPlatforms } from '@/config/post-formats'
import { toApiError } from '@/lib/ai/errors'
import { generateText, type ImageInput } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildPostTextPrompt,
  buildPostTextSystemPrompt,
  postTextJsonSchema,
  postTextOutputSchema,
  type BrandContext,
  type PostTextOutput,
} from '@/lib/ai/prompts/post-text'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { AiError } from '@/lib/ai/errors'
import type { TextRequestInput } from '@/lib/schemas/ai'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { wallClock } from '@/lib/zoned-time'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { searchKnowledge } from '@/services/brand-brain/embed'
import { getBrandContextForBrand } from '@/services/brand-brain/profile'
import { getBrand } from '@/services/brands'
import { downloadAsset, getAsset } from '@/services/media'

export interface PostTextResult {
  generationId: string
  model: string
  fallbackUsed: boolean
  tokensCharged: number
  output: PostTextOutput
  validation: Record<string, { ok: boolean; length: number; max: number; problems: string[] }>
}

/**
 * Brand kontekst: profil iz Brand Brain-a (faza 6) kad postoji, inače osnovni podaci iz `brands`.
 * Uz to RAG: do 5 odlomaka sa sajta relevantnih za temu (prazno bez indeksa ili ključa).
 */
export async function buildBrandContext(
  brand: { id: string; name: string; content_locale: string; settings: unknown },
  topic: string,
  override?: string,
): Promise<BrandContext> {
  const fromProfile = await getBrandContextForBrand(brand.id)
  const localeRaw = (override ?? fromProfile?.locale ?? brand.content_locale) as BrandContext['locale']
  const locale: BrandContext['locale'] = ['sr-Latn', 'sr-Cyrl', 'en'].includes(localeRaw)
    ? localeRaw
    : 'sr-Latn'
  let context: BrandContext
  if (fromProfile) {
    context = {
      name: fromProfile.name || brand.name,
      locale,
      address: fromProfile.address,
      emoji: fromProfile.emoji,
      forbiddenWords: fromProfile.forbiddenWords,
      tone: fromProfile.tone,
      description: fromProfile.description,
      facts: fromProfile.facts,
      services: fromProfile.services,
      audience: fromProfile.audience,
      keyTerms: fromProfile.keyTerms,
      samplePhrases: fromProfile.samplePhrases,
      hashtags: fromProfile.hashtags,
    }
  } else {
    const settings = (brand.settings ?? {}) as Record<string, unknown>
    context = {
      name: brand.name,
      locale,
      address: settings.address === 'ti' ? 'ti' : 'vi',
      emoji: settings.emoji === true,
      forbiddenWords: Array.isArray(settings.forbidden_words) ? (settings.forbidden_words as string[]) : [],
      tone: typeof settings.tone === 'string' ? settings.tone : null,
      description: typeof settings.description === 'string' ? settings.description : null,
      facts: Array.isArray(settings.facts) ? (settings.facts as string[]) : [],
    }
  }
  const hits = await searchKnowledge(brand.id, topic, 5)
  context.knowledge = hits.map((h) => h.content.slice(0, 700))
  return context
}

/**
 * „Tekst za objavu” (sa ili bez fotografije): sinhrono, 2 tokena.
 * Redosled iz brifa 14.1: pristup → kvota → rezervacija → AI → upis → potvrda.
 */
export async function generatePostText(
  viewer: Viewer,
  input: TextRequestInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<PostTextResult> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)

  let images: ImageInput[] | undefined
  let assetAlt: string | null = null
  if (input.mediaAssetId) {
    const asset = await getAsset(viewer, input.mediaAssetId)
    if (asset.kind !== 'image') throw new ApiError('VALIDATION', 'Za tekst možete priložiti samo sliku.')
    const bytes = await downloadAsset(asset)
    images = [{ data: bytes.toString('base64'), mimeType: asset.mime_type }]
    assetAlt = asset.alt_text
  }

  const brandContext = await buildBrandContext(brand, input.topic, input.locale)
  const price = await getTokenPrice('text')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'text',
    tokens: price,
    input: {
      platforms: input.platforms,
      topic: input.topic,
      goal: input.goal,
      cta: input.cta ?? null,
      includeHashtags: input.includeHashtags,
      variantsPerPlatform: input.variantsPerPlatform,
      mediaAssetId: input.mediaAssetId ?? null,
    },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })

  const prompt = buildPostTextPrompt({
    brand: brandContext,
    platforms: input.platforms,
    topic: input.topic,
    goal: input.goal,
    cta: input.cta ?? null,
    includeHashtags: input.includeHashtags,
    variantsPerPlatform: input.variantsPerPlatform,
    hasImage: Boolean(images),
    publishDate: wallClock(new Date().toISOString(), brand.timezone).date,
    format: input.format ?? null,
    allowedFormats: formatsForPlatforms(input.platforms),
  })

  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPostTextSystemPrompt(),
          prompt,
          images,
          jsonSchema: postTextJsonSchema(),
          maxOutputTokens: 4096,
          temperature: 0.8,
          thinking: 'low',
        }),
      { label: 'post-text' },
    )
    const parsed = postTextOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    }
    const output = parsed.data
    if (assetAlt) output.variants = output.variants.map((v) => ({ ...v, alt_text: v.alt_text || assetAlt }))

    const validation: PostTextResult['validation'] = {}
    for (const v of output.variants) {
      const r = validateText(v.platform as SocialPlatform, `${v.hook}\n\n${v.body}\n\n${v.cta}`, v.hashtags)
      validation[`${v.platform}:${Object.keys(validation).filter((k) => k.startsWith(v.platform)).length}`] =
        {
          ok: r.ok,
          length: r.length,
          max: r.max,
          problems: r.problems,
        }
    }

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
        output: { ...output, validation },
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)

    return {
      generationId,
      model: outcome.model,
      fallbackUsed: outcome.fallbackUsed,
      tokensCharged: price,
      output,
      validation,
    }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}
