import 'server-only'

import { toContentLocale, type ContentLocale } from '@/config/locales'
import type { SocialPlatform } from '@/config/platforms'
import { PLATFORM_FORMATS, type PostFormat } from '@/config/post-formats'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import type { DesignedFormat } from '@/lib/ai/prompts/carousel'
import {
  buildMonthPlanPrompt,
  buildMonthPlanSystemPrompt,
  monthPlanJsonSchema,
  monthPlanOutputSchema,
  normalizeMonthPlan,
} from '@/lib/ai/prompts/month-plan'
import type { PostGoal } from '@/lib/ai/prompts/post-text'
import { parseVoice } from '@/lib/brand/voice'
import { logger } from '@/lib/logger'
import type { PlanSlot } from '@/lib/plans/slots'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import type { Slide } from '@/lib/visuals/design/types'
import { wallClock, zonedToUtc } from '@/lib/zoned-time'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { draftMedia, generateDraftText, headlineFrom } from '@/services/autopilot/content'
import { notifyRoles } from '@/services/autopilot/runner'
import type { BrandRow } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { captionFor, generateDesignedCopy } from '@/services/design/copy'
import type { PostDesignContext } from '@/services/design/post-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { systemSchedule, systemSubmitForReview } from '@/services/posts/system'
import type { Database, Json } from '@/types/database'

/**
 * Mesečni plan u pozadini (D-119). Prvo jedan poziv Gemini-ja bira temu za svaki termin (3 tokena),
 * a posle „Generiši sve” svaka stavka postaje gotov nacrt: karusel, slika i priča kao slajdovi u
 * stilu brenda, video sa Pexels-a uz tekst, tekst i link kao tekst (2 tokena po objavi). Nacrt ide
 * na odobravanje ili odmah u zakazivanje, sa terminom iz plana. Na kraju jedno obaveštenje.
 */
type PlanRow = Database['public']['Tables']['month_plans']['Row']
type ItemRow = Database['public']['Tables']['month_plan_items']['Row']

export interface PlanSettings {
  kind: 'current' | 'next'
  perWeek: number
  platforms: SocialPlatform[]
  formats: PostFormat[]
  locale: ContentLocale
  notes: string | null
  mode?: 'review' | 'schedule'
  slots?: PlanSlot[]
}

const DESIGNED: Partial<Record<PostFormat, DesignedFormat>> = {
  image: 'single',
  carousel: 'carousel',
  story: 'story',
}
const WEEKDAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota']
const MONTHS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
]

export function planSettings(row: Pick<PlanRow, 'settings'>): PlanSettings {
  return (row.settings ?? {}) as unknown as PlanSettings
}

async function loadPlan(planId: string): Promise<{ plan: PlanRow; brand: BrandRow } | null> {
  const admin = createSupabaseAdminClient()
  const { data: plan } = await admin.from('month_plans').select('*').eq('id', planId).maybeSingle()
  if (!plan) return null
  const { data: brand } = await admin.from('brands').select('*').eq('id', plan.brand_id).maybeSingle()
  return brand ? { plan, brand } : null
}

function monthLabel(month: string, start: string, end: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const name = `${MONTHS[m - 1]} ${y}.`
  return start.slice(8) === '01'
    ? name
    : `${name} (od ${Number(start.slice(8))}. do ${Number(end.slice(8))}.)`
}

async function addTokens(planId: string, tokens: number): Promise<void> {
  if (!tokens) return
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('month_plans').select('tokens_charged').eq('id', planId).single()
  await admin
    .from('month_plans')
    .update({ tokens_charged: (data?.tokens_charged ?? 0) + tokens, updated_at: new Date().toISOString() })
    .eq('id', planId)
}

async function failPlan(planId: string, message: string): Promise<'failed'> {
  await createSupabaseAdminClient()
    .from('month_plans')
    .update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', planId)
  return 'failed'
}

