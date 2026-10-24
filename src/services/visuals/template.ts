import 'server-only'

import { toApiError } from '@/lib/ai/errors'
import { costFor } from '@/lib/ai/orchestrator'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { brandProfileSchema } from '@/lib/brand/profile-schema'
import { enqueueVisualTemplateJob } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { VisualTemplateInput } from '@/lib/schemas/visuals'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { confirmReservation } from '@/lib/tokens/reservation'
import { prepareImageForTemplate, prepareLogoForTemplate, renderTemplate } from '@/lib/visuals/render'
import {
  ASPECT_SIZES,
  pickTemplate,
  type TemplateAspect,
  type TemplateColors,
  type TemplateId,
} from '@/lib/visuals/templates'
import { isUnsplashConfigured } from '@/integrations/unsplash/client'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand } from '@/services/brands'
import { downloadAsset, getAsset } from '@/services/media'
import { storeServerImage } from '@/services/visuals/store'
import { pickPhotoForTemplate } from '@/services/visuals/unsplash'
import type { Json } from '@/types/database'

/**
 * „Vizual iz šablona” (brif 6.2): 2 tokena, 202 + posao. Slika: Unsplash (pretraga + vision
 * rangiranje), fotografija iz biblioteke ili bez slike; boje, fontovi i logo iz profila brenda.
 */
export interface VisualJobAccepted {
  generationId: string
  status: 'queued'
  tokensReserved: number
}

type JobInput = VisualTemplateInput & { brandName: string }

export async function requestVisualTemplate(
  viewer: Viewer,
  input: VisualTemplateInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<VisualJobAccepted> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)

  if (input.image.kind === 'asset') {
    const asset = await getAsset(viewer, input.image.mediaAssetId)
    if (asset.kind !== 'image') throw new ApiError('VALIDATION', 'Izaberite sliku, ne video.')
    if (asset.brand_id && asset.brand_id !== brand.id)
      throw new ApiError('VALIDATION', 'Fotografija pripada drugom brendu.')
  }
  if (input.image.kind === 'unsplash' && !isUnsplashConfigured()) {
    throw new ApiError(
      'VALIDATION',
      'Unsplash nije podešen. Otpremite svoju fotografiju ili izaberite šablon bez slike.',
      { fields: { image: ['Unsplash nije dostupan'] } },
    )
  }

  const price = 2
  const job: JobInput = { ...input, brandName: brand.name }
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'visual_template',
    tokens: price,
    input: job as unknown as NonNullable<Json>,
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
    status: 'queued',
  })
  try {
    await enqueueVisualTemplateJob(generationId, brand.workspace_id)
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
  return { generationId, status: 'queued', tokensReserved: price }
}

const DEFAULT_COLORS: TemplateColors = {
  primary: '#1f2937',
  secondary: '#111827',
  accent: '#f59e0b',
  neutralLight: '#f8fafc',
  neutralDark: '#111827',
  textOnPrimary: '#ffffff',
}

async function brandVisuals(brandId: string): Promise<{
  colors: TemplateColors
  fonts: { headings: string; body: string }
  logoAssetId: string | null
  photoStyle: string | null
}> {
  const row = await getCurrentProfileRow(brandId)
  const parsed = row ? brandProfileSchema.safeParse(row.data) : null
  if (!parsed?.success)
    return {
      colors: DEFAULT_COLORS,
      fonts: { headings: 'Inter', body: 'Inter' },
      logoAssetId: null,
      photoStyle: null,
    }
  const p = parsed.data
  const c = p.visual.colors.value
  return {
    colors: {
      primary: c.primary,
      secondary: c.secondary,
      accent: c.accent,
      neutralLight: c.neutral_light,
      neutralDark: c.neutral_dark,
      textOnPrimary: c.text_on_primary,
    },
    fonts: { headings: p.visual.fonts.value.mapped_headings, body: p.visual.fonts.value.mapped_body },
    logoAssetId: p.visual.logo.value.asset_id,
    photoStyle: p.visual.photo_style.value?.summary ?? null,
  }
}

