import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildPostTextPrompt,
  buildPostTextSystemPrompt,
  postTextJsonSchema,
  postTextOutputSchema,
  type BrandContext,
  type PostGoal,
} from '@/lib/ai/prompts/post-text'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { runVisualTemplate } from '@/services/visuals/template'
import type { Database, Json } from '@/types/database'

/**
 * Sadržaj Autopilota (faza 10c): tekst objave i vizual iz šablona bez korisnika (`user_id = null`,
 * `input.autopilot = true` za obračun mesečnog budžeta). Tokeni se rezervišu i potvrđuju kao kod
 * ručnog generisanja, pa se Autopilot vidi u istoriji tokena workspace-a.
 */
type BrandRow = Database['public']['Tables']['brands']['Row']

export interface DraftText {
  text: string
  hashtags: string[]
  body: string
  firstComment: string | null
  altText: string
  generationId: string
  tokens: number
}

export async function brandContextFor(brand: BrandRow, topic: string): Promise<BrandContext> {
  return buildBrandContext(brand, topic, undefined)
}

export async function generateDraftText(
  brand: BrandRow,
  context: BrandContext,
  input: {
    platform: SocialPlatform
    topic: string
    goal: PostGoal
    cta: string | null
    postId: string
    runId: string
    /** planirani dan objave u zoni brenda */
    publishDate?: string
  },
): Promise<DraftText> {
  const price = await getTokenPrice('text')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: null,
    type: 'text',
    tokens: price,
    input: {
      autopilot: true,
      runId: input.runId,
      postId: input.postId,
      platforms: [input.platform],
      topic: input.topic.slice(0, 2000),
      goal: input.goal,
    },
  })
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPostTextSystemPrompt(),
          prompt: buildPostTextPrompt({
            brand: context,
            platforms: [input.platform],
            topic: input.topic,
            goal: input.goal,
            cta: input.cta,
            includeHashtags: true,
            variantsPerPlatform: 1,
            hasImage: false,
            publishDate: input.publishDate,
          }),
          jsonSchema: postTextJsonSchema(),
          maxOutputTokens: 2048,
          temperature: 0.8,
          thinking: 'low',
        }),
      { label: 'autopilot-text' },
    )
    const parsed = postTextOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success || !parsed.data.variants.length) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    }
    const v = parsed.data.variants.find((x) => x.platform === input.platform) ?? parsed.data.variants[0]!
    const body = [v.hook, v.body, v.cta]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n\n')
    const hashtags = v.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 30)
    const admin = createSupabaseAdminClient()
    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: parsed.data as unknown as NonNullable<Json>,
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
      text: hashtags.length ? `${body}\n\n${hashtags.join(' ')}` : body,
      body,
      hashtags,
      firstComment: v.first_comment?.trim() || null,
      altText: v.alt_text,
      generationId,
      tokens: price,
    }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

/** Vizual iz šablona (boje, fontovi i logo brenda, bez fotografije) kao JPEG 1:1; vraća media asset. */
export async function generateTemplateVisual(
  brand: BrandRow,
  input: { headline: string; subtext: string | null; cta: string | null; postId: string; runId: string },
): Promise<{ assetId: string; tokens: number } | null> {
  const price = await getTokenPrice('visual_template')
  const { generationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: null,
    type: 'visual_template',
    tokens: price,
    input: {
      autopilot: true,
      runId: input.runId,
      postId: input.postId,
      brandId: brand.id,
      brandName: brand.name,
      headline: input.headline.slice(0, 120),
      subtext: input.subtext ? input.subtext.slice(0, 200) : undefined,
      cta: input.cta ? input.cta.slice(0, 40) : undefined,
      aspectRatio: '1:1',
      template: 'auto',
      image: { kind: 'none' },
      format: 'jpeg',
    } as unknown as NonNullable<Json>,
    status: 'queued',
  })
  const r = await runVisualTemplate(generationId)
  if (r.status !== 'succeeded') return null
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('ai_generations')
    .select('output_asset_id')
    .eq('id', generationId)
    .maybeSingle()
  return data?.output_asset_id ? { assetId: data.output_asset_id, tokens: price } : null
}

/** Naslov za vizual iz teme: prva rečenica hook-a, najviše 80 znakova. */
export function headlineFrom(body: string, fallback: string): string {
  const first = body.split(/\n|(?<=[.!?])\s/)[0]?.trim() ?? ''
  const pick = first.length >= 8 ? first : fallback
  return pick.length > 80 ? `${pick.slice(0, 77).trimEnd()}…` : pick
}
