import { z } from 'zod'

import { emailSchema } from './auth'

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'editor', 'approver', 'viewer'])
export const assignableRoleSchema = z.enum(['admin', 'editor', 'approver', 'viewer'])
export const workspaceTypeSchema = z.enum(['business', 'agency'])

const name = z
  .string({ error: 'Unesite naziv.' })
  .trim()
  .min(1, { error: 'Unesite naziv.' })
  .max(100, { error: 'Naziv može imati najviše 100 karaktera.' })

export const websiteUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(
    z
      .string()
      .optional()
      .transform((v) => {
        if (!v) return undefined
        const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`
        return withProto
      })
      .refine(
        (v) => {
          if (!v) return true
          try {
            const u = new URL(v)
            return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
          } catch {
            return false
          }
        },
        { error: 'Unesite ispravnu adresu sajta, npr. https://primer.rs' },
      ),
  )

export const createWorkspaceSchema = z.object({
  name,
  type: workspaceTypeSchema.default('business'),
  brandName: name.optional(),
  websiteUrl: websiteUrlSchema,
})

export const updateWorkspaceSchema = z
  .object({
    name: name.optional(),
    type: workspaceTypeSchema.optional(),
    billingEmail: emailSchema.optional(),
    country: z
      .string()
      .length(2)
      .transform((v) => v.toUpperCase())
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Nema izmena.' })

export const updateMemberSchema = z
  .object({
    userId: z.uuid(),
    role: assignableRoleSchema.optional(),
    allBrands: z.boolean().optional(),
    brandIds: z.array(z.uuid()).max(100).optional(),
  })
  .refine((v) => v.role !== undefined || v.allBrands !== undefined || v.brandIds !== undefined, {
    error: 'Nema izmena.',
  })

export const removeMemberSchema = z.object({ userId: z.uuid() })

export const createInvitationSchema = z.object({
  workspaceId: z.uuid(),
  email: emailSchema,
  role: assignableRoleSchema,
  brandIds: z.array(z.uuid()).max(100).optional(),
})

/** IANA zona koju Intl poznaje (npr. Europe/Belgrade); nepoznata bi pokvarila računanje termina. */
function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
const timeZoneField = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isTimeZone, { error: 'Nepoznata vremenska zona.' })

export const createBrandSchema = z.object({
  workspaceId: z.uuid(),
  name,
  websiteUrl: websiteUrlSchema,
  timezone: timeZoneField.default('Europe/Belgrade'),
  contentLocale: z.enum(['sr-Latn', 'sr-Cyrl', 'en']).default('sr-Latn'),
})

export const updateBrandSchema = z
  .object({
    name: name.optional(),
    websiteUrl: websiteUrlSchema,
    timezone: timeZoneField.optional(),
    contentLocale: z.enum(['sr-Latn', 'sr-Cyrl', 'en']).optional(),
    status: z.enum(['active', 'paused', 'archived']).optional(),
    /** uz promenu zone: zakazane objave zadržavaju isto lokalno vreme (EDGE_CASES K7) */
    shiftSchedule: z.boolean().optional(),
    /** adrese klijenta za mesečni PDF izveštaj (D-094) */
    reportEmails: z
      .array(z.email({ error: 'Neispravna email adresa.' }).max(254))
      .max(5, { error: 'Najviše 5 adresa.' })
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nema izmena.' })

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  locale: z.enum(['sr-Latn', 'en']),
  timezone: timeZoneField,
})

export const uuidParamSchema = z.object({ id: z.uuid({ error: 'Neispravan identifikator.' }) })

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
export type CreateBrandInput = z.infer<typeof createBrandSchema>
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>
