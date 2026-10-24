import { z } from 'zod'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'

const platformEnum = z.enum(Object.keys(PLATFORMS) as [SocialPlatform, ...SocialPlatform[]])

export const postStatusSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'rejected',
  'scheduled',
  'paused',
  'publishing',
  'published',
  'partially_published',
  'failed',
  'canceled',
])

export const targetInputSchema = z.object({
  socialAccountId: z.uuid(),
  /** tekst za tu mrežu; prazno = master tekst */
  text: z.string().max(20000).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
})

export const mediaInputSchema = z.object({
  mediaAssetId: z.uuid(),
  sortOrder: z.number().int().min(0).max(50).optional(),
  /** samo za jednu mrežu; prazno = za sve */
  socialAccountId: z.uuid().optional(),
})

export const createPostSchema = z.object({
  brandId: z.uuid(),
  title: z.string().trim().max(200).optional(),
  masterText: z.string().max(20000).default(''),
  firstComment: z.string().trim().max(2200).optional(),
  linkUrl: z.url().max(2048).optional(),
  utm: z.record(z.string(), z.string().max(200)).optional(),
  language: z.enum(['sr-Latn', 'sr-Cyrl', 'en']).optional(),
  targets: z.array(targetInputSchema).max(16).default([]),
  media: z.array(mediaInputSchema).max(20).default([]),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
  pillarId: z.uuid().optional(),
  campaignId: z.uuid().optional(),
  isEvergreen: z.boolean().optional(),
  evergreenIntervalDays: z.number().int().min(7).max(365).optional(),
  source: z.enum(['manual', 'ai', 'suggestion']).default('manual'),
})
export type CreatePostInput = z.infer<typeof createPostSchema>

export const updatePostSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().max(200).nullable().optional(),
  masterText: z.string().max(20000).optional(),
  firstComment: z.string().trim().max(2200).nullable().optional(),
  linkUrl: z.url().max(2048).nullable().optional(),
  utm: z.record(z.string(), z.string().max(200)).nullable().optional(),
  language: z.enum(['sr-Latn', 'sr-Cyrl', 'en']).nullable().optional(),
  targets: z.array(targetInputSchema).max(16).optional(),
  media: z.array(mediaInputSchema).max(20).optional(),
  scheduledFor: z.iso.datetime({ offset: true }).nullable().optional(),
  pillarId: z.uuid().nullable().optional(),
  campaignId: z.uuid().nullable().optional(),
  isEvergreen: z.boolean().optional(),
  evergreenIntervalDays: z.number().int().min(7).max(365).nullable().optional(),
  changeSummary: z.string().trim().max(200).optional(),
})
export type UpdatePostInput = z.infer<typeof updatePostSchema>

export const versionBodySchema = z.object({
  version: z.number().int().min(1),
  comment: z.string().trim().max(4000).optional(),
})

export const scheduleSchema = z.object({
  version: z.number().int().min(1),
  scheduledFor: z.iso.datetime({ offset: true }),
  /** po nalogu drugačije vreme (opciono) */
  targetTimes: z.record(z.uuid(), z.iso.datetime({ offset: true })).optional(),
})
export type ScheduleInput = z.infer<typeof scheduleSchema>

export const listPostsQuerySchema = z.object({
  brandId: z.uuid(),
  status: z.string().max(200).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>

export const calendarQuerySchema = z.object({
  brandId: z.uuid(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
})

export const commentSchema = z.object({
  body: z.string().trim().min(1, { error: 'Komentar je prazan.' }).max(4000),
  mentions: z.array(z.uuid()).max(20).optional(),
})

export const createApprovalLinkSchema = z.object({
  brandId: z.uuid(),
  postIds: z.array(z.uuid()).min(1).max(50),
  clientLabel: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(1000).optional(),
})
export type CreateApprovalLinkInput = z.infer<typeof createApprovalLinkSchema>

export const publicDecisionSchema = z.object({
  postId: z.uuid(),
  postVersion: z.number().int().min(1),
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  comment: z.string().trim().max(4000).optional(),
  name: z.string().trim().max(120).optional(),
})

export const publicCommentSchema = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
  name: z.string().trim().max(120).optional(),
})

export const tokenParamSchema = z.object({ token: z.string().min(16).max(200) })

export const queueSlotSchema = z.object({
  brandId: z.uuid(),
  socialAccountId: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  timeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Vreme u formatu HH:MM.' }),
})
export type QueueSlotInput = z.infer<typeof queueSlotSchema>

export const queueSlotsQuerySchema = z.object({ brandId: z.uuid() })

export const mediaListQuerySchema = z.object({
  brandId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  kind: z.enum(['image', 'video']).optional(),
})

/** Direktno otpremanje (D-082): korak 1 traži potpisan URL, korak 2 javlja da je fajl otpremljen. */
export const uploadTargetSchema = z.object({
  brandId: z.uuid(),
  mimeType: z.string().trim().min(3).max(100),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(10 * 1024 ** 3),
})

export const completeUploadSchema = z.object({
  brandId: z.uuid(),
  uploadId: z.uuid(),
  originalName: z.string().max(500).optional(),
})

export const platformSchema = platformEnum
