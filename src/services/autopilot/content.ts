import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { mediaNeed, type PostFormat } from '@/config/post-formats'
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
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'
import { runVisualTemplate } from '@/services/visuals/template'
import { pickUnsplashPhotos } from '@/services/visuals/unsplash'
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
  /** uvod, tekst i poziv na akciju odvojeno: od njih se prave slajdovi u temi brenda (D-125) */
  parts: { hook: string; body: string; cta: string }
  firstComment: string | null
  altText: string
  generationId: string
  tokens: number
  /** pojmovi na engleskom za pretragu fotografija i snimaka (D-107) */
  visualQuery: string | null
}

/** Kontekst brenda; `locale` je jezik iz podešavanja Autopilota (D-107), inače jezik brenda. */
export async function brandContextFor(
  brand: BrandRow,
  topic: string,
  locale?: string,
): Promise<BrandContext> {
  return buildBrandContext(brand, topic, locale)
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
    /** vrsta objave koju je Autopilot izabrao (D-107) */
    format?: PostFormat
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
            format: input.format ?? null,
            allowedFormats: input.format ? [input.format] : undefined,
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
      parts: { hook: v.hook.trim(), body: v.body.trim(), cta: v.cta.trim() },
      body,
      hashtags,
      firstComment: v.first_comment?.trim() || null,
      altText: v.alt_text,
      generationId,
      tokens: price,
      visualQuery: parsed.data.visual_query?.trim() || null,
    }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

/**
 * Vizual iz šablona (boje, fontovi i logo brenda) kao JPEG; vraća media asset. Bez fotografije za
 * Autopilot (D-068), sa već izabranom Unsplash fotografijom za „Novu objavu” (bez rangiranja, D-107).
 */
export async function generateTemplateVisual(
  brand: BrandRow,
  input: {
    headline: string
    subtext: string | null
    cta: string | null
    postId: string | null
    runId: string | null
    /** korisnik iz Studija; Autopilot radi bez korisnika */
    userId?: string | null
    aspectRatio?: '1:1' | '9:16'
    photoId?: string | null
  },
): Promise<{ assetId: string; tokens: number } | null> {
  const price = await getTokenPrice('visual_template')
  const { generationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: input.userId ?? null,
    type: 'visual_template',
    tokens: price,
    input: {
      autopilot: !input.userId,
      runId: input.runId,
      postId: input.postId,
      brandId: brand.id,
      brandName: brand.name,
      headline: input.headline.slice(0, 120),
      subtext: input.subtext ? input.subtext.slice(0, 200) : undefined,
      cta: input.cta ? input.cta.slice(0, 40) : undefined,
      aspectRatio: input.aspectRatio ?? '1:1',
      template: 'auto',
      image: input.photoId ? { kind: 'unsplash', photoId: input.photoId } : { kind: 'none' },
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

export interface DraftMedia {
  assetIds: string[]
  tokens: number
  /** vrsta posle rezerve: bez snimka video postaje slika, karusel sa jednom fotografijom slika */
  format: PostFormat
  note: string | null
}

/**
 * Vizual nacrta po vrsti (D-107): video sa Pexels-a, fotografije sa Unsplash-a pa Pexels-a, bez
 * Gemini-ja i bez tokena. Kad izvori nemaju rezultat ili nisu podešeni, rezerva je vizual iz šablona
 * (2 tokena), kao ranije (D-068); `required` znači da mreža bez vizuala ne prima objavu.
 */
export async function draftMedia(
  brand: BrandRow,
  input: {
    format: PostFormat
    required: boolean
    query: string
    headline: string
    cta: string | null
    postId: string
    runId: string
  },
): Promise<DraftMedia> {
  const need = mediaNeed(input.format)
  if (need.kind === 'none' && !input.required)
    return { assetIds: [], tokens: 0, format: input.format, note: null }
  const ctx = { workspaceId: brand.workspace_id, brandId: brand.id, uploadedBy: null }
  let format = input.format
  let note: string | null = null
  try {
    if (need.kind === 'video') {
      const video = await pickPexelsVideo({ ...ctx, query: input.query, orientation: 'portrait' })
      if (video) return { assetIds: [video.asset.id], tokens: 0, format, note: null }
      format = 'image'
      note = 'Video nije nađen, pa je objava sa fotografijom.'
    }
    const crop = format === 'story' ? 'portrait' : 'square'
    const count = format === 'carousel' ? 3 : 1
    // Unsplash koliko limit prima (D-122), ostatak Pexels; pad Unsplash-a ne preskače Pexels
    let photos: string[] = []
    try {
      photos = (await pickUnsplashPhotos({ ...ctx, query: input.query, count, crop })).map((p) => p.asset.id)
    } catch (error) {
      logger.warn('autopilot_unsplash_failed', { postId: input.postId, error })
    }
    if (photos.length < count)
      photos = [
        ...photos,
        ...(await pickPexelsPhotos({ ...ctx, query: input.query, count: count - photos.length, crop })).map(
          (p) => p.asset.id,
        ),
      ]
    if (photos.length) {
      if (format === 'carousel' && photos.length < 2) format = 'image'
      return {
        assetIds: photos,
        tokens: 0,
        format: format === 'text' || format === 'link' ? 'image' : format,
        note,
      }
    }
  } catch (error) {
    logger.warn('autopilot_stock_media_failed', { postId: input.postId, error })
  }
  const visual = await generateTemplateVisual(brand, {
    headline: input.headline,
    subtext: null,
    cta: input.cta,
    postId: input.postId,
    runId: input.runId,
    aspectRatio: format === 'story' ? '9:16' : '1:1',
  })
  if (!visual) return { assetIds: [], tokens: 0, format, note }
  return {
    assetIds: [visual.assetId],
    tokens: visual.tokens,
    format: format === 'story' ? 'story' : 'image',
    note: note ?? (input.format === 'image' || input.format === 'story' ? null : 'Vizual je iz šablona.'),
  }
}

/** Naslov za vizual iz teme: prva rečenica hook-a, najviše 80 znakova. */
export function headlineFrom(body: string, fallback: string): string {
  const first = body.split(/\n|(?<=[.!?])\s/)[0]?.trim() ?? ''
  const pick = first.length >= 8 ? first : fallback
  return pick.length > 80 ? `${pick.slice(0, 77).trimEnd()}…` : pick
}