/** Teme za sve termine plana: jedan poziv Gemini-ja, stavke u bazu, plan spreman za pregled. */
export async function runPlanning(planId: string): Promise<'ready' | 'failed' | 'skipped'> {
  const loaded = await loadPlan(planId)
  if (!loaded || loaded.plan.status !== 'planning') return 'skipped'
  const { plan, brand } = loaded
  const settings = planSettings(plan)
  const slots = settings.slots ?? []
  if (!slots.length) return failPlan(planId, 'Plan nema termina.')
  const admin = createSupabaseAdminClient()
  const locale = toContentLocale(settings.locale ?? brand.content_locale)
  const label = monthLabel(plan.month, plan.period_start, plan.period_end)

  const [context, { data: pillars }, { data: recent }, { data: holidays }] = await Promise.all([
    buildBrandContext(brand, `plan objava za mesec ${label}`, locale),
    admin.from('content_pillars').select('name').eq('brand_id', brand.id).limit(8),
    admin
      .from('posts')
      .select('title')
      .eq('brand_id', brand.id)
      .is('deleted_at', null)
      .not('title', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('holidays')
      .select('date, name')
      .in('country', locale.startsWith('sr') ? ['RS', 'GLOBAL'] : ['GLOBAL'])
      .gte('date', plan.period_start)
      .lte('date', plan.period_end)
      .order('date'),
  ])
  const price = await getTokenPrice('month_plan')
  let generation: Awaited<ReturnType<typeof startGeneration>>
  try {
    generation = await startGeneration({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      userId: plan.created_by,
      type: 'month_plan',
      tokens: price,
      input: { planId, month: plan.month, slots: slots.length },
    })
  } catch (error) {
    return failPlan(planId, toApiError(error).message)
  }
  try {
    const prompt = buildMonthPlanPrompt({
      brand: context,
      locale,
      monthLabel: label,
      slots: slots.map((s) => ({
        date: s.date,
        weekday: WEEKDAYS[new Date(`${s.date}T12:00:00Z`).getUTCDay()]!,
        format: s.format,
        platforms: s.platforms,
      })),
      holidays: holidays ?? [],
      topics: parseVoice(brand.voice)?.topics ?? [],
      pillars: [...new Set((pillars ?? []).map((p) => p.name))],
      recent: [...new Set((recent ?? []).map((r) => r.title!).filter(Boolean))],
      notes: settings.notes,
      website: brand.website_url,
    })
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildMonthPlanSystemPrompt(),
          prompt,
          jsonSchema: monthPlanJsonSchema(),
          maxOutputTokens: 16_000,
          temperature: 0.8,
          thinking: 'low',
          timeoutMs: 120_000,
        }),
      { label: 'month-plan' },
    )
    const parsed = monthPlanOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success)
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    const topics = normalizeMonthPlan(parsed.data, slots.length)
    if (!topics.size)
      throw new AiError('INVALID_RESPONSE', 'Model nije predložio nijednu temu.', { model: outcome.model })
    const rows = slots.flatMap((s, i) => {
      const t = topics.get(i)
      if (!t) return []
      return [
        {
          plan_id: plan.id,
          brand_id: brand.id,
          position: i,
          scheduled_for: zonedToUtc(s.date, s.time, brand.timezone),
          format: s.format,
          platforms: s.platforms,
          topic: t.topic,
          brief: t.brief,
          goal: t.goal,
          pillar: t.pillar,
          cta: t.cta,
        },
      ]
    })
    const { error } = await admin.from('month_plan_items').insert(rows)
    if (error) throw error
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
        output: { items: rows.length } as unknown as NonNullable<Json>,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generation.generationId)
    if (generation.reservationId) await confirmReservation(generation.reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generation.generationId)
    await admin
      .from('month_plans')
      .update({ status: 'ready', error: null, tokens_charged: price, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
    return 'ready'
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generation.generationId, generation.reservationId, api.code, api.message)
    return failPlan(planId, api.message)
  }
}

/** Stavke koje „Generiši sve” obrađuje: još neurađene i one koje nisu uspele. */
export async function pendingItems(planId: string): Promise<string[]> {
  const { data } = await createSupabaseAdminClient()
    .from('month_plan_items')
    .select('id')
    .eq('plan_id', planId)
    .in('status', ['planned', 'failed', 'generating'])
    .order('scheduled_for')
  return (data ?? []).map((r) => r.id)
}

async function setItem(itemId: string, patch: Database['public']['Tables']['month_plan_items']['Update']) {
  await createSupabaseAdminClient()
    .from('month_plan_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', itemId)
}

/** X prima 280 znakova; duži tekst se skraćuje na kraju rečenice ili reči. */
function fitText(platform: SocialPlatform, text: string): string {
  if (platform !== 'x' || text.length <= 280) return text
  return `${text.slice(0, 277).trimEnd()}…`
}

