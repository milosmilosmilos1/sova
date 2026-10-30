import 'server-only'

import { toContentLocale } from '@/config/locales'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import type { BrandContext } from '@/lib/ai/prompts/post-text'
import {
  buildVoiceDraftPrompt,
  buildVoiceDraftSystemPrompt,
  normalizeVoiceDraft,
  voiceDraftJsonSchema,
  voiceDraftOutputSchema,
} from '@/lib/ai/prompts/voice'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { toBrandContext } from '@/lib/brand/compose'
import { brandProfileSchema, type BrandProfile } from '@/lib/brand/profile-schema'
import { parsePlaybook } from '@/lib/brand/playbook'
import { clip, parseVoice, voiceFromProfile } from '@/lib/brand/voice'
import { EMPTY_VOICE, isVoiceEmpty, type BrandVoice } from '@/lib/schemas/voice'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand } from '@/services/brands'
import type { Json } from '@/types/database'

/**
 * Glas brenda (D-112): `brands.voice`. Dok vlasnik ne sačuva svoj, ekran nudi predlog iz profila sa
 * sajta (besplatno), a „Predloži” piše predlog iz profila, PDF-a i ranijih objava (2 tokena).
 */
const DOC_CHARS = 12_000
const POSTS = 15

export interface VoiceView {
  voice: BrandVoice
  saved: boolean
  updatedAt: string | null
  /** prikazani glas je predlog iz profila sa sajta, još nije sačuvan */
  fromProfile: boolean
  sources: { profile: boolean; documents: number; posts: number }
  draftPrice: number
}

async function currentProfile(brandId: string): Promise<BrandProfile | null> {
  const row = await getCurrentProfileRow(brandId)
  if (!row) return null
  const parsed = brandProfileSchema.safeParse(row.data)
  return parsed.success ? parsed.data : null
}

async function sourceCounts(brandId: string): Promise<{ documents: number; posts: number }> {
  const admin = createSupabaseAdminClient()
  const [docs, posts] = await Promise.all([
    admin
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('status', 'ready')
      .is('deleted_at', null),
    admin
      .from('historical_posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .not('text_content', 'is', null),
  ])
  return { documents: docs.count ?? 0, posts: posts.count ?? 0 }
}

export async function getVoiceView(viewer: Viewer, brandId: string): Promise<VoiceView> {
  const brand = await getBrand(viewer, brandId)
  const saved = parseVoice(brand.voice)
  const [profile, counts, draftPrice] = await Promise.all([
    currentProfile(brand.id),
    sourceCounts(brand.id),
    getTokenPrice('text'),
  ])
  const stored = (brand.voice ?? {}) as { updated_at?: string }
  const suggested = !saved && profile ? voiceFromProfile(profile) : null
  return {
    voice: saved ?? suggested ?? EMPTY_VOICE,
    saved: Boolean(saved),
    updatedAt: saved ? (stored.updated_at ?? null) : null,
    fromProfile: Boolean(suggested && !isVoiceEmpty(suggested)),
    sources: { profile: Boolean(profile), ...counts },
    draftPrice,
  }
}

export async function saveVoice(viewer: Viewer, brandId: string, voice: BrandVoice): Promise<VoiceView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = { ...voice, updated_at: new Date().toISOString(), updated_by: viewer.user.id }
  // upis kroz service role posle provere uloge, kao dizajn i ostala podešavanja brenda
  const { error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ voice: stored as unknown as Json })
    .eq('id', brand.id)
  if (error) throw mapDbError(error)
  return getVoiceView(viewer, brand.id)
}

/**
 * Pamćenje brenda za prompt: glas bez tema (one pripadaju tokovima; null dok vlasnik ne sačuva svoj)
 * i playbook naučen iz rezultata (D-113). Jedan upit kad kolone nisu stigle uz brend.
 */
export async function brandMemoryForPrompt(brand: {
  id: string
  voice?: unknown
  playbook?: unknown
}): Promise<{ voice: BrandContext['voice']; playbook: BrandContext['playbook'] }> {
  let raw: { voice?: unknown; playbook?: unknown } = brand
  if (brand.voice === undefined || brand.playbook === undefined) {
    const { data } = await createSupabaseAdminClient()
      .from('brands')
      .select('voice, playbook')
      .eq('id', brand.id)
      .maybeSingle()
    raw = data ?? {}
  }
  const v = parseVoice(raw.voice)
  const p = parsePlaybook(raw.playbook)
  return {
    voice: v
      ? { offer: v.offer, audience: v.audience, tone: v.tone, usp: v.usp, avoid: v.avoid, cta: v.cta }
      : null,
    playbook: p ? { summary: p.summary, works: p.works, avoid: p.avoid } : null,
  }
}

