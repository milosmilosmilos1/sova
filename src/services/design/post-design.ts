import { z } from 'zod'

import { CONTENT_LOCALES } from '@/config/locales'
import { PLATFORMS } from '@/config/platforms'
import { PHOTO_SOURCES, POST_SIZES, STYLE_IDS } from '@/lib/visuals/design/catalog'

/**
 * Kontekst dizajnirane objave (`posts.design`, migracija 032): sve što „Generiši ponovo” treba da
 * napiše nov tekst i nacrta nove slajdove istim stilom. Upisuju ga „Nova objava” i tokovi.
 */
export const postDesignSchema = z.object({
  topic: z.string().min(1).max(2000),
  cta: z.string().max(300).nullable(),
  format: z.enum(['carousel', 'single', 'story']),
  styleId: z.enum(STYLE_IDS),
  slides: z.number().int().min(1).max(10),
  photoSource: z.enum(PHOTO_SOURCES),
  size: z.enum(POST_SIZES),
  locale: z.enum(CONTENT_LOCALES),
  platforms: z
    .array(z.enum(Object.keys(PLATFORMS) as [keyof typeof PLATFORMS, ...(keyof typeof PLATFORMS)[]]))
    .min(1),
  flowId: z.uuid().nullable().optional(),
  dmCta: z.boolean().optional(),
})
export type PostDesignContext = z.infer<typeof postDesignSchema>

export function parsePostDesign(value: unknown): PostDesignContext | null {
  const parsed = postDesignSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
