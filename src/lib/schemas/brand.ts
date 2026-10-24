import { z } from 'zod'

import { EDITABLE_PATHS, fieldPathSchema } from '@/lib/brand/profile-schema'

import { websiteUrlSchema } from './workspace'

export const analyzeRequestSchema = z.object({
  websiteUrl: websiteUrlSchema,
})
export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>

export const crawlParamsSchema = z.object({
  id: z.uuid({ error: 'Neispravan identifikator.' }),
  crawlId: z.uuid({ error: 'Neispravan identifikator analize.' }),
})

export const profileChangeSchema = z.object({
  path: fieldPathSchema.refine((p) => (EDITABLE_PATHS as string[]).includes(p), {
    error: 'Ovo polje puni sistem i ne može ručno da se menja.',
  }),
  value: z.unknown(),
})

export const updateProfileSchema = z.object({
  changes: z.array(profileChangeSchema).min(1, { error: 'Nema izmena.' }).max(40),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const restoreProfileSchema = z.object({
  version: z.number().int().min(1),
})

export const unlockFieldsSchema = z.object({
  paths: z.array(fieldPathSchema).min(1).max(40),
})
