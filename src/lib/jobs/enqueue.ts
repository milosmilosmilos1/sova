import 'server-only'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { AiError } from '@/lib/ai/errors'
import { logger } from '@/lib/logger'

/**
 * Slanje pozadinskih poslova. Izdvojeno da bi testovi mogli da zamene slanje
 * i da bi poruka o nepokrenutom Inngest dev serveru bila razumljiva.
 */
export async function enqueueImageJob(generationId: string, workspaceId: string): Promise<void> {
  try {
    await inngest.send(events.aiImageRequested.create({ generationId, workspaceId }))
  } catch (error) {
    logger.error('enqueue_image_job_failed', { generationId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

export interface BrandAnalysisEvent {
  brandId: string
  crawlId: string
  workspaceId: string
  requestedBy: string | null
  generationId: string | null
}

/** Analiza sajta (faza 6) kao pozadinski posao. */
export async function enqueueBrandAnalysis(data: BrandAnalysisEvent): Promise<void> {
  try {
    await inngest.send(events.brandAnalyzeRequested.create(data))
  } catch (error) {
    logger.error('enqueue_brand_analysis_failed', { crawlId: data.crawlId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

/** Otkazivanje analize: greška slanja se samo loguje (status u bazi je već canceled). */
export async function sendBrandAnalysisCanceled(crawlId: string): Promise<void> {
  try {
    await inngest.send(events.brandAnalyzeCanceled.create({ crawlId }))
  } catch (error) {
    logger.warn('send_brand_analysis_canceled_failed', { crawlId, error })
  }
}

/** Vizual iz šablona (faza 7) kao pozadinski posao. */
export async function enqueueVisualTemplateJob(generationId: string, workspaceId: string): Promise<void> {
  try {
    await inngest.send(events.aiVisualTemplateRequested.create({ generationId, workspaceId }))
  } catch (error) {
    logger.error('enqueue_visual_template_failed', { generationId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}
