import { z } from 'zod'

import { SUPPORT_QUESTION_MAX } from '@/lib/ai/prompts/support'

/** Chatbot podrške u prozoru „Vodič i podrška” (D-172). */
export const supportMessageSchema = z.object({
  brandId: z.uuid(),
  conversationId: z.uuid().optional(),
  text: z
    .string()
    .trim()
    .min(1, { error: 'Napišite pitanje.' })
    .max(SUPPORT_QUESTION_MAX, { error: 'Pitanje ima najviše 1.000 znakova.' }),
})
export type SupportMessageInput = z.infer<typeof supportMessageSchema>

export const supportThreadQuerySchema = z.object({ conversationId: z.uuid().optional() })

export const supportEscalateSchema = z.object({ conversationId: z.uuid() })
