import { z } from 'zod'

import { EDITABLE_PATHS, fieldPathSchema } from '@/lib/brand/profile-schema'

import { websiteUrlSchema } from './workspace'
import { BANNER_KINDS, BANNER_TEXT_LIMITS } from '@/config/profile-banners'

export const analyzeRequestSchema = z.object({
  websiteUrl: websiteUrlSchema,
})
export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>

export const crawlParamsSchema = z.object({
  id: z.uuid({ error: 'Neispravan identifikator.' }),
  crawlId: z.uuid({ error: 'Neispravan identifikator analize.' }),
})

export const profileChangeSchema = z.object({
  path: fieldPathSchema.refine((p) => (EDITABLE_PATHS as string[]).includes(p), {
    error: 'Ovo polje puni sistem i ne može ručno da se menja.',
  }),
  value: z.unknown(),
})

export const updateProfileSchema = z.object({
  changes: z.array(profileChangeSchema).min(1, { error: 'Nema izmena.' }).max(40),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const restoreProfileSchema = z.object({
  version: z.number().int().min(1),
})

export const unlockFieldsSchema = z.object({
  paths: z.array(fieldPathSchema).min(1).max(40),
})

/** Highlight po redu na profilu (D-144): brend i redni broj od 0. */
export const highlightParamsSchema = z.object({
  id: z.uuid(),
  index: z.coerce.number().int().min(0).max(9),
})

/** Naslovna slika profila (D-145): mreža i tekst iz upita; polje koje nije poslato dobija podrazumevano. */
export const bannerParamsSchema = z.object({ id: z.uuid(), kind: z.enum(BANNER_KINDS) })
export const bannerQuerySchema = z.object({
  title: z.string().max(BANNER_TEXT_LIMITS.title).optional(),
  subtitle: z.string().max(BANNER_TEXT_LIMITS.subtitle).optional(),
  footer: z.string().max(BANNER_TEXT_LIMITS.footer).optional(),
  logo: z.enum(['0', '1']).optional(),
  preview: z.enum(['1']).optional(),
  download: z.enum(['1']).optional(),
  /** menja adresu kad se promene boje ili tekst, da pregledač ne prikaže staru sliku */
  v: z.string().max(300).optional(),
})

/** Objava za vrh profila iz dodataka (D-146): redni broj u listi. */
export const pinnedParamsSchema = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0).max(9) })

/** Boja slika profila (D-148); `null` vraća prvu boju sa sajta. */
export const profileLookSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
})

/** Logo sa sajta koji korisnik bira među kandidatima sa početne strane (D-148). */
export const siteLogoPickSchema = z.object({ sourceUrl: z.url().max(2048) })
