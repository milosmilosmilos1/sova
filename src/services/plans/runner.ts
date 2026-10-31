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
import { monthEnd, slotMonths, type PlanSlot } from '@/lib/plans/slots'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import type { Slide } from '@/lib/visuals/design/types'
import { videoScenes } from '@/lib/visuals/design/video'
import { wallClock, zonedToUtc } from '@/lib/zoned-time'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { generateDraftText } from '@/services/autopilot/content'
import { notifyRoles, type StepRunner } from '@/services/autopilot/runner'
import type { BrandRow } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { captionFor, generateDesignedCopy } from '@/services/design/copy'
import { themeOf, type PostDesignContext } from '@/services/design/post-design'
import { renderDesignInSteps, type DesignRenderInput } from '@/services/design/render-post'
import {
  buildThemeVideoInSteps,
  VIDEO_COPY_SLIDES,
  videoPostDesign,
  type ThemeVideoInput,
} from '@/services/design/video-post'
import { systemSchedule, systemSubmitForReview } from '@/services/posts/system'
import type { Database, Json } from '@/types/database'

/**
 * Mesečni plan u pozadini (D-119). Prvo Gemini bira temu za svaki termin, jedan poziv po
 * kalendarskom mesecu (3 tokena po mesecu; plan može da pokrije do tri meseca, D-120),
 * a posle „Generiši sve” svaka stavka postaje gotov nacrt: karusel, slika i priča kao slajdovi u
 * stilu brenda, video sa Pexels-a uz tekst, tekst i link kao tekst (2 tokena po objavi). Nacrt ide
 * na odobravanje ili odmah u zakazivanje, sa terminom iz plana. Na kraju jedno obaveštenje.
 */
type PlanRow = Database['public']['Tables']['month_plans']['Row']
type ItemRow = Database['public']['Tables']['month_plan_items']['Row']

