import { z } from 'zod'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'

const uuid = z.uuid({ error: 'Neispravan identifikator.' })
const platformEnum = z.enum(Object.keys(PLATFORMS) as [SocialPlatform, ...SocialPlatform[]])
const isoDate = z.iso.date({ error: 'Datum mora biti u formatu YYYY-MM-DD.' })

export const generateStrategySchema = z.object({
  brandId: uuid,
  /** početak perioda (podrazumevano sledeći ponedeljak) */
  periodStart: isoDate.optional(),
  weeks: z.number().int().min(2).max(12).default(4),
  /** prazno = mreže aktivnih naloga brenda */
  platforms: z.array(platformEnum).max(8).optional(),
  goals: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  notes: z.string().trim().max(1000).optional(),
  postsPerWeek: z.number().int().min(1).max(30).optional(),
})
export type GenerateStrategyInput = z.infer<typeof generateStrategySchema>

export const listStrategiesQuerySchema = z.object({ brandId: uuid })

const goalSchema = z.object({
  goal: z.string().max(200),
  kpi: z.string().max(200),
  target: z.string().max(100),
})
const mixEntrySchema = z.object({
  per_week: z.number().int().min(0).max(7),
  formats: z.array(z.string().max(60)).max(10),
  role: z.string().max(200),
})
const themeSchema = z.object({
  week: z.number().int().min(1).max(12),
  theme: z.string().max(200),
  angle: z.string().max(400),
  pillar: z.string().max(100),
  campaign: z.string().max(150),
})
const slotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  source: z.enum(['data', 'assumption']),
})

export const updateStrategySchema = z
  .object({
    status: z.enum(['draft', 'active', 'archived']).optional(),
    summary: z.string().trim().max(2000).nullable().optional(),
    goals: z.array(goalSchema).max(8).optional(),
    networkMix: z.partialRecord(platformEnum, mixEntrySchema).optional(),
    weeklyThemes: z.array(themeSchema).max(12).optional(),
    hashtagStrategy: z
      .object({
        core: z.array(z.string().max(60)).max(20),
        niche: z.array(z.string().max(60)).max(30),
        local: z.array(z.string().max(60)).max(20),
        avoid: z.array(z.string().max(60)).max(20),
      })
      .optional(),
    bestTimes: z.partialRecord(platformEnum, z.array(slotSchema).max(7)).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Nema izmena.' })
export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>

export const generateCalendarSchema = z.object({
  /** prazno = sve nedelje perioda */
  weeks: z.array(z.number().int().min(1).max(12)).max(12).optional(),
})
export type GenerateCalendarInput = z.infer<typeof generateCalendarSchema>

export const pillarInputSchema = z.object({
  brandId: uuid,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  sharePercent: z.number().int().min(0).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Boja mora biti hex (#rrggbb).' })
    .optional(),
})
export const pillarPatchSchema = pillarInputSchema
  .omit({ brandId: true })
  .partial()
  .extend({ isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100).optional() })
  .refine((v) => Object.keys(v).length > 0, { error: 'Nema izmena.' })

export const campaignInputSchema = z
  .object({
    brandId: uuid,
    name: z.string().trim().min(1).max(150),
    goal: z.string().trim().max(300).optional(),
    startsOn: isoDate.optional(),
    endsOn: isoDate.optional(),
    keyMessage: z.string().trim().max(500).optional(),
    offer: z.string().trim().max(300).optional(),
    cta: z.string().trim().max(150).optional(),
    utmCampaign: z.string().trim().max(100).optional(),
    strategyId: uuid.optional(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    error: 'Kraj kampanje je pre početka.',
  })
export const campaignPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    goal: z.string().trim().max(300).nullable().optional(),
    startsOn: isoDate.nullable().optional(),
    endsOn: isoDate.nullable().optional(),
    keyMessage: z.string().trim().max(500).nullable().optional(),
    offer: z.string().trim().max(300).nullable().optional(),
    cta: z.string().trim().max(150).nullable().optional(),
    utmCampaign: z.string().trim().max(100).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Nema izmena.' })

export const brandIdQuerySchema = z.object({ brandId: uuid })