function profileLines(p: BrandProfile): string[] {
  const c = toBrandContext(p)
  const city = [p.identity.location.value.city, p.identity.location.value.country].filter(Boolean).join(', ')
  return [
    c.description ? `Opis: ${c.description}` : null,
    p.identity.industry.value ? `Delatnost: ${p.identity.industry.value}` : null,
    city ? `Mesto: ${city}` : null,
    c.services.length ? `Usluge i proizvodi: ${c.services.slice(0, 15).join(', ')}` : null,
    c.audience ? `Publika: ${c.audience}` : null,
    p.audience.pain_points.value.length
      ? `Problemi kupaca: ${p.audience.pain_points.value.join('; ')}`
      : null,
    c.tone ? `Ton sa sajta: ${c.tone}` : null,
    c.facts.length ? `Činjenice: ${c.facts.slice(0, 12).join('; ')}` : null,
    p.contact.phone.value ? `Telefon: ${p.contact.phone.value}` : null,
    p.contact.email.value ? `Email: ${p.contact.email.value}` : null,
    p.content.blog_topics.value.length
      ? `Teme sa bloga: ${p.content.blog_topics.value.slice(0, 12).join(', ')}`
      : null,
  ].filter((l): l is string => Boolean(l))
}

async function documentExcerpts(brandId: string): Promise<string[]> {
  const { data } = await createSupabaseAdminClient()
    .from('knowledge_chunks')
    .select('content, source_id, chunk_index')
    .eq('brand_id', brandId)
    .eq('source_type', 'manual')
    .order('created_at', { ascending: true })
    .order('chunk_index', { ascending: true })
    .limit(40)
  const out: string[] = []
  let total = 0
  for (const row of data ?? []) {
    const text = row.content.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const piece = text.slice(0, Math.min(1500, DOC_CHARS - total))
    out.push(piece)
    total += piece.length
    if (total >= DOC_CHARS) break
  }
  return out
}

async function recentCaptions(brandId: string): Promise<string[]> {
  const { data } = await createSupabaseAdminClient()
    .from('historical_posts')
    .select('text_content')
    .eq('brand_id', brandId)
    .not('text_content', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(POSTS)
  return (data ?? []).map((r) => clip(r.text_content ?? '', 400)).filter((t) => t.length >= 20)
}

export interface VoiceDraftResult {
  draft: BrandVoice
  generationId: string
  tokensCharged: number
}

/** „Predloži glas”: jedan Gemini poziv iz svih izvora koje brend ima; 2 tokena, ništa se ne čuva. */
export async function draftVoice(
  viewer: Viewer,
  brandId: string,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<VoiceDraftResult> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const [profile, documents, posts] = await Promise.all([
    currentProfile(brand.id),
    documentExcerpts(brand.id),
    recentCaptions(brand.id),
  ])
  if (!profile && !documents.length && !posts.length) {
    throw new ApiError(
      'VALIDATION',
      'Za predlog treba bar jedan izvor: analiza sajta, PDF o brendu ili povezana mreža sa objavama.',
    )
  }
  await assertDailyQuota(brand.workspace_id)
  const price = await getTokenPrice('text')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'brand_profile',
    tokens: price,
    input: { voiceDraft: true, profile: Boolean(profile), documents: documents.length, posts: posts.length },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildVoiceDraftSystemPrompt(),
          prompt: buildVoiceDraftPrompt({
            brandName: brand.name,
            locale: toContentLocale(brand.content_locale),
            profile: profile ? profileLines(profile) : [],
            documents,
            posts,
          }),
          jsonSchema: voiceDraftJsonSchema(),
          maxOutputTokens: 2048,
          temperature: 0.5,
          thinking: 'low',
        }),
      { label: 'voice-draft' },
    )
    const parsed = voiceDraftOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    }
    const draft = normalizeVoiceDraft(parsed.data)
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
        output: draft as unknown as NonNullable<Json>,
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
    return { draft, generationId, tokensCharged: price }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}
