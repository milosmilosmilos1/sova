import 'server-only'

import { ONE_LANGUAGE, type ContentLocale } from '@/config/locales'
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
import { foreignSentences } from '@/lib/content-language'
import { logger } from '@/lib/logger'
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

/** Rečenice slajdova i opisa koje su jasno na drugom jeziku od jezika objave. */
export function mixedLanguage(output: CarouselOutput, locale: ContentLocale): string[] {
  const texts = [
    ...output.slides.flatMap((s) => [s.kicker, s.title, s.body, ...(s.items ?? [])]),
    output.caption,
    output.short_caption,
    output.first_comment,
  ].filter((t): t is string => Boolean(t))
  return [...new Set(texts.flatMap((t) => foreignSentences(t, locale)))]
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
  /** uputstvo i podaci za vrstu sadržaja (D-165) */
  kindLines?: string[]
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
    const chain = await textModelChain()
    const locale = input.context.locale
    const attempt = async (correction: string[]) => {
      const extra = [...(input.kindLines ?? []), ...correction]
      const outcome = await callWithFallback(
        chain,
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
              extra: extra.length ? extra : undefined,
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
      return { outcome, output, foreign: mixedLanguage(output, locale) }
    }
    const attempts = [await attempt([])]
    let best = attempts[0]!
    // jedan jezik u objavi (vlasnik, 21.11.2026): rečenice na drugom jeziku traže jednu ispravku, a
    // ostaje odgovor sa manje takvih rečenica (provera kvaliteta u Odobravanju javlja ostatak)
    if (best.foreign.length) {
      logger.warn('designed_copy_language_mixed', {
        brandId: input.brandId,
        foreign: best.foreign.slice(0, 3),
      })
      try {
        const quoted = best.foreign
          .slice(0, 3)
          .map((s) => `„${s.slice(0, 120)}”`)
          .join('; ')
        const retry = await attempt([
          `JEZIK: prethodni odgovor je imao rečenice na drugom jeziku: ${quoted}. ${ONE_LANGUAGE[locale]}`,
        ])
        attempts.push(retry)
        if (retry.foreign.length < best.foreign.length) best = retry
      } catch (error) {
        logger.warn('designed_copy_language_retry_failed', { brandId: input.brandId, error })
      }
    }
    const { outcome, output } = best
    const usage = attempts.reduce(
      (sum, a) => ({
        inputTokens: sum.inputTokens + a.outcome.result.usage.inputTokens,
        outputTokens: sum.outputTokens + a.outcome.result.usage.outputTokens,
        thoughtTokens: sum.thoughtTokens + a.outcome.result.usage.thoughtTokens,
      }),
      { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 },
    )
    const cost = (
      await Promise.all(
        attempts.map((a) =>
          costFor(a.outcome.model, {
            inputTokens: a.outcome.result.usage.inputTokens,
            outputTokens: a.outcome.result.usage.outputTokens,
            thoughtTokens: a.outcome.result.usage.thoughtTokens,
          }),
        ),
      )
    ).reduce((a, b) => a + b, 0)
    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: output as unknown as NonNullable<Json>,
        duration_ms: attempts.reduce((sum, a) => sum + a.outcome.result.durationMs, 0),
        provider_input_tokens: usage.inputTokens,
        provider_output_tokens: usage.outputTokens + usage.thoughtTokens,
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