/** Jedna stavka plana postaje nacrt (ili zakazana objava). */
export async function runPlanItem(itemId: string): Promise<'done' | 'failed' | 'skipped'> {
  const admin = createSupabaseAdminClient()
  const { data: item } = await admin.from('month_plan_items').select('*').eq('id', itemId).maybeSingle()
  if (!item || item.status === 'done' || item.post_id) return 'skipped'
  const loaded = await loadPlan(item.plan_id)
  if (!loaded || loaded.plan.status !== 'generating') return 'skipped'
  const { plan, brand } = loaded
  const settings = planSettings(plan)
  const format = item.format as PostFormat
  await setItem(item.id, { status: 'generating', error: null })

  let postId: string | null = null
  try {
    const { data: accountRows } = await admin
      .from('social_accounts')
      .select('id, platform')
      .eq('brand_id', brand.id)
      .eq('status', 'active')
      .in('platform', item.platforms as SocialPlatform[])
    const accounts = (accountRows ?? []).filter((a) =>
      PLATFORM_FORMATS[a.platform as SocialPlatform]?.includes(format),
    )
    if (!accounts.length)
      throw new Error('Nema povezanog naloga koji prima ovu vrstu objave. Povežite mrežu u Mrežama.')
    const platforms = [...new Set(accounts.map((a) => a.platform as SocialPlatform))]
    const locale = toContentLocale(settings.locale ?? brand.content_locale)
    const topic = item.brief ? `${item.topic}\n\n${item.brief}` : item.topic
    const publishDate = wallClock(item.scheduled_for, brand.timezone).date
    const context = await buildBrandContext(brand, topic.slice(0, 500), locale)

    let title = item.topic.slice(0, 200)
    let master = ''
    let firstComment: string | null = null
    let link: string | null = null
    let assetIds: string[] = []
    let design: PostDesignContext | null = null
    let texts: Partial<Record<SocialPlatform, string>> = {}
    let tokens = 0
    let story = format === 'story'

    const designed = DESIGNED[format]
    if (designed) {
      const look = await resolveDesign(brand)
      const slides = designed === 'carousel' ? look.slides : 1
      const copy = await generateDesignedCopy({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        userId: null,
        context,
        topic,
        cta: item.cta,
        format: designed,
        slides,
        platforms,
        includeHashtags: true,
        publishDate,
        origin: { plan: plan.id, item: item.id },
      })
      tokens += copy.tokens
      const rendered = await renderDesignSlides({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        design: look,
        styleId: look.styleId,
        format: story ? 'story' : look.size,
        slides: copy.slides as Slide[],
        photoSource: look.photoSource,
        query: (copy.visualQuery || item.topic).slice(0, 100),
        uploadedBy: null,
        topic: [item.topic, ...copy.slides.map((s) => s.title)].join(' '),
        origin: { planId: plan.id, itemId: item.id },
      })
      assetIds = rendered.assetIds
      title = (copy.slides[0]?.title ?? item.topic).slice(0, 200)
      master = captionFor(copy, 'instagram')
      firstComment = copy.firstComment
      texts = Object.fromEntries(platforms.map((p) => [p, captionFor(copy, p)]))
      design = {
        topic: topic.slice(0, 2000),
        cta: item.cta,
        format: designed as PostDesignContext['format'],
        styleId: look.styleId,
        slides: copy.slides.length,
        photoSource: look.photoSource,
        size: look.size,
        locale,
        platforms,
        copy: { slides: copy.slides as Slide[], photoAssetIds: rendered.photos.map((p) => p.id) },
      }
    } else {
      const main = platforms.includes('instagram')
        ? 'instagram'
        : platforms.includes('facebook')
          ? 'facebook'
          : platforms[0]!
      const text = await generateDraftText(brand, context, {
        platform: main,
        topic,
        goal: item.goal as PostGoal,
        cta: item.cta,
        postId: item.id,
        runId: plan.id,
        publishDate,
        format,
      })
      tokens += text.tokens
      master = text.text
      firstComment = text.firstComment
      texts = Object.fromEntries(platforms.map((p) => [p, fitText(p, text.text)]))
      if (format === 'link') link = brand.website_url
      if (format === 'video') {
        const media = await draftMedia(brand, {
          format: 'video',
          required: true,
          query: (text.visualQuery || item.topic).slice(0, 100),
          headline: headlineFrom(text.body, item.topic),
          cta: item.cta,
          postId: item.id,
          runId: plan.id,
        })
        tokens += media.tokens
        assetIds = media.assetIds
        story = false
      }
    }

    const { data: post, error } = await admin
      .from('posts')
      .insert({
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        title,
        master_text: master,
        first_comment: firstComment,
        link_url: link,
        status: 'draft',
        source: 'ai',
        language: locale,
        scheduled_for: item.scheduled_for,
        created_by: plan.created_by,
        design: design as unknown as Json,
      })
      .select('id')
      .single()
    if (error || !post) throw new Error(error?.message ?? 'Nacrt nije upisan.')
    postId = post.id
    const { error: targetsError } = await admin.from('post_targets').insert(
      accounts.map((a) => ({
        post_id: post.id,
        brand_id: brand.id,
        social_account_id: a.id,
        platform: a.platform,
        text_content: texts[a.platform as SocialPlatform] ?? master,
        options: (story ? { format: 'story' } : {}) as NonNullable<Json>,
      })),
    )
    if (targetsError) throw new Error(targetsError.message)
    if (assetIds.length) {
      const { error: mediaError } = await admin
        .from('post_media')
        .insert(
          assetIds.map((media_asset_id, sort_order) => ({ post_id: post.id, media_asset_id, sort_order })),
        )
      if (mediaError) throw new Error(mediaError.message)
    }
    await setItem(item.id, { status: 'done', post_id: post.id, error: null })
    await addTokens(plan.id, tokens)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('month_plan_item_failed', { itemId, message })
    // nacrt bez mreža ili medija ne ostaje u Objavama; sledeće „Generiši sve” pravi nov
    if (postId) await admin.from('posts').delete().eq('id', postId)
    await setItem(item.id, { status: 'failed', error: message.slice(0, 500) })
    return 'failed'
  }

  // Nacrt postoji i stavka je gotova; ako zakazivanje ili slanje na odobravanje ne uspe,
  // nacrt ostaje u Objavama (link sa stavke), a stavka se ne pravi ponovo.
  try {
    // zakazivanje bez odobravanja traži budući termin; prošao termin ide na odobravanje
    const future = Date.parse(item.scheduled_for) > Date.now() + 60_000
    if (settings.mode === 'schedule' && future)
      await systemSchedule(postId, 'Mesečni plan: zakazano bez odobravanja')
    else await systemSubmitForReview(postId, 'Mesečni plan: nacrt čeka odluku', { notify: false })
  } catch (error) {
    logger.warn('month_plan_item_submit_failed', { itemId, postId, error })
  }
  return 'done'
}

