import 'server-only'

import { toApiError } from '@/lib/ai/errors'
import { generateImage, type AspectRatio, type ImageInput } from '@/lib/ai/gemini'
import { imageModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { AI_IMAGES_FLAG, isFeatureEnabled } from '@/lib/flags'
import { enqueueImageJob } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { ImageFromPhotoInput, ImageFromPromptInput } from '@/lib/schemas/ai'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { getBrandContextForBrand } from '@/services/brand-brain/profile'
import { getBrand } from '@/services/brands'
import { downloadAsset, getAsset, storeGeneratedImage } from '@/services/media'

export interface ImageJobAccepted {
  generationId: string
  status: 'queued'
  tokensReserved: number
}

interface ImageJobInput {
  kind: 'from_prompt' | 'from_photo'
  prompt: string
  aspectRatio: AspectRatio
  quality: 'standard' | 'premium'
  brandName: string
  brandStyle: string | null
  sourceAssetId: string | null
}

/** Stil iz Brand Brain profila (stil fotografija + boje); bez profila opcioni ručni unos u settings.photo_style. */
async function brandStyleFor(brand: { id: string; name: string; settings: unknown }): Promise<string | null> {
  const ctx = await getBrandContextForBrand(brand.id)
  if (ctx) {
    const parts = [
      ctx.photoStyleSuffix,
      `brand colors ${ctx.colors.primary}, ${ctx.colors.secondary}, accent ${ctx.colors.accent} (use as subtle palette, not as flat fills)`,
    ].filter(Boolean)
    return parts.join('; ')
  }
  const s = (brand.settings ?? {}) as Record<string, unknown>
  return typeof s.photo_style === 'string' ? s.photo_style : null
}

async function acceptImageJob(
  viewer: Viewer,
  brandId: string,
  quality: 'standard' | 'premium',
  job: Omit<ImageJobInput, 'brandName' | 'brandStyle'>,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<ImageJobAccepted> {
  // jedna AI slika košta 0,067–0,134 USD, koliko dvadesetak tekstova (D-104)
  if (!(await isFeatureEnabled(AI_IMAGES_FLAG))) {
    throw new ApiError(
      'FORBIDDEN',
      'AI slike su isključene. Uzmite fotografiju sa Unsplash-a, uvezite dizajn iz Canve ili napravite vizual iz šablona.',
    )
  }
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)

  const price = await getTokenPrice(quality === 'premium' ? 'image_premium' : 'image_standard')
  const input: ImageJobInput = { ...job, brandName: brand.name, brandStyle: await brandStyleFor(brand) }
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: job.kind === 'from_photo' ? 'image_from_photo' : 'image_from_prompt',
    tokens: price,
    input: input as unknown as Record<string, string | null>,
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
    status: 'queued',
  })

  try {
    await enqueueImageJob(generationId, brand.workspace_id)
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
  return { generationId, status: 'queued', tokensReserved: price }
}

