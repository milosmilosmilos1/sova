import { z } from "zod";

export const TONES = ["prijateljski", "profesionalan", "duhovit", "luksuzan"] as const;
export const LANGUAGES = ["sr", "en"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Najviše ${max} znakova.`)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v));

const hashtag = z
  .string()
  .trim()
  .transform((v) => v.replace(/^#+/, "").replace(/\s+/g, ""))
  .pipe(z.string().min(1).max(50));

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Boja mora biti u obliku #1A2B3C.");

export const businessSchema = z.object({
  name: z.string().trim().min(1, "Unesi ime biznisa.").max(100, "Najviše 100 znakova."),
  industry: optionalText(100),
  description: optionalText(1000),
  target_audience: optionalText(500),
  tone_of_voice: z.enum(TONES).nullable().optional().transform((v) => v ?? null),
  language: z.enum(LANGUAGES).default("sr"),
  website: optionalText(200),
  instagram: optionalText(100).transform((v) => (v ? v.replace(/^@/, "") : v)),
  brand_colors: z.array(hexColor).max(5, "Najviše 5 boja.").default([]),
  default_hashtags: z.array(hashtag).max(30, "Najviše 30 hashtag-ova.").default([]),
});

export type BusinessInput = z.infer<typeof businessSchema>;
