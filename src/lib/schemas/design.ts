import { z } from 'zod'

import {
  PHOTO_SOURCES,
  POST_SIZES,
  SLIDES_DEFAULT,
  SLIDES_MAX,
  SLIDES_MIN,
  STYLE_IDS,
} from '@/lib/visuals/design/catalog'
import { FONT_NAME } from '@/lib/visuals/design/font-choices'
import { LOOK_IDS } from '@/lib/visuals/design/looks'

/** Dizajn brenda i pregled stilova (D-108). */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Boja se upisuje kao #RRGGBB.' })
  .transform((v) => v.toUpperCase())

export const designColorsSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  background: hexColorSchema,
  text: hexColorSchema,
  muted: hexColorSchema,
})
export type DesignColorsInput = z.infer<typeof designColorsSchema>

/** Google font (D-123): ime ide u URL Google Fonts-a, pa samo slova, brojevi i razmak. */
export const fontNameSchema = z.string().trim().regex(FONT_NAME, { error: 'Nepoznat font.' })
export const fontPairSchema = z.object({ headings: fontNameSchema, body: fontNameSchema })

/** Boje i fontovi sa poslednje posete sajtu (D-123), da se sajt ne otvara pri svakom izboru. */
export const siteVisualSchema = z.object({
  url: z.string().max(2000),
  at: z.string().max(40),
  source: z.enum(['site', 'profile']),
  primary: hexColorSchema,
  secondary: hexColorSchema,
  accent: hexColorSchema,
  light: hexColorSchema,
  dark: hexColorSchema,
  headings: fontNameSchema,
  body: fontNameSchema,
})

/** Ono što je sačuvano u `brands.design`; polje koje fali uzima vrednost iz profila brenda. */
export const storedDesignSchema = z
  .object({
    styleId: z.enum(STYLE_IDS),
    size: z.enum(POST_SIZES),
    photoSource: z.enum(PHOTO_SOURCES),
    slides: z.number().int().min(SLIDES_MIN).max(SLIDES_MAX),
    colors: designColorsSchema,
    handle: z.string().trim().max(40).nullable(),
    /** sopstveni logo (D-113); bez njega slajdovi uzimaju logo sa sajta */
    logoAssetId: z.uuid(),
    /** font koji je brend izabrao (D-123): važi u svakom stilu, umesto fonta sa sajta i fonta stila */
    fonts: fontPairSchema,
    /** izabrani izgled (D-123): jedan od tri predloga sa sajta ili sopstveni */
    look: z.enum(LOOK_IDS),
    siteVisual: siteVisualSchema,
  })
  .partial()
export type StoredDesign = z.infer<typeof storedDesignSchema>

export const updateDesignSchema = z
  .object({
    styleId: z.enum(STYLE_IDS).optional(),
    size: z.enum(POST_SIZES).optional(),
    photoSource: z.enum(PHOTO_SOURCES).optional(),
    slides: z.number().int().min(SLIDES_MIN).max(SLIDES_MAX).optional(),
    colors: designColorsSchema.optional(),
    /** prazno vraća nalog sa povezane mreže */
    handle: z
      .string()
      .trim()
      .max(40)
      .regex(/^@?[\p{L}\p{N}._-]*$/u, {
        error: 'Nalog sme da ima slova, brojeve, tačku, crticu i donju crtu.',
      })
      .nullable()
      .optional(),
    /** sopstveni logo iz biblioteke (D-113); null vraća logo sa sajta */
    logoAssetId: z.uuid().nullable().optional(),
    /** izabrani font (D-123); null vraća fontove sa sajta */
    fonts: fontPairSchema.nullable().optional(),
    /** izabrani izgled (D-123); null briše oznaku izbora */
    look: z.enum(LOOK_IDS).nullable().optional(),
    /** vraća sve na podrazumevano iz profila brenda */
    reset: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nema izmena.' })
export type UpdateDesignInput = z.infer<typeof updateDesignSchema>

export const previewSchema = z.object({
  brandId: z.uuid(),
  styleId: z.enum(STYLE_IDS),
  format: z.enum(['portrait', 'square', 'story']).default('portrait'),
  kind: z.enum(['cover', 'point', 'cta']).default('cover'),
  /** boje koje korisnik upravo menja, pre čuvanja */
  colors: designColorsSchema.optional(),
  /** sopstveni tekst slajda; bez njega ide primer na jeziku brenda */
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().max(300).optional(),
  withPhoto: z.boolean().default(true),
  /** font koji korisnik upravo bira (D-123); važi za naslov i tekst kao izabran font brenda */
  font: fontNameSchema.optional(),
})
export type PreviewInput = z.infer<typeof previewSchema>

export { SLIDES_DEFAULT }

/**
 * Isti pregled kroz GET (da ide direktno u <img src>): boje u parametru `c` kao
 * „RRGGBB-RRGGBB-RRGGBB-RRGGBB-RRGGBB” (primarna, sekundarna, pozadina, tekst, sporedni tekst).
 */
export const previewQuerySchema = z
  .object({
    brandId: z.uuid(),
    styleId: z.enum(STYLE_IDS),
    format: z.enum(['portrait', 'square', 'story']).default('portrait'),
    kind: z.enum(['cover', 'point', 'cta']).default('cover'),
    c: z
      .string()
      .regex(/^[0-9a-fA-F]{6}(-[0-9a-fA-F]{6}){4}$/)
      .optional(),
    photo: z.enum(['0', '1']).default('1'),
    f: fontNameSchema.optional(),
  })
  .transform((q): PreviewInput => {
    const [primary, secondary, background, text, muted] = (q.c?.split('-') ?? []).map(
      (h) => `#${h.toUpperCase()}`,
    )
    return {
      brandId: q.brandId,
      styleId: q.styleId,
      format: q.format,
      kind: q.kind,
      colors: q.c
        ? { primary: primary!, secondary: secondary!, background: background!, text: text!, muted: muted! }
        : undefined,
      withPhoto: q.photo === '1',
      font: q.f,
    }
  })
