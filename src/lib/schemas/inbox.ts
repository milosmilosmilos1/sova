import { z } from 'zod'

/** Inbox i DM automatizacija (D-117). */
export const INBOX_KINDS = ['message', 'comment', 'review'] as const
export const REPLY_MAX = 2000

export const inboxQuerySchema = z.object({
  brandId: z.uuid(),
  kind: z.enum(INBOX_KINDS).default('message'),
  platform: z.enum(['instagram', 'facebook', 'google_business']).optional(),
  status: z.enum(['open', 'done', 'all']).default('all'),
})

export const threadParamsSchema = z.object({ id: z.uuid() })

export const replySchema = z.object({
  text: z
    .string({ error: 'Napišite odgovor.' })
    .trim()
    .min(1, { error: 'Napišite odgovor.' })
    .max(REPLY_MAX, { error: 'Odgovor može imati najviše 2.000 karaktera.' }),
})

export const threadStatusSchema = z.object({ status: z.enum(['open', 'done']) })

export const inboxSyncSchema = z.object({ brandId: z.uuid() })

const httpUrl = z
  .url({ error: 'Link nije ispravan.' })
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), { error: 'Link mora da počne sa https:// ili http://.' })

export const automationSchema = z.object({
  brandId: z.uuid(),
  accountId: z.uuid({ error: 'Izaberite nalog.' }),
  name: z
    .string({ error: 'Dajte toku ime.' })
    .trim()
    .min(1, { error: 'Dajte toku ime.' })
    .max(80, { error: 'Ime može imati najviše 80 karaktera.' }),
  keywords: z
    .array(z.string().trim().min(1).max(40))
    .min(1, { error: 'Dodajte bar jednu ključnu reč.' })
    .max(10, { error: 'Najviše 10 ključnih reči.' }),
  publicReplies: z.array(z.string().trim().max(300)).max(3).default([]),
  dmMessage: z
    .string({ error: 'Napišite poruku.' })
    .trim()
    .min(1, { error: 'Napišite poruku.' })
    .max(1000, { error: 'Poruka može imati najviše 1.000 karaktera.' }),
  linkUrl: httpUrl.nullable().optional(),
  linkLabel: z.string().trim().max(60).nullable().optional(),
  followUp: z.string().trim().max(1000).nullable().optional(),
  followUpHours: z.number().int().min(1).max(23).default(4),
  active: z.boolean().default(false),
})
export type AutomationInput = z.infer<typeof automationSchema>

/** Izmena: samo poslata polja (bez podrazumevanih vrednosti, da PATCH ne vrati staro na početno). */
export const automationUpdateSchema = z.object({
  name: automationSchema.shape.name.optional(),
  keywords: automationSchema.shape.keywords.optional(),
  publicReplies: z.array(z.string().trim().max(300)).max(3).optional(),
  dmMessage: automationSchema.shape.dmMessage.optional(),
  linkUrl: httpUrl.nullable().optional(),
  linkLabel: z.string().trim().max(60).nullable().optional(),
  followUp: z.string().trim().max(1000).nullable().optional(),
  followUpHours: z.number().int().min(1).max(23).optional(),
  active: z.boolean().optional(),
})
export const automationParamsSchema = z.object({ id: z.uuid() })
export const automationsQuerySchema = z.object({ brandId: z.uuid() })
