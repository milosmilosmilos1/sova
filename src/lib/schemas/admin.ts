import { z } from 'zod'

const uuid = z.uuid({ error: 'Neispravan identifikator.' })
const reason = z.string().trim().min(5, { error: 'Razlog mora imati bar 5 znakova.' }).max(300)

export const userActionParamsSchema = z.object({
  id: uuid,
  action: z.enum(['tokens', 'ban', 'unban', 'logout', 'resend-verification', 'delete']),
})

export const adjustTokensSchema = z.object({
  workspaceId: uuid,
  delta: z
    .number()
    .int()
    .min(-100000)
    .max(100000)
    .refine((v) => v !== 0, { error: 'Promena ne može biti 0.' }),
  reason,
})
export const banSchema = z.object({ reason })
export const deleteUserSchema = z.object({ confirmEmail: z.string().trim().min(3).max(320) })

export const flagParamsSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.-]{1,64}$/, { error: 'Neispravan ključ flaga.' }),
})
export const flagBodySchema = z.object({ enabled: z.boolean() })

export const settingParamsSchema = z.object({ key: z.enum(['token-prices', 'models', 'maintenance']) })
export const tokenPricesBodySchema = z.object({
  prices: z.record(z.string(), z.number().int().min(0).max(1000)),
})
export const modelsBodySchema = z.object({
  models: z.partialRecord(
    z.enum(['text', 'text_fallback', 'image', 'image_premium', 'image_fallback', 'embedding']),
    z.string().max(100).nullable(),
  ),
})
export const maintenanceBodySchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(300).default(''),
})

export const retryBodySchema = z.object({ targetId: uuid })

export const startImpersonationSchema = z.object({
  userId: uuid,
  reason: z.string().trim().min(10, { error: 'Razlog mora imati bar 10 znakova.' }).max(500),
  mode: z.enum(['read_only', 'full']).default('read_only'),
  confirmEmail: z.string().trim().max(320).optional(),
})

export const auditQuerySchema = z.object({
  admin: z.string().trim().max(200).optional(),
  action: z.string().trim().max(100).optional(),
  target: z.string().trim().max(200).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
})
