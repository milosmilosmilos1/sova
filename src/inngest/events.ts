import { eventType } from 'inngest'
import { z } from 'zod'

/**
 * Svi Inngest događaji sa Zod šemama. Naziv: <domen>/<objekat>.<radnja>.
 * Dodaju se po fazama; spisak funkcija je u docs/ARCHITECTURE.md sekcija 6.
 */
const uuid = z.uuid()

export const events = {
  /** Probni događaj za proveru da dev server i /api/inngest rade. */
  ping: eventType('app/ping', {
    schema: z.object({ message: z.string().max(200) }),
  }),

  // Faza 6
  brandAnalyzeRequested: eventType('brand/analyze.requested', {
    schema: z.object({
      brandId: uuid,
      crawlId: uuid,
      workspaceId: uuid,
      requestedBy: uuid.nullable(),
      generationId: uuid.nullable(),
    }),
  }),
  brandAnalyzeCanceled: eventType('brand/analyze.canceled', {
    schema: z.object({ crawlId: uuid }),
  }),

  // Faza 5
  aiImageRequested: eventType('ai/image.requested', {
    schema: z.object({ generationId: uuid, workspaceId: uuid }),
  }),
  aiVisualTemplateRequested: eventType('ai/visual.requested', {
    schema: z.object({ generationId: uuid, workspaceId: uuid }),
  }),
  // D-104: video iz Canve
  canvaVideoExportRequested: eventType('canva/video.export.requested', {
    schema: z.object({ generationId: uuid, workspaceId: uuid }),
  }),

  // Faza 8
  socialHistoryImportRequested: eventType('social/history.import.requested', {
    schema: z.object({ socialAccountId: uuid, brandId: uuid }),
  }),

  // Faza 9
  postTargetScheduled: eventType('post/target.scheduled', {
    schema: z.object({
      targetId: uuid,
      scheduledAt: z.iso.datetime(),
      version: z.number().int(),
      socialAccountId: uuid,
    }),
  }),
  postTargetUnscheduled: eventType('post/target.unscheduled', {
    schema: z.object({ targetId: uuid }),
  }),
  postTargetPublished: eventType('post/target.published', {
    schema: z.object({ targetId: uuid, socialAccountId: uuid, brandId: uuid }),
  }),

  // Faza 10a
  strategyGenerateRequested: eventType('strategy/generate.requested', {
    schema: z.object({ generationId: uuid, brandId: uuid, workspaceId: uuid }),
  }),

  // Faza 10c
  autopilotWeekRequested: eventType('autopilot/week.requested', {
    schema: z.object({ brandId: uuid, weekStart: z.iso.date().nullable(), triggeredBy: uuid.nullable() }),
  }),

  // D-108: tok automatizacije, jedan prolaz (termin ili „Generiši odmah”)
  flowRunRequested: eventType('flow/run.requested', {
    schema: z.object({ runId: uuid, workspaceId: uuid }),
  }),
  // D-112: PDF o brendu, čitanje teksta i upis u bazu znanja
  brandDocumentUploaded: eventType('brand/document.uploaded', {
    schema: z.object({ documentId: uuid, brandId: uuid }),
  }),
  // D-119: mesečni plan, teme za sve termine i pravljenje svih nacrta
  monthPlanRequested: eventType('plan/month.requested', {
    schema: z.object({ planId: uuid, brandId: uuid }),
  }),
  monthPlanGenerate: eventType('plan/month.generate', {
    schema: z.object({ planId: uuid, brandId: uuid }),
  }),

  // Faza 12
  billingWebhookReceived: eventType('billing/webhook.received', {
    schema: z.object({ paymentEventId: uuid, provider: z.enum(['stripe', 'paddle']) }),
  }),

  // Faza 14
  reportMonthlyRequested: eventType('report/monthly.requested', {
    schema: z.object({ brandId: uuid, month: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/) }),
  }),

  // Nalog
  accountExportRequested: eventType('account/export.requested', {
    schema: z.object({ exportId: uuid, userId: uuid }),
  }),
  accountDeleteRequested: eventType('account/delete.requested', {
    schema: z.object({ requestId: uuid }),
  }),
} as const

export type SovaEvents = typeof events
