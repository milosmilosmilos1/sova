import { z } from 'zod'

import type { SocialPlatform } from '@/config/platforms'
import { PROFILE_PLATFORMS } from '@/lib/ai/prompts/profile-bios'
import { extrasOutputSchema } from '@/lib/ai/prompts/profile-extras'

/**
 * Izmena i primena tekstova za profile (D-166). Granice mreža proverava servis, sa porukom koja kaže
 * koje polje je predugo.
 */
const platformSchema = z.enum(PROFILE_PLATFORMS as [SocialPlatform, ...SocialPlatform[]])

export const profileBioUpdateSchema = z.object({
  platform: platformSchema,
  entry: z.object({
    name: z.string().max(5000).optional(),
    short: z.string().max(5000).optional(),
    long: z.string().max(5000).optional(),
    keywords: z.array(z.string().max(500)).max(100).optional(),
  }),
})

export const profileExtrasUpdateSchema = z.object({ extras: extrasOutputSchema })

export const profileApplySchema = z.object({ platform: platformSchema })