export function requestImageFromPrompt(
  viewer: Viewer,
  input: ImageFromPromptInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<ImageJobAccepted> {
  return acceptImageJob(
    viewer,
    input.brandId,
    input.quality,
    {
      kind: 'from_prompt',
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      sourceAssetId: null,
    },
    meta,
  )
}

export async function requestImageFromPhoto(
  viewer: Viewer,
  input: ImageFromPhotoInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<ImageJobAccepted> {
  const asset = await getAsset(viewer, input.mediaAssetId)
  if (asset.kind !== 'image') throw new ApiError('VALIDATION', 'Izaberite fotografiju (sliku), ne video.')
  if (asset.brand_id && asset.brand_id !== input.brandId) {
    throw new ApiError('VALIDATION', 'Fotografija pripada drugom brendu.')
  }
  return acceptImageJob(
    viewer,
    input.brandId,
    input.quality,
    {
      kind: 'from_photo',
      prompt: input.instruction,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      sourceAssetId: asset.id,
    },
    meta,
  )
}

function buildImagePrompt(job: ImageJobInput): string {
  const lines = [
    job.kind === 'from_photo'
      ? 'Priložena fotografija je osnova. Izmeni je ili napravi kompoziciju tačno po uputstvu ispod, zadržavajući ono što uputstvo ne traži da se menja.'
      : 'Napravi fotografiju ili ilustraciju visokog kvaliteta za objavu na društvenim mrežama po opisu ispod.',
    `Brend: ${job.brandName}.`,
    job.brandStyle
      ? `Vizuelni stil brenda: ${job.brandStyle}.`
      : 'Stil: čisto, prirodno svetlo, bez vodenih žigova.',
    'Bez teksta na slici osim ako uputstvo izričito traži tekst. Bez logotipa trećih strana.',
    '',
    'UPUTSTVO:',
    job.prompt,
  ]
  return lines.join('\n')
}

/**
 * Izvršavanje posla (poziva Inngest funkcija). Idempotentno: posao koji nije u
 * statusu queued/running se preskače. Uspeh → slika u Storage + media_assets +
 * potvrda tokena; neuspeh → oslobađanje tokena i razumljiva poruka.
 */
export async function runImageGeneration(
  generationId: string,
): Promise<{ status: 'succeeded' | 'failed' | 'skipped' }> {
  const admin = createSupabaseAdminClient()
  const { data: gen, error } = await admin
    .from('ai_generations')
    .select('id, workspace_id, brand_id, user_id, status, input, token_reservation_id')
    .eq('id', generationId)
    .maybeSingle()
  if (error || !gen) {
    logger.error('image_job_missing', { generationId, error })
    return { status: 'skipped' }
  }
  if (gen.status !== 'queued' && gen.status !== 'running') return { status: 'skipped' }

  const job = gen.input as unknown as ImageJobInput
  await admin
    .from('ai_generations')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      progress: { step: 'generating', message: 'Pravim sliku…' },
    })
    .eq('id', generationId)

  const started = Date.now()
  try {
    let inputImages: ImageInput[] | undefined
    if (job.kind === 'from_photo' && job.sourceAssetId) {
      const { data: asset } = await admin
        .from('media_assets')
        .select('*')
        .eq('id', job.sourceAssetId)
        .maybeSingle()
      if (!asset) throw new ApiError('NOT_FOUND', 'Izvorna fotografija više ne postoji.')
      const bytes = await downloadAsset(asset)
      inputImages = [{ data: bytes.toString('base64'), mimeType: asset.mime_type }]
    }

    const outcome = await callWithFallback(
      await imageModelChain(job.quality),
      (model) =>
        generateImage({
          model,
          prompt: buildImagePrompt(job),
          inputImages,
          aspectRatio: job.aspectRatio,
          imageSize: job.quality === 'premium' ? '2K' : '1K',
        }),
      { label: `image-${job.kind}` },
    )

    await admin
      .from('ai_generations')
      .update({ progress: { step: 'saving', message: 'Čuvam sliku…' } })
      .eq('id', generationId)
    const bytes = Buffer.from(outcome.result.imageBase64, 'base64')
    const asset = await storeGeneratedImage({
      workspaceId: gen.workspace_id,
      brandId: gen.brand_id,
      bytes,
      mimeType: outcome.result.mimeType,
      generationId,
      model: outcome.model,
      prompt: job.prompt,
      altText: outcome.result.text,
      uploadedBy: gen.user_id,
    })

    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
      images: 1,
      imageSize: job.quality === 'premium' ? '2K' : '1K',
    })
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: {
          assetId: asset.id,
          mimeType: asset.mime_type,
          width: asset.width,
          height: asset.height,
          note: outcome.result.text,
        },
        output_asset_id: asset.id,
        duration_ms: Date.now() - started,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        provider_images: 1,
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
    await failGeneration(generationId, gen.token_reservation_id, api.code, api.message, {
      duration_ms: Date.now() - started,
    })
    logger.warn('image_job_failed', { generationId, code: api.code })
    return { status: 'failed' }
  }
}
