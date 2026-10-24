import { z } from 'zod'

export const connectProviderSchema = z.enum(['facebook', 'instagram', 'meta'])

export const connectQuerySchema = z.object({
  brandId: z.uuid({ error: 'Nedostaje brend.' }),
  redirectTo: z.string().max(200).optional(),
})

export const callbackQuerySchema = z.object({
  state: z.string().max(200).optional(),
  code: z.string().max(4000).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(500).optional(),
  error_reason: z.string().max(200).optional(),
})

export const providerParamSchema = z.object({ provider: z.string().min(1).max(40) })

export const socialAccountsQuerySchema = z.object({
  brandId: z.uuid(),
  pending: z.string().max(200).optional(),
})

export const activateAccountsSchema = z.object({
  brandId: z.uuid(),
  pendingState: z.string().min(8).max(200),
  ids: z.array(z.uuid()).max(50),
})
export type ActivateAccountsInput = z.infer<typeof activateAccountsSchema>

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
})