export async function runVisualTemplate(
  generationId: string,
): Promise<{ status: 'succeeded' | 'failed' | 'skipped' }> {
  const admin = createSupabaseAdminClient()
  const { data: gen } = await admin
    .from('ai_generations')
    .select('id, workspace_id, brand_id, user_id, status, input, token_reservation_id')
    .eq('id', generationId)
    .maybeSingle()
  if (!gen) {
    logger.error('visual_job_missing', { generationId })
    return { status: 'skipped' }
  }
  if (gen.status !== 'queued' && gen.status !== 'running') return { status: 'skipped' }
  if (!gen.brand_id) {
    await failGeneration(generationId, gen.token_reservation_id, 'VALIDATION', 'Posao nema brend.')
    return { status: 'failed' }
  }
  const job = gen.input as unknown as JobInput
  const progress = (step: string, message: string) =>
    admin
      .from('ai_generations')
      .update({ status: 'running', progress: { step, message } })
      .eq('id', generationId)
  await admin
    .from('ai_generations')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', generationId)
  const started = Date.now()

  try {
    const visuals = await brandVisuals(gen.brand_id)
    const { data: brandRow } = await admin
      .from('brands')
      .select('logo_asset_id')
      .eq('id', gen.brand_id)
      .maybeSingle()
    const logoAssetId = visuals.logoAssetId ?? brandRow?.logo_asset_id ?? null

    await progress('image', 'Biram fotografiju…')
    let imageDataUri: string | null = null
    let attribution: string | null = null
    let imageInfo: Record<string, Json> = { kind: job.image.kind }
    let rankModel: string | null = null
    let rankUsage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }
    const notes: string[] = []
    if (job.image.kind === 'asset') {
      const { data: asset } = await admin
        .from('media_assets')
        .select('*')
        .eq('id', job.image.mediaAssetId)
        .maybeSingle()
      if (!asset) throw new ApiError('NOT_FOUND', 'Fotografija više ne postoji.')
      imageDataUri = await prepareImageForTemplate(await downloadAsset(asset))
      imageInfo = { kind: 'asset', mediaAssetId: asset.id }
      const attr = asset.attribution as { text?: string } | null
      if (asset.source === 'unsplash' && attr?.text) attribution = attr.text
    } else if (job.image.kind === 'unsplash') {
      const picked = await pickPhotoForTemplate({
        photoId: job.image.photoId ?? null,
        query: job.image.query ?? null,
        aspect: job.aspectRatio,
        headline: job.headline,
        brandName: job.brandName,
        photoStyle: visuals.photoStyle,
      })
      if (!picked) {
        notes.push('Unsplash nije vratio fotografiju; napravljen je šablon bez slike.')
      } else {
        imageDataUri = await prepareImageForTemplate(picked.bytes)
        attribution = picked.attribution.text
        rankModel = picked.rank?.model ?? null
        if (picked.rank) rankUsage = picked.rank.usage
        if (picked.rank?.skipped) notes.push(picked.rank.skipped)
        imageInfo = {
          kind: 'unsplash',
          photoId: picked.photo.id,
          attribution: picked.attribution as unknown as Json,
          rankModel,
          candidates:
            picked.rank?.ordered
              .slice(0, 8)
              .map((c) => ({ id: c.photo.id, score: c.score, reason: c.reason })) ?? [],
        }
      }
    }

    let logoDataUri: string | null = null
    if (logoAssetId) {
      const { data: logo } = await admin.from('media_assets').select('*').eq('id', logoAssetId).maybeSingle()
      if (logo) {
        try {
          logoDataUri = await prepareLogoForTemplate(await downloadAsset(logo), logo.mime_type)
        } catch (error) {
          logger.warn('template_logo_failed', { generationId, error })
        }
      }
    }

    await progress('render', 'Slažem vizual…')
    const aspect = job.aspectRatio as TemplateAspect
    const size = ASPECT_SIZES[aspect]
    const template: TemplateId =
      job.template === 'auto'
        ? pickTemplate({
            hasImage: Boolean(imageDataUri),
            headline: job.headline,
            subtext: job.subtext,
            aspect,
          })
        : (job.template as TemplateId)
    const rendered = await renderTemplate({
      template,
      format: job.format,
      input: {
        headline: job.headline,
        subtext: job.subtext ?? null,
        cta: job.cta ?? null,
        brandName: job.brandName,
        colors: visuals.colors,
        fonts: visuals.fonts,
        logoDataUri,
        imageDataUri,
        size,
        attribution,
      },
    })

    await progress('saving', 'Čuvam sliku…')
    const asset = await storeServerImage({
      workspaceId: gen.workspace_id,
      brandId: gen.brand_id,
      bytes: rendered.bytes,
      mimeType: rendered.mimeType,
      source: 'template',
      folder: 'templates',
      altText: job.headline,
      tags: ['template', template],
      attribution: attribution
        ? { text: attribution, ...(imageInfo.attribution as Record<string, Json> | undefined) }
        : null,
      sourceData: {
        template,
        image: imageInfo,
        fontsUsed: rendered.fontsUsed,
        headline: job.headline,
      } as unknown as Json,
      isAiGenerated: false,
      generationId,
      uploadedBy: gen.user_id,
    })
    const cost = rankModel ? await costFor(rankModel, rankUsage) : 0
    await admin
      .from('ai_generations')
      .update({
        model: rankModel,
        output: {
          assetId: asset.id,
          mimeType: asset.mime_type,
          width: asset.width,
          height: asset.height,
          template,
          image: imageInfo,
          attribution,
          fontsUsed: rendered.fontsUsed,
          notes,
        } as unknown as NonNullable<Json>,
        output_asset_id: asset.id,
        duration_ms: Date.now() - started,
        provider_input_tokens: rankUsage.inputTokens,
        provider_output_tokens: rankUsage.outputTokens + rankUsage.thoughtTokens,
        cost_usd: cost,
        progress: null,
      })
      .eq('id', generationId)
    if (gen.token_reservation_id) await confirmReservation(gen.token_reservation_id)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { status: 'succeeded' }
  } catch (error) {
    const api = toApiError(error)
    logger.warn('visual_template_failed', { generationId, code: api.code, message: api.message })
    await failGeneration(generationId, gen.token_reservation_id, api.code, api.message, {
      duration_ms: Date.now() - started,
    })
    return { status: 'failed' }
  }
}
