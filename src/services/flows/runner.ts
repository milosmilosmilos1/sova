import 'server-only'

import { toContentLocale } from '@/config/locales'
import { PLATFORM_FORMATS, type PostFormat } from '@/config/post-formats'
import type { SocialPlatform } from '@/config/platforms'
import type { DesignedFormat } from '@/lib/ai/prompts/carousel'
import { qaCheck } from '@/lib/autopilot/rules'
import { logger } from '@/lib/logger'
import type { FlowFormat } from '@/lib/schemas/flows'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { PhotoSource } from '@/lib/visuals/design/catalog'
import type { Slide } from '@/lib/visuals/design/types'
import { wallClock } from '@/lib/zoned-time'
import { buildBrandContext } from '@/services/ai/text'
import { notifyRoles, recentTexts, type StepRunner } from '@/services/autopilot/runner'
import type { BrandRow } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { captionFor, generateDesignedCopy, type DesignedCopy } from '@/services/design/copy'
import { themeOf, type PostDesignContext } from '@/services/design/post-design'
import { renderDesignInSteps } from '@/services/design/render-post'
import { systemSubmitForReview } from '@/services/posts/system'
import type { Json } from '@/types/database'

import type { FlowRow, FlowRunRow } from './flows'

/**
 * Prolaz toka (D-108): tekst (Gemini, 2 tokena) → slajdovi u stilu (bez troška) → nacrt na
 * odobravanje. Svaki korak je poseban Inngest step i upisuje `step` za prozor „Generiši odmah”.
 * Nacrt uvek ide na odobravanje; kontrola kvaliteta se samo beleži uz nacrt.
 */
const POST_FORMAT: Record<FlowFormat, PostFormat> = { carousel: 'carousel', single: 'image', story: 'story' }
const DESIGNED: Record<FlowFormat, DesignedFormat> = {
  carousel: 'carousel',
  single: 'single',
  story: 'story',
}

export interface FlowRunResult {
  runId: string
  status: 'succeeded' | 'failed' | 'skipped'
  postId?: string
  error?: string
}

interface Loaded {
  run: FlowRunRow
  flow: FlowRow
  brand: BrandRow
}

async function load(runId: string): Promise<Loaded | null> {
  const admin = createSupabaseAdminClient()
  const { data: run } = await admin.from('content_flow_runs').select('*').eq('id', runId).maybeSingle()
  if (!run) return null
  const [{ data: flow }, { data: brand }] = await Promise.all([
    admin.from('content_flows').select('*').eq('id', run.flow_id).maybeSingle(),
    admin.from('brands').select('*').eq('id', run.brand_id).maybeSingle(),
  ])
  if (!flow || !brand) return null
  return { run, flow, brand }
}

async function setRun(runId: string, patch: Partial<FlowRunRow>): Promise<void> {
  await createSupabaseAdminClient().from('content_flow_runs').update(patch).eq('id', runId)
}

/** Nalozi za tok: svi aktivni koji primaju format (i oni povezani kasnije) ili izabrani. */
async function targetAccounts(flow: FlowRow): Promise<Array<{ id: string; platform: SocialPlatform }>> {
  const format = POST_FORMAT[flow.format as FlowFormat]
  let query = createSupabaseAdminClient()
    .from('social_accounts')
    .select('id, platform')
    .eq('brand_id', flow.brand_id)
    .eq('status', 'active')
  if (!flow.auto_accounts)
    query = query.in(
      'id',
      flow.account_ids.length ? flow.account_ids : ['00000000-0000-0000-0000-000000000000'],
    )
  const { data } = await query
  return (data ?? [])
    .map((a) => ({ id: a.id, platform: a.platform as SocialPlatform }))
    .filter((a) => PLATFORM_FORMATS[a.platform]?.includes(format))
}

async function fail(loaded: Loaded, message: string): Promise<FlowRunResult> {
  await setRun(loaded.run.id, { status: 'failed', error: message, finished_at: new Date().toISOString() })
  await notifyRoles(loaded.brand, ['owner', 'admin', 'editor'], {
    type: 'flow_failed',
    title: `Tok „${loaded.flow.name}” nije napravio nacrt`,
    body: message.slice(0, 500),
    link: '/app/flows',
    data: { flowId: loaded.flow.id, runId: loaded.run.id },
    email: false,
  }).catch((error) => logger.warn('flow_fail_notify_failed', { runId: loaded.run.id, error }))
  return { runId: loaded.run.id, status: 'failed', error: message }
}

