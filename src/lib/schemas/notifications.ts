import { z } from 'zod'

import { NOTIFICATION_TYPE_KEYS } from '@/config/notifications'

const uuid = z.uuid({ error: 'Neispravan identifikator.' })

export const listNotificationsQuerySchema = z.object({
  workspaceId: uuid.optional(),
  unread: z.enum(['1', '0', 'true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>

export const markReadSchema = z
  .object({
    ids: z.array(uuid).max(200).optional(),
    all: z.boolean().optional(),
    workspaceId: uuid.optional(),
  })
  .refine((v) => v.all || (v.ids?.length ?? 0) > 0, { error: 'Navedite ids ili all.' })
export type MarkReadInput = z.infer<typeof markReadSchema>

export const preferencesQuerySchema = z.object({ workspaceId: uuid })

export const preferencesBodySchema = z.object({
  workspaceId: uuid,
  items: z
    .array(
      z.object({
        type: z.enum(NOTIFICATION_TYPE_KEYS as [string, ...string[]]),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .min(1)
    .max(NOTIFICATION_TYPE_KEYS.length),
})
export type PreferencesBody = z.infer<typeof preferencesBodySchema>

export const targetActionParamsSchema = z.object({
  id: uuid,
  targetId: uuid,
  action: z.enum(['retry', 'assisted-done']),
})
export const targetActionBodySchema = z
  .object({
    permalink: z.url({ error: 'Link nije ispravan.' }).max(500).nullable().optional(),
  })
  .partial()