export interface PlanSettings {
  kind: 'current' | 'next'
  /** koliko meseci plan pokriva (1–3); stariji planovi nemaju polje i pokrivaju jedan */
  months?: number
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

/** Kalendarski meseci (YYYY-MM) za koje plan još bira teme; prazno kad plan više ne čeka teme. */
export async function planningMonths(planId: string): Promise<string[]> {
  const loaded = await loadPlan(planId)
  if (!loaded || loaded.plan.status !== 'planning') return []
  return slotMonths(planSettings(loaded.plan).slots ?? [])
}

/** Mesec bez tema ostaje zapisan u planu; ostali meseci se i dalje prave (D-120). */
async function noteMonthFailure(planId: string, message: string): Promise<'failed'> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('month_plans').select('error').eq('id', planId).single()
  await admin
    .from('month_plans')
    .update({
      error: [data?.error, message].filter(Boolean).join(' ').slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
  return 'failed'
}

/** Teme za jedan kalendarski mesec plana: jedan poziv Gemini-ja (3 tokena), stavke u bazu. */
export async function runPlanningMonth(
  planId: string,
  month: string,
): Promise<'done' | 'failed' | 'skipped'> {
  const loaded = await loadPlan(planId)
  if (!loaded || loaded.plan.status !== 'planning') return 'skipped'
  const { plan, brand } = loaded
  const settings = planSettings(plan)
  const all = settings.slots ?? []
  const chunk = all.map((slot, position) => ({ slot, position })).filter((c) => c.slot.date.startsWith(month))
  if (!chunk.length) return 'skipped'
  const admin = createSupabaseAdminClient()
  // ponovljen korak pozadinskog posla ne bira teme dvaput za isti mesec
  const { count } = await admin
    .from('month_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', plan.id)
    .in(
      'position',
      chunk.map((c) => c.position),
    )
  if (count) return 'skipped'
  const locale = toContentLocale(settings.locale ?? brand.content_locale)
  const first = `${month}-01`
  const start = plan.period_start > first ? plan.period_start : first
  const end = plan.period_end < monthEnd(first) ? plan.period_end : monthEnd(first)
  const label = monthLabel(first, start, end)
  const multi = slotMonths(all).length > 1

  const [context, { data: pillars }, { data: recent }, { data: holidays }, { data: planned }] =
    await Promise.all([
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
        .gte('date', start)
        .lte('date', end)
        .order('date'),
      admin.from('month_plan_items').select('topic').eq('plan_id', plan.id).order('position').limit(180),
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
      input: { planId, month: first, slots: chunk.length },
    })
  } catch (error) {
    const message = toApiError(error).message
    return noteMonthFailure(planId, multi ? `${label}: ${message}` : message)
  }
  try {
    const prompt = buildMonthPlanPrompt({
      brand: context,
      locale,
      monthLabel: label,
      slots: chunk.map(({ slot }) => ({
        date: slot.date,
        weekday: WEEKDAYS[new Date(`${slot.date}T12:00:00Z`).getUTCDay()]!,
        format: slot.format,
        platforms: slot.platforms,
      })),
      holidays: holidays ?? [],
      topics: parseVoice(brand.voice)?.topics ?? [],
      pillars: [...new Set((pillars ?? []).map((p) => p.name))],
      recent: [...new Set((recent ?? []).map((r) => r.title!).filter(Boolean))],
      planned: (planned ?? []).map((p) => p.topic),
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
    const topics = normalizeMonthPlan(parsed.data, chunk.length)
    if (!topics.size)
      throw new AiError('INVALID_RESPONSE', 'Model nije predložio nijednu temu.', { model: outcome.model })
    const rows = chunk.flatMap(({ slot, position }, i) => {
      const t = topics.get(i)
      if (!t) return []
      return [
        {
          plan_id: plan.id,
          brand_id: brand.id,
          position,
          scheduled_for: zonedToUtc(slot.date, slot.time, brand.timezone),
          format: slot.format,
          platforms: slot.platforms,
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
    await addTokens(plan.id, price)
    return 'done'
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generation.generationId, generation.reservationId, api.code, api.message)
    return noteMonthFailure(planId, multi ? `${label}: ${api.message}` : api.message)
  }
}

/** Kraj biranja tema: plan je spreman kad ima bar jednu temu; mesec bez tema ostaje opisan u grešci. */
export async function finishPlanning(planId: string): Promise<'ready' | 'failed' | 'skipped'> {
  const loaded = await loadPlan(planId)
  if (!loaded || loaded.plan.status !== 'planning') return 'skipped'
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('month_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
  if (!count) return failPlan(planId, loaded.plan.error ?? 'Sova nije izabrala nijednu temu.')
  await admin
    .from('month_plans')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', planId)
  return 'ready'
}

/** Ceo plan u jednom pozivu (testovi); pozadinski posao radi isto, ali svaki mesec u svom koraku. */
export async function runPlanning(planId: string): Promise<'ready' | 'failed' | 'skipped'> {
  for (const month of await planningMonths(planId)) await runPlanningMonth(planId, month)
  return finishPlanning(planId)
}

/**
 * Stavke koje „Generiši sve” obrađuje: još neurađene i one koje nisu uspele. Nastavak posle pada
 * posla (`onlyPlanned`) uzima samo neurađene, da ista stavka ne obara plan ukrug.
 */
export async function pendingItems(planId: string, opts: { onlyPlanned?: boolean } = {}): Promise<string[]> {
  const { data } = await createSupabaseAdminClient()
    .from('month_plan_items')
    .select('id')
    .eq('plan_id', planId)
    .in('status', opts.onlyPlanned ? ['planned'] : ['planned', 'failed', 'generating'])
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

/** Nacrt kako ide u bazu, bez medija; dizajnirana stavka ga nosi između koraka. */
interface PlanDraft {
  title: string
  master: string
  firstComment: string | null
  link: string | null
  texts: Partial<Record<SocialPlatform, string>>
  accounts: Array<{ id: string; platform: SocialPlatform }>
  story: boolean
  locale: ContentLocale
  design: PostDesignContext | null
  tokens: number
}

/** Dizajnirana stavka posle prvog koraka (D-122): mali JSON koji Inngest pamti za sledeće korake. */
interface DesignedWork {
  itemId: string
  render: DesignRenderInput
  draft: PlanDraft
}

/** Video u temi posle prvog koraka (D-128): kadrovi su napisani, snimci i slojevi idu u koracima. */
interface VideoWork {
  itemId: string
  video: ThemeVideoInput
  draft: PlanDraft
}

type StartedItem =
  | { status: 'done' | 'failed' | 'skipped' }
  | { status: 'render'; work: DesignedWork }
  | { status: 'video'; work: VideoWork }

/** Slajdovi neuspelog pokušaja ne ostaju u biblioteci; fotografije ostaju, brend ih je dobio. */
async function dropAttemptSlides(itemId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('media_assets')
    .select('id')
    .eq('source', 'template')
    .eq('source_data->>itemId', itemId)
    .is('deleted_at', null)
  const ids = (data ?? []).map((r) => r.id)
  if (!ids.length) return
  const { data: used } = await admin.from('post_media').select('media_asset_id').in('media_asset_id', ids)
  const keep = new Set((used ?? []).map((r) => r.media_asset_id))
  const drop = ids.filter((id) => !keep.has(id))
  if (drop.length)
    await admin.from('media_assets').update({ deleted_at: new Date().toISOString() }).in('id', drop)
}

/** Stavka ide u neuspele (sledeće „Generiši sve” je pravi ponovo), bez ostataka pokušaja. */
export async function failPlanItem(itemId: string, message: string): Promise<'failed'> {
  logger.warn('month_plan_item_failed', { itemId, message })
  await setItem(itemId, { status: 'failed', error: message.slice(0, 500) })
  await dropAttemptSlides(itemId).catch((error) =>
    logger.warn('month_plan_item_cleanup_failed', { itemId, error }),
  )
  return 'failed'
}

/**
 * Prvi korak stavke: nalozi, kontekst i tekst. Tekst i link se ovde i završe (staju u jedan korak);
 * karusel, slika i priča vraćaju posao za slajdove, a video posao za video u temi (D-128), koji idu
 * u svojim koracima.
 */
async function startPlanItem(itemId: string): Promise<StartedItem> {
  const admin = createSupabaseAdminClient()
  const { data: item } = await admin.from('month_plan_items').select('*').eq('id', itemId).maybeSingle()
  if (!item || item.status === 'done' || item.post_id) return { status: 'skipped' }
  const loaded = await loadPlan(item.plan_id)
  if (!loaded || loaded.plan.status !== 'generating') return { status: 'skipped' }
  const { plan, brand } = loaded
  const settings = planSettings(plan)
  const format = item.format as PostFormat
  await setItem(item.id, { status: 'generating', error: null })

  try {
    const { data: accountRows } = await admin
      .from('social_accounts')
      .select('id, platform')
      .eq('brand_id', brand.id)
      .eq('status', 'active')
      .in('platform', item.platforms as SocialPlatform[])
    const accounts = (accountRows ?? [])
      .map((a) => ({ id: a.id, platform: a.platform as SocialPlatform }))
      .filter((a) => PLATFORM_FORMATS[a.platform]?.includes(format))
    if (!accounts.length)
      throw new Error('Nema povezanog naloga koji prima ovu vrstu objave. Povežite mrežu u Mrežama.')
    const platforms = [...new Set(accounts.map((a) => a.platform))]
    const locale = toContentLocale(settings.locale ?? brand.content_locale)
    const topic = item.brief ? `${item.topic}\n\n${item.brief}` : item.topic
    const publishDate = wallClock(item.scheduled_for, brand.timezone).date
    const context = await buildBrandContext(brand, topic.slice(0, 500), locale)

    if (format === 'video') {
      // video u temi (D-128): isti tekst kao karusel, kadrovi u temi brenda preko snimka
      const look = await resolveDesign(brand)
      const copy = await generateDesignedCopy({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        userId: null,
        context,
        topic,
        cta: item.cta,
        format: 'carousel',
        slides: VIDEO_COPY_SLIDES,
        platforms,
        includeHashtags: true,
        publishDate,
        origin: { plan: plan.id, item: item.id, video: true },
      })
      const scenes = videoScenes(copy.slides as Slide[])
      return {
        status: 'video',
        work: {
          itemId: item.id,
          video: {
            workspaceId: brand.workspace_id,
            brandId: brand.id,
            design: look,
            scenes,
            query: (copy.visualQuery || item.topic).slice(0, 100),
            uploadedBy: null,
            origin: { planId: plan.id, itemId: item.id },
          },
          draft: {
            title: (copy.slides[0]?.title ?? item.topic).slice(0, 200),
            master: captionFor(copy, 'instagram'),
            firstComment: copy.firstComment,
            link: null,
            texts: Object.fromEntries(platforms.map((p) => [p, captionFor(copy, p)])),
            accounts,
            story: false,
            locale,
            tokens: copy.tokens,
            design: null,
          },
        },
      }
    }

    const designed = DESIGNED[format]
    if (designed) {
      // jedna tema za sve objave (D-125): stil, boje i font brenda, isti u celom planu
      const look = await resolveDesign(brand)
      const styleId = look.styleId
      const photoSource = look.photoSource
      const story = format === 'story'
      const copy = await generateDesignedCopy({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        userId: null,
        context,
        topic,
        cta: item.cta,
        format: designed,
        slides: designed === 'carousel' ? look.slides : 1,
        platforms,
        includeHashtags: true,
        publishDate,
        origin: { plan: plan.id, item: item.id },
      })
      return {
        status: 'render',
        work: {
          itemId: item.id,
          render: {
            workspaceId: brand.workspace_id,
            brandId: brand.id,
            design: look,
            styleId,
            format: story ? 'story' : look.size,
            slides: copy.slides as Slide[],
            photoSource,
            query: (copy.visualQuery || item.topic).slice(0, 100),
            uploadedBy: null,
            topic: [item.topic, ...copy.slides.map((s) => s.title)].join(' '),
            origin: { planId: plan.id, itemId: item.id },
          },
          draft: {
            title: (copy.slides[0]?.title ?? item.topic).slice(0, 200),
            master: captionFor(copy, 'instagram'),
            firstComment: copy.firstComment,
            link: null,
            texts: Object.fromEntries(platforms.map((p) => [p, captionFor(copy, p)])),
            accounts,
            story,
            locale,
            tokens: copy.tokens,
            design: {
              topic: topic.slice(0, 2000),
              cta: item.cta,
              format: designed as PostDesignContext['format'],
              styleId,
              slides: copy.slides.length,
              photoSource,
              size: look.size,
              ...themeOf(look),
              locale,
              platforms,
              copy: { slides: copy.slides as Slide[], photoAssetIds: [] },
            },
          },
        },
      }
    }

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
    const draft: PlanDraft = {
      title: item.topic.slice(0, 200),
      master: text.text,
      firstComment: text.firstComment,
      link: format === 'link' ? brand.website_url : null,
      texts: Object.fromEntries(platforms.map((p) => [p, fitText(p, text.text)])),
      accounts,
      story: false,
      locale,
      design: null,
      tokens: text.tokens,
    }
    return { status: await savePlanDraft(item.id, draft, []) }
  } catch (error) {
    return { status: await failPlanItem(item.id, error instanceof Error ? error.message : String(error)) }
  }
}

/**
 * Poslednji korak: nacrt sa mrežama i medijima, pa odobravanje ili zakazivanje sa terminom iz plana.
 * Gotova stavka se ne pravi dvaput (ponovljen korak samo vraća „gotovo”).
 */
async function savePlanDraft(
  itemId: string,
  draft: PlanDraft,
  assetIds: string[],
): Promise<'done' | 'failed' | 'skipped'> {
  const admin = createSupabaseAdminClient()
  const { data: item } = await admin.from('month_plan_items').select('*').eq('id', itemId).maybeSingle()
  if (!item) return 'skipped'
  if (item.status === 'done' || item.post_id) return 'done'
  const loaded = await loadPlan(item.plan_id)
  if (!loaded) return 'skipped'
  const { plan, brand } = loaded

  let postId: string | null = null
  try {
    const { data: post, error } = await admin
      .from('posts')
      .insert({
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        title: draft.title,
        master_text: draft.master,
        first_comment: draft.firstComment,
        link_url: draft.link,
        status: 'draft',
        source: 'ai',
        language: draft.locale,
        scheduled_for: item.scheduled_for,
        created_by: plan.created_by,
        design: draft.design as unknown as Json,
      })
      .select('id')
      .single()
    if (error || !post) throw new Error(error?.message ?? 'Nacrt nije upisan.')
    postId = post.id
    const { error: targetsError } = await admin.from('post_targets').insert(
      draft.accounts.map((a) => ({
        post_id: post.id,
        brand_id: brand.id,
        social_account_id: a.id,
        platform: a.platform,
        text_content: draft.texts[a.platform] ?? draft.master,
        options: (draft.story ? { format: 'story' } : {}) as NonNullable<Json>,
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
    await addTokens(plan.id, draft.tokens)
  } catch (error) {
    // nacrt bez mreža ili medija ne ostaje u Objavama; sledeće „Generiši sve” pravi nov
    if (postId) await admin.from('posts').delete().eq('id', postId)
    return failPlanItem(item.id, error instanceof Error ? error.message : String(error))
  }

  // Nacrt postoji i stavka je gotova; ako zakazivanje ili slanje na odobravanje ne uspe,
  // nacrt ostaje u Objavama (link sa stavke), a stavka se ne pravi ponovo.
  try {
    // zakazivanje bez odobravanja traži budući termin; prošao termin ide na odobravanje, a video
    // u temi uvek, jer MP4 pravi pregledač u Odobravanju (D-128)
    const future = Date.parse(item.scheduled_for) > Date.now() + 60_000
    if (planSettings(plan).mode === 'schedule' && future && draft.design?.format !== 'video')
      await systemSchedule(postId, 'Mesečni plan: zakazano bez odobravanja')
    else await systemSubmitForReview(postId, 'Mesečni plan: nacrt čeka odluku', { notify: false })
  } catch (error) {
    logger.warn('month_plan_item_submit_failed', { itemId, postId, error })
  }
  return 'done'
}

/**
 * Jedna stavka plana postaje nacrt (ili zakazana objava). Karusel, slika i priča idu u koracima
 * (D-122): tekst, fotografije, slajdovi po tri i nacrt, svaki ispod 30 sekundi koliko Netlify daje
 * zahtevu; tekst i link staju u prvi korak, a video u temi ide kroz `runVideoItem` (D-128). `step`
 * je Inngest korak, a bez njega (testovi) se sve izvrši redom. Korak koji ni posle ponovnog
 * pokušaja ne uspe ostavlja stavku u neuspelima.
 */
export async function runPlanItem(
  itemId: string,
  step: StepRunner = (_name, fn) => fn(),
): Promise<'done' | 'failed' | 'skipped'> {
  const started = await step('start', () => startPlanItem(itemId))
  if (started.status === 'video') return runVideoItem(itemId, started.work, step)
  if (started.status !== 'render') return started.status
  const { work } = started
  try {
    const rendered = await renderDesignInSteps(step, work.render)
    const draft: PlanDraft = {
      ...work.draft,
      design: work.draft.design && {
        ...work.draft.design,
        copy: { slides: work.render.slides, photoAssetIds: rendered.photoIds },
      },
    }
    return await step('save', () => savePlanDraft(itemId, draft, rendered.assetIds))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return step('failed', () => failPlanItem(itemId, `Slajdovi nisu napravljeni: ${message}`))
  }
}

/** Video u temi iz plana (D-128): snimci, slojevi teksta po tri kadra i slika, pa nacrt bez MP4. */
async function runVideoItem(
  itemId: string,
  work: VideoWork,
  step: StepRunner,
): Promise<'done' | 'failed' | 'skipped'> {
  try {
    const video = await buildThemeVideoInSteps(step, work.video)
    const { data: plan } = await createSupabaseAdminClient()
      .from('month_plan_items')
      .select('cta, topic, brief')
      .eq('id', itemId)
      .maybeSingle()
    const topic = plan?.brief ? `${plan.topic}\n\n${plan.brief}` : (plan?.topic ?? work.draft.title)
    const draft: PlanDraft = {
      ...work.draft,
      design: videoPostDesign(
        {
          topic: topic.slice(0, 2000),
          cta: plan?.cta ?? null,
          locale: work.draft.locale,
          platforms: [...new Set(work.draft.accounts.map((a) => a.platform))],
        },
        work.video.design,
        work.video.scenes,
        video,
      ),
    }
    return await step('save', () => savePlanDraft(itemId, draft, []))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return step('failed', () => failPlanItem(itemId, `Video nije napravljen: ${message}`))
  }
}

/**
 * Posao plana je pao usred stavke (korak nije stao u limit ni u drugom pokušaju): ta stavka ide u
 * neuspele, a vraća se broj stavki koje još čekaju, da se plan nastavi bez nje.
 */
export async function interruptPlan(planId: string): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data: stuck } = await admin
    .from('month_plan_items')
    .select('id')
    .eq('plan_id', planId)
    .eq('status', 'generating')
    .is('post_id', null)
  for (const row of stuck ?? [])
    await failPlanItem(row.id, 'Pravljenje je trajalo predugo pa je prekinuto. Pokušajte ponovo.')
  const { data: plan } = await admin.from('month_plans').select('status').eq('id', planId).maybeSingle()
  if (plan?.status !== 'generating') return 0
  const { count } = await admin
    .from('month_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('status', 'planned')
  return count ?? 0
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