/** Kraj: plan je gotov kad nema neurađenih stavki; jedno obaveštenje umesto jednog po nacrtu. */
export async function finishPlan(planId: string): Promise<{ done: number; failed: number }> {
  const loaded = await loadPlan(planId)
  if (!loaded) return { done: 0, failed: 0 }
  const { plan, brand } = loaded
  const admin = createSupabaseAdminClient()
  // stavka prekinuta usred pravljenja (pad posla) ide u neuspele, da je sledeće „Generiši sve” ponovi
  await admin
    .from('month_plan_items')
    .update({ status: 'failed', error: 'Pravljenje je prekinuto. Pokušajte ponovo.' })
    .eq('plan_id', planId)
    .eq('status', 'generating')
    .is('post_id', null)
  const { data } = await admin.from('month_plan_items').select('status').eq('plan_id', planId)
  const done = (data ?? []).filter((i) => i.status === 'done').length
  const failed = (data ?? []).filter((i) => i.status === 'failed').length
  await admin
    .from('month_plans')
    .update({ status: failed ? 'ready' : 'done', updated_at: new Date().toISOString() })
    .eq('id', planId)
  const mode = planSettings(plan).mode ?? 'review'
  if (done)
    await notifyRoles(brand, ['owner', 'admin', 'approver'], {
      type: 'month_plan_ready',
      title:
        mode === 'schedule'
          ? `Mesečni plan je gotov: ${done} objava je zakazano`
          : `Mesečni plan je gotov: ${done} nacrta čeka odluku`,
      body: failed ? `${failed} objava nije napravljeno; pokušajte ponovo iz plana.` : null,
      link: mode === 'schedule' ? '/app/calendar' : '/app/approvals',
      data: { planId },
      email: false,
    }).catch((error) => logger.warn('month_plan_notify_failed', { planId, error }))
  return { done, failed }
}

export type { ItemRow, PlanRow }
