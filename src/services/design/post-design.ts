import { z } from 'zod'

import { CONTENT_LOCALES } from '@/config/locales'
import { PLATFORMS } from '@/config/platforms'
import { designColorsSchema, fontPairSchema } from '@/lib/schemas/design'
import { PHOTO_SOURCES, POST_SIZES, STYLE_IDS } from '@/lib/visuals/design/catalog'

/** Tekst jednog slajda kako ga je napisao Gemini (D-116: Studio menja pojedinačne slajdove). */
export const designSlideSchema = z.object({
  kind: z.enum(['cover', 'point', 'cta']),
  kicker: z.string().max(500).nullable().optional(),
  title: z.string().max(1000),
  body: z.string().max(3000).nullable().optional(),
  stat: z.string().max(500).nullable().optional(),
  items: z.array(z.string().max(1000)).max(20).nullable().optional(),
})

/**
 * Kontekst dizajnirane objave (`posts.design`, migracija 032): sve što „Generiši ponovo” treba da
 * napiše nov tekst i nacrta nove slajdove istim stilom. Upisuju ga „Nova objava” i tokovi.
 * `copy` je tekst slajdova i fotografije iz njih, da Studio može da ispravi jedan slajd i nacrta
 * ga ponovo sa istim fotografijama (objave pre D-116 ga nemaju).
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
  /** fotografije je dao korisnik: „Generiši ponovo” ih zadržava umesto da traži nove */
  ownPhotos: z.boolean().optional(),
  /** boje u kojima je objava nacrtana (D-121, D-125); po njima Sova zna da li je objava u temi brenda */
  colors: designColorsSchema.optional(),
  /** font u kom je objava nacrtana (D-125) */
  fonts: fontPairSchema.optional(),
  copy: z
    .object({
      slides: z.array(designSlideSchema).min(1).max(10),
      photoAssetIds: z.array(z.uuid()).max(10).default([]),
    })
    .optional(),
})
export type PostDesignContext = z.infer<typeof postDesignSchema>

/** Kontekst iz baze; neispravan tekst slajdova ne obara ostatak (objava se i dalje generiše ponovo). */
export function parsePostDesign(value: unknown): PostDesignContext | null {
  const parsed = postDesignSchema.safeParse(value)
  if (parsed.success) return parsed.data
  if (!value || typeof value !== 'object' || !('copy' in value)) return null
  const { copy: _copy, ...rest } = value as Record<string, unknown>
  const withoutCopy = postDesignSchema.safeParse(rest)
  return withoutCopy.success ? withoutCopy.data : null
}

/**
 * Tema u kojoj se objava crta (D-125): boje i font brenda u trenutku crtanja. Čuva se uz objavu, pa
 * „Uskladi nacrte” zna koje objave nisu u trenutnoj temi.
 */
export function themeOf(design: {
  colors: PostDesignContext['colors'] & object
  fonts: { headings: string; body: string }
}): Pick<PostDesignContext, 'colors' | 'fonts'> {
  return { colors: design.colors, fonts: design.fonts }
}
