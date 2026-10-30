import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildCarouselPrompt,
  buildCarouselSystemPrompt,
  carouselJsonSchema,
  carouselOutputSchema,
  normalizeSlides,
  type CarouselOutput,
  type DesignedFormat,
} from '@/lib/ai/prompts/carousel'
import type { BrandContext } from '@/lib/ai/prompts/post-text'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import type { Slide } from '@/lib/visuals/design/types'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import type { Json } from '@/types/database'

/**
 * Tekst dizajnirane objave (D-108): jedan poziv Gemini-ja vraća slajdove, opis, heštegove i pojmove
 * za fotografije. Naplata kao tekst objave (2 tokena), rezervacija pre poziva i potvrda posle uspeha.
 * `userId` je null kad tekst pravi tok automatizacije ili Autopilot.
 */
export interface DesignedCopy {
  slides: Slide[]
  caption: string
  shortCaption: string
  hashtags: string[]
  firstComment: string | null
  visualQuery: string | null
  altText: string
  generationId: string
  tokens: number
  model: string
}

export async function generateDesignedCopy(input: {
  workspaceId: string
  brandId: string
  userId: string | null
  context: BrandContext
  topic: string
  cta: string | null
  format: DesignedFormat
  slides: number
  platforms: SocialPlatform[]
  includeHashtags?: boolean
  publishDate?: string | null
  dmCta?: boolean
  requestId?: string
  idempotencyKey?: string | null
  /** oznaka u ai_generations.input (tok, Autopilot, Studio) */
  origin: Record<string, Json>
}): Promise<DesignedCopy> {
  const price = await getTokenPrice('text')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    userId: input.userId,
    type: 'text',
    tokens: price,
    input: {
      ...input.origin,
      designed: true,
      format: input.format,
      slides: input.slides,
      platforms: input.platforms,
      topic: input.topic.slice(0, 2000),
      cta: input.cta,
    },
    requestId: input.requestId,
    idempotencyKey: input.idempotencyKey ?? null,
  })
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildCarouselSystemPrompt(),
          prompt: buildCarouselPrompt({
            brand: input.context,
            topic: input.topic,
            cta: input.cta,
            format: input.format,
            slides: input.slides,
            platforms: input.platforms,
            includeHashtags: input.includeHashtags ?? true,
            publishDate: input.publishDate ?? null,
            dmCta: input.dmCta,
          }),
          jsonSchema: carouselJsonSchema(),
          maxOutputTokens: 4096,
          temperature: 0.8,
          thinking: 'low',
        }),
      { label: 'designed-copy' },
    )
    const parsed = carouselOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success || !parsed.data.slides.length) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    }
    const output: CarouselOutput = {
      ...parsed.data,
      slides: normalizeSlides(parsed.data.slides, input.slides, input.format),
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
        output: output as unknown as NonNullable<Json>,
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
    const hashtags = output.hashtags
      .map((h) => h.trim())
      .filter(Boolean)
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .slice(0, 30)
    return {
      slides: output.slides.map((s) => ({
        kind: s.kind,
        kicker: s.kicker,
        title: s.title.trim(),
        body: s.body?.trim() || null,
        stat: s.stat?.trim() || null,
        items: s.items?.map((i) => i.trim()).filter(Boolean) ?? null,
      })),
      caption: output.caption.trim(),
      shortCaption: output.short_caption.trim(),
      hashtags,
      firstComment: output.first_comment?.trim() || null,
      visualQuery: output.visual_query?.trim() || null,
      altText: output.alt_text.trim(),
      generationId,
      tokens: price,
      model: outcome.model,
    }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

/** Opis objave za mrežu: opis i heštegovi; X dobija kratku verziju sa najviše dva heštega. */
export function captionFor(
  copy: Pick<DesignedCopy, 'caption' | 'shortCaption' | 'hashtags'>,
  platform: SocialPlatform,
): string {
  if (platform === 'x') {
    const tags = copy.hashtags.slice(0, 2).join(' ')
    const base = copy.shortCaption || copy.caption
    const text = tags ? `${base}\n\n${tags}` : base
    return text.length <= 280 ? text : base.slice(0, 277).trimEnd() + '…'
  }
  if (platform === 'google_business') return copy.caption
  return copy.hashtags.length ? `${copy.caption}\n\n${copy.hashtags.join(' ')}` : copy.caption
}
