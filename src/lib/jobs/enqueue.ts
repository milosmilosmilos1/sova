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

/** Video iz Canve (D-104): Canva ga pravi i po nekoliko minuta, duže od jednog poziva funkcije. */
export async function enqueueCanvaVideoExport(generationId: string, workspaceId: string): Promise<void> {
  try {
    await inngest.send(events.canvaVideoExportRequested.create({ generationId, workspaceId }))
  } catch (error) {
    logger.error('enqueue_canva_video_failed', { generationId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

/** Uvoz istorije objava posle povezivanja ili sinhronizacije naloga (faza 8a). */
export async function enqueueHistoryImport(socialAccountId: string, brandId: string): Promise<void> {
  try {
    await inngest.send(events.socialHistoryImportRequested.create({ socialAccountId, brandId }))
  } catch (error) {
    logger.error('enqueue_history_import_failed', { socialAccountId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

/** Zakazivanje targeta: publisher (faza 9b) spava do termina; `version` razlikuje stare run-ove. */
export async function enqueueTargetScheduled(
  targetId: string,
  scheduledAt: string,
  version: number,
  socialAccountId: string,
): Promise<void> {
  try {
    await inngest.send(events.postTargetScheduled.create({ targetId, scheduledAt, version, socialAccountId }))
  } catch (error) {
    logger.error('enqueue_target_scheduled_failed', { targetId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

/** Otkazivanje zakazanog run-a (cancelOn u publisheru); greška se samo loguje, status u bazi je izvor istine. */
export async function enqueueTargetUnscheduled(targetId: string): Promise<void> {
  try {
    await inngest.send(events.postTargetUnscheduled.create({ targetId }))
  } catch (error) {
    logger.warn('enqueue_target_unscheduled_failed', { targetId, error })
  }
}

/** Strategija (faza 10a): 20 tokena, radi se u pozadini do 2 min. */
export async function enqueueStrategyJob(
  generationId: string,
  brandId: string,
  workspaceId: string,
): Promise<void> {
  try {
    await inngest.send(events.strategyGenerateRequested.create({ generationId, brandId, workspaceId }))
  } catch (error) {
    logger.error('enqueue_strategy_failed', { generationId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

/** Nedeljni prolaz Autopilota za jedan brend (cron fan-out ili ručno „Pokreni sada”). */
export async function enqueueAutopilotWeek(
  brandId: string,
  weekStart: string | null,
  triggeredBy: string | null,
): Promise<void> {
  try {
    await inngest.send(events.autopilotWeekRequested.create({ brandId, weekStart, triggeredBy }))
  } catch (error) {
    logger.error('enqueue_autopilot_week_failed', { brandId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

/** Obrada Stripe događaja (faza 12): webhook upisuje događaj i odmah odgovara, obrada ide u pozadini. */
export async function enqueueBillingEvent(paymentEventId: string): Promise<void> {
  await inngest.send(events.billingWebhookReceived.create({ paymentEventId, provider: 'stripe' }))
}

/** Prolaz toka automatizacije (D-108): termin iz crona ili „Generiši odmah”. */
export async function enqueueFlowRun(runId: string, workspaceId: string): Promise<void> {
  try {
    await inngest.send(events.flowRunRequested.create({ runId, workspaceId }))
  } catch (error) {
    logger.error('enqueue_flow_run_failed', { runId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}

export async function enqueueDocumentIndex(documentId: string, brandId: string): Promise<void> {
  try {
    await inngest.send(events.brandDocumentUploaded.create({ documentId, brandId }))
  } catch (error) {
    logger.error('enqueue_document_index_failed', { documentId, error })
    throw new AiError(
      'PROVIDER_ERROR',
      process.env.NODE_ENV === 'development'
        ? 'Pozadinski servis nije dostupan. Pokrenite `npm run inngest:dev` pa pokušajte ponovo.'
        : 'Pozadinski servis trenutno nije dostupan. Pokušajte ponovo za minut.',
      { retryable: true, cause: error },
    )
  }
}
