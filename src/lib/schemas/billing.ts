import { z } from 'zod'

export const billingWorkspaceSchema = z.object({ workspaceId: z.uuid() })

export const checkoutSchema = z.object({
  workspaceId: z.uuid(),
  planCode: z.string().trim().min(2).max(40),
})

export const ledgerQuerySchema = z.object({
  workspaceId: z.uuid(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})
