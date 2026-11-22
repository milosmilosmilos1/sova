import { z } from 'zod'

import { POST_FORMATS } from '@/config/post-formats'
import { contentLocaleSchema } from '@/config/locales'

const uuid = z.uuid({ error: 'Neispravan identifikator.' })

export const brandParamsSchema = z.object({ brandId: uuid })

export const updateAutopilotSchema = z
  .object({
    level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
    /** mesečni limit tokena za Autopilot; null = bez posebnog limita (važi stanje workspace-a) */
    tokenBudget: z.number().int().min(0).max(100000).nullable().optional(),
    approvalDeadlineHours: z.number().int().min(1).max(720).optional(),
    unapprovedAction: z.enum(['skip', 'publish']).optional(),
    /** D-107: jezik objava (null = jezik brenda), dozvoljene vrste i mešanje */
    language: contentLocaleSchema.nullable().optional(),
    formats: z.array(z.enum(POST_FORMATS)).min(1, { error: 'Izaberite bar jednu vrstu objave.' }).optional(),
    mix: z.boolean().optional(),
    level3AccountIds: z.array(uuid).max(16).optional(),
    /** za nivo 3: tačan naziv brenda */
    confirm: z.string().trim().max(120).optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'confirm'), { error: 'Nema izmena.' })
export type UpdateAutopilotInput = z.infer<typeof updateAutopilotSchema>

export const runAutopilotSchema = z.object({}).passthrough()

export const listSuggestionsQuerySchema = z.object({
  brandId: uuid,
  status: z.enum(['new', 'accepted', 'dismissed', 'expired', 'all']).default('new'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const suggestionParamsSchema = z.object({ id: uuid })

export const acceptSuggestionSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    text: z.string().max(20000).optional(),
  })
  .partial()
