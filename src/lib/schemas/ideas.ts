import { z } from 'zod'

/** Tabla predloga (D-115). */
export const IDEA_STATUSES = ['new', 'planned', 'in_progress', 'done', 'declined'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const ideaCreateSchema = z.object({
  kind: z.enum(['idea', 'bug']).default('idea'),
  title: z
    .string()
    .trim()
    .min(3, { error: 'Naslov ima bar tri znaka.' })
    .max(120, { error: 'Naslov ima najviše 120 znakova.' }),
  body: z.string().trim().max(2000, { error: 'Opis ima najviše 2.000 znakova.' }).default(''),
})

export const ideasQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['new', 'top']).default('new'),
})

export const ideaStatusSchema = z.object({ status: z.enum(IDEA_STATUSES) })