export async function runFlow(runId: string, step: StepRunner): Promise<FlowRunResult> {
  const loaded = await load(runId)
  if (!loaded) return { runId, status: 'skipped' }
  const { run, flow, brand } = loaded
  if (run.status === 'succeeded' || run.status === 'failed') return { runId, status: 'skipped' }
  if (flow.deleted_at) return fail(loaded, 'Tok je obrisan.')
  if (brand.deleted_at || brand.status !== 'active') return fail(loaded, 'Brend je pauziran ili arhiviran.')
  if (!flow.active && run.trigger === 'schedule') return fail(loaded, 'Tok je pauziran.')

  const accounts = await targetAccounts(flow)
  if (!accounts.length)
    return fail(
      loaded,
      'Nema povezane mreže koja prima ovaj format. Povežite nalog ili promenite format toka.',
    )
  const platforms = [...new Set(accounts.map((a) => a.platform))]
  const format = flow.format as FlowFormat
  const locale = flow.locale ? toContentLocale(flow.locale) : toContentLocale(brand.content_locale)

  let copy: DesignedCopy
  try {
    await setRun(runId, { status: 'running', step: 'copy' })
    copy = await step('copy', async () => {
      const design = await resolveDesign(brand)
      const context = await buildBrandContext(brand, flow.topic, locale)
      const slides =
        format === 'single'
          ? 1
          : format === 'story'
            ? Math.min(flow.slides ?? 1, 5)
            : (flow.slides ?? design.slides)
      return generateDesignedCopy({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        userId: null,
        context,
        topic: flow.topic,
        cta: flow.cta,
        format: DESIGNED[format],
        slides,
        platforms,
        includeHashtags: true,
        publishDate: wallClock(new Date().toISOString(), brand.timezone).date,
        dmCta: flow.cta_mode === 'dm',
        origin: { flow: flow.id, run: runId },
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail(loaded, message.includes('token') ? message : `Tekst nije napravljen: ${message}`)
  }

  try {
    await setRun(runId, { step: 'images', tokens: copy.tokens })
    const look = await step('look', async () => {
      const design = await resolveDesign(brand)
      // jedna tema za sve objave (D-125): stil toka iz ranijih verzija se više ne koristi
      const photoSource = (flow.photo_source as PhotoSource | null) ?? design.photoSource
      return { design, styleId: design.styleId, photoSource, size: design.size }
    })
    // fotografije pa slajdovi po tri, svaki deo u svom koraku (D-122: Netlify daje 30 s po zahtevu)
    const out = await renderDesignInSteps(step, {
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      design: look.design,
      styleId: look.styleId,
      format: format === 'story' ? 'story' : look.size,
      slides: copy.slides as Slide[],
      photoSource: look.photoSource,
      query: (copy.visualQuery || flow.topic).slice(0, 100),
      uploadedBy: null,
      galleryCategoryId: flow.gallery_category_id,
      topic: [flow.topic, ...copy.slides.map((s) => s.title)].join(' '),
      origin: { flowId: flow.id, runId },
    })
    const rendered = { ...look, assetIds: out.assetIds, photoIds: out.photoIds }
    const assetIds = rendered.assetIds

    await setRun(runId, { step: 'check' })
    const postId = await step('post', async () => {
      const admin = createSupabaseAdminClient()
      const main = platforms.includes('instagram') ? 'instagram' : platforms[0]!
      const context = await buildBrandContext(brand, flow.topic, locale)
      const report = qaCheck({
        platform: main,
        text: copy.caption,
        hashtags: copy.hashtags,
        locale,
        forbiddenWords: context.forbiddenWords ?? [],
        factsCorpus: [
          ...(context.facts ?? []),
          ...(context.services ?? []),
          ...(context.knowledge ?? []),
          context.description ?? '',
          flow.topic,
        ].join('\n'),
        recentTexts: await recentTexts(brand.id, '00000000-0000-0000-0000-000000000000'),
        hasMedia: assetIds.length > 0,
      })
      const { data: post, error } = await admin
        .from('posts')
        .insert({
          brand_id: brand.id,
          workspace_id: brand.workspace_id,
          title: (copy.slides[0]?.title ?? flow.name).slice(0, 200),
          master_text: captionFor(copy, 'instagram'),
          first_comment: copy.firstComment,
          status: 'draft',
          source: 'autopilot',
          flow_id: flow.id,
          language: locale,
          qa_report: report as unknown as Json,
          design: {
            topic: flow.topic,
            cta: flow.cta,
            format,
            styleId: rendered.styleId,
            slides: copy.slides.length,
            photoSource: rendered.photoSource,
            size: rendered.size,
            ...themeOf(look.design),
            locale,
            platforms,
            flowId: flow.id,
            dmCta: flow.cta_mode === 'dm',
            // korak iz ranije verzije (pre D-116) nema photoIds
            copy: { slides: copy.slides as Slide[], photoAssetIds: rendered.photoIds ?? [] },
          } satisfies PostDesignContext as unknown as Json,
        })
        .select('id')
        .single()
      if (error || !post) throw new Error(error?.message ?? 'Nacrt nije upisan.')
      const story = format === 'story'
      const { error: targetsError } = await admin.from('post_targets').insert(
        accounts.map((a) => {
          const options: Record<string, Json> = {}
          if (story) options.format = 'story'
          if (a.platform === 'instagram' && !story && flow.collaborators.length)
            options.collaborators = flow.collaborators
          return {
            post_id: post.id,
            brand_id: brand.id,
            social_account_id: a.id,
            platform: a.platform,
            text_content: captionFor(copy, a.platform),
            options: options as NonNullable<Json>,
          }
        }),
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
      await systemSubmitForReview(post.id, `Tok „${flow.name}”: nacrt poslat na odobrenje`)
      return post.id
    })

    await setRun(runId, {
      status: 'succeeded',
      step: 'done',
      post_id: postId,
      finished_at: new Date().toISOString(),
    })
    await createSupabaseAdminClient()
      .from('content_flows')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', flow.id)
    return { runId, status: 'succeeded', postId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('flow_run_failed', { runId, message })
    return fail(loaded, `Nacrt nije napravljen: ${message}`)
  }
}
