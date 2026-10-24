import { z } from 'zod'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { isReportMonth } from '@/lib/reports/period'

const uuid = z.uuid({ error: 'Neispravan identifikator.' })
const dateish = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, { error: 'Datum mora biti YYYY-MM-DD ili ISO vreme.' })
  .optional()
const platformEnum = z.enum(Object.keys(PLATFORMS) as [SocialPlatform, ...SocialPlatform[]])

export const analyticsRangeQuerySchema = z.object({ brandId: uuid, from: dateish, to: dateish })
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>

export const analyticsPostsQuerySchema = analyticsRangeQuerySchema.extend({
  platform: platformEnum.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const insightsQuerySchema = z.object({
  brandId: uuid,
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export const generateInsightsSchema = z.object({
  brandId: uuid,
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
})
export type GenerateInsightsInput = z.infer<typeof generateInsightsSchema>

export const refreshMetricsSchema = z.object({ targetId: uuid })

/** Mesečni PDF izveštaj (D-094). */
export const reportsQuerySchema = z.object({ brandId: uuid })
export const createReportSchema = z.object({
  brandId: uuid,
  month: z.string().refine(isReportMonth, { error: 'Mesec mora biti u obliku YYYY-MM.' }),
})
