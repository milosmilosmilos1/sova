import { z } from 'zod'

export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(200).optional(),
})

export const transferOwnershipSchema = z.object({
  userId: z.uuid({ error: 'Izaberite novog vlasnika.' }),
})
