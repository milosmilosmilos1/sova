import { z } from 'zod'

/** Odobravanje (D-108, faza 4). */
export const reviewListQuerySchema = z.object({
  brandId: z.uuid(),
  tab: z.enum(['waiting', 'approved', 'published', 'skipped', 'all']).default('waiting'),
  q: z.string().trim().max(100).optional(),
  format: z.enum(['carousel', 'single', 'story', 'video', 'text']).optional(),
  sort: z.enum(['new', 'old']).default('new'),
})

export const deskEditsSchema = z.object({
  version: z.number().int().min(1),
  masterText: z.string().max(20000).optional(),
  firstComment: z.string().trim().max(2200).nullable().optional(),
  /** tekst po nalogu (ID naloga → tekst); prazno = master tekst */
  texts: z.record(z.uuid(), z.string().max(20000)).optional(),
})

export const deskScheduleSchema = deskEditsSchema.extend({
  scheduledFor: z.iso.datetime({ offset: true }),
})

export const deskVersionSchema = z.object({ version: z.number().int().min(1) })
