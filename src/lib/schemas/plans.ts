import { z } from 'zod'

import { contentLocaleSchema } from '@/config/locales'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { POST_FORMATS } from '@/config/post-formats'

/** Mesečni plan (D-119). */
const platformEnum = z.enum(Object.keys(PLATFORMS) as [SocialPlatform, ...SocialPlatform[]])

export const planRequestSchema = z.object({
  brandId: z.uuid(),
  kind: z.enum(['current', 'next']).default('next'),
  perWeek: z.number().int().min(1).max(14).default(5),
  platforms: z.array(platformEnum).max(8).default([]),
  formats: z
    .array(z.enum(POST_FORMATS))
    .min(1, { error: 'Izaberite bar jednu vrstu objave.' })
    .default([...POST_FORMATS]),
  locale: contentLocaleSchema.optional(),
  notes: z.string().trim().max(1000, { error: 'Napomena može imati najviše 1.000 karaktera.' }).optional(),
})
export type PlanRequestInput = z.infer<typeof planRequestSchema>

export const planQuerySchema = z.object({ brandId: z.uuid() })
export const planParamsSchema = z.object({ id: z.uuid() })
export const planItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

export const planGenerateSchema = z.object({ mode: z.enum(['review', 'schedule']).default('review') })

export const planItemUpdateSchema = z.object({
  topic: z.string().trim().min(3, { error: 'Tema je prekratka.' }).max(200).optional(),
  brief: z.string().trim().max(1000).optional(),
  format: z.enum(POST_FORMATS).optional(),
  date: z.iso.date().optional(),
  time: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { error: 'Vreme nije ispravno.' })
    .optional(),
})
export type PlanItemUpdate = z.infer<typeof planItemUpdateSchema>

export const planItemsDeleteSchema = z.object({
  ids: z.array(z.uuid()).min(1, { error: 'Označite bar jednu objavu.' }).max(100),
})
