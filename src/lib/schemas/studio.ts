import { z } from 'zod'

import { contentLocaleSchema } from '@/config/locales'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { POST_FORMATS } from '@/config/post-formats'

/**
 * Studio kao razgovor (D-116): poruka korisnika, priložene fotografije iz biblioteke, objava koja je
 * otvorena desno (za izmene) i podešavanja sledeće objave (vrsta, mreže, jezik objave).
 */
export const STUDIO_TEXT_MAX = 2000
export const STUDIO_PHOTOS_MAX = 4
/** poruka na ekranu */
export const STUDIO_HISTORY = 60
/** poslednjih poruka koje model vidi */
export const STUDIO_CONTEXT = 12
/** poruka koje se čuvaju po razgovoru; starije se brišu */
export const STUDIO_KEEP = 200

const platformEnum = z.enum(Object.keys(PLATFORMS) as [SocialPlatform, ...SocialPlatform[]])

export const studioSettingsSchema = z.object({
  format: z.enum([...POST_FORMATS, 'auto']).default('auto'),
  /** prazno = mreže povezanih naloga */
  platforms: z.array(platformEnum).max(8).default([]),
  /** jezik objave; bez njega jezik brenda */
  locale: contentLocaleSchema.optional(),
})
export type StudioSettings = z.infer<typeof studioSettingsSchema>

export const studioMessageSchema = z.object({
  brandId: z.uuid(),
  text: z
    .string({ error: 'Napišite poruku.' })
    .trim()
    .min(1, { error: 'Napišite poruku.' })
    .max(STUDIO_TEXT_MAX, { error: 'Poruka može imati najviše 2.000 karaktera.' }),
  photoIds: z
    .array(z.uuid())
    .max(STUDIO_PHOTOS_MAX, { error: 'Uz poruku idu najviše četiri fotografije.' })
    .default([]),
  /** objava otvorena desno: na nju se odnose izmene („skrati opis”) */
  postId: z.uuid().optional(),
  settings: studioSettingsSchema.default({ format: 'auto', platforms: [] }),
})
export type StudioMessageInput = z.infer<typeof studioMessageSchema>

export const studioBrandQuerySchema = z.object({ brandId: z.uuid() })
