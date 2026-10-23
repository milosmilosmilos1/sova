import { z } from 'zod'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { contentLocaleSchema, postGoalSchema } from '@/lib/ai/prompts/post-text'

const platformEnum = z.enum(Object.keys(PLATFORMS) as [SocialPlatform, ...SocialPlatform[]])

export const textRequestSchema = z.object({
  brandId: z.uuid(),
  platforms: z.array(platformEnum).min(1, { error: 'Izaberite bar jednu mrežu.' }).max(8),
  topic: z
    .string({ error: 'Opišite o čemu je objava.' })
    .trim()
    .min(3, { error: 'Opis je prekratak.' })
    .max(2000, { error: 'Opis može imati najviše 2.000 karaktera.' }),
  goal: postGoalSchema.default('engagement'),
  cta: z.string().trim().max(200).optional(),
  includeHashtags: z.boolean().default(true),
  variantsPerPlatform: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  /** fotografija iz media biblioteke (opciono) */
  mediaAssetId: z.uuid().optional(),
  locale: contentLocaleSchema.optional(),
})
export type TextRequestInput = z.infer<typeof textRequestSchema>

export const aspectRatioSchema = z.enum(['1:1', '4:5', '3:4', '9:16', '16:9', '4:3', '3:2', '2:3', '21:9'])
export const imageQualitySchema = z.enum(['standard', 'premium'])

export const imageFromPromptSchema = z.object({
  brandId: z.uuid(),
  prompt: z
    .string({ error: 'Opišite sliku.' })
    .trim()
    .min(3, { error: 'Opis je prekratak.' })
    .max(2000, { error: 'Opis može imati najviše 2.000 karaktera.' }),
  aspectRatio: aspectRatioSchema.default('1:1'),
  quality: imageQualitySchema.default('standard'),
})
export type ImageFromPromptInput = z.infer<typeof imageFromPromptSchema>

export const imageFromPhotoSchema = z.object({
  brandId: z.uuid(),
  mediaAssetId: z.uuid({ error: 'Izaberite fotografiju.' }),
  instruction: z
    .string({ error: 'Opišite kakvu objavu želite.' })
    .trim()
    .min(3, { error: 'Opis je prekratak.' })
    .max(2000, { error: 'Opis može imati najviše 2.000 karaktera.' }),
  aspectRatio: aspectRatioSchema.default('1:1'),
  quality: imageQualitySchema.default('standard'),
})
export type ImageFromPhotoInput = z.infer<typeof imageFromPhotoSchema>

export const jobIdParamSchema = z.object({ id: z.uuid() })
