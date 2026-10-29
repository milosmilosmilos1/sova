import { z } from 'zod'

import { TEMPLATE_IDS } from '@/lib/visuals/templates'

export const unsplashSearchSchema = z.object({
  query: z.string().trim().min(2, { error: 'Upišite bar dva slova.' }).max(100),
  page: z.coerce.number().int().min(1).max(50).default(1),
  perPage: z.coerce.number().int().min(1).max(30).default(12),
  orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
  color: z
    .enum([
      'black_and_white',
      'black',
      'white',
      'yellow',
      'orange',
      'red',
      'purple',
      'magenta',
      'green',
      'teal',
      'blue',
    ])
    .optional(),
})
export type UnsplashSearchInput = z.infer<typeof unsplashSearchSchema>

/** Pexels (D-107): video snimci i fotografije; rezultati se prikazuju hotlinkom, kopija tek pri izboru. */
export const pexelsSearchSchema = z.object({
  query: z.string().trim().min(2, { error: 'Upišite bar dva slova.' }).max(100),
  kind: z.enum(['video', 'photo']).default('video'),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
})
export type PexelsSearchInput = z.infer<typeof pexelsSearchSchema>

export const pexelsSelectSchema = z.object({
  brandId: z.uuid(),
  id: z.number().int().positive(),
  kind: z.enum(['video', 'photo']),
})
export type PexelsSelectInput = z.infer<typeof pexelsSelectSchema>

export const unsplashSelectSchema = z.object({
  brandId: z.uuid(),
  photoId: z.string().trim().min(2).max(60),
})
export type UnsplashSelectInput = z.infer<typeof unsplashSelectSchema>

export const templateAspectSchema = z.enum(['1:1', '4:5', '9:16', '16:9', '3:4'])
export const templateIdSchema = z.enum(TEMPLATE_IDS as [string, ...string[]])

export const visualImageSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unsplash'),
    query: z.string().trim().min(2).max(100).optional(),
    photoId: z.string().trim().max(60).optional(),
  }),
  z.object({ kind: z.literal('asset'), mediaAssetId: z.uuid() }),
  z.object({ kind: z.literal('none') }),
])

export const visualTemplateSchema = z.object({
  brandId: z.uuid(),
  headline: z
    .string({ error: 'Upišite naslov.' })
    .trim()
    .min(3, { error: 'Naslov je prekratak.' })
    .max(120, { error: 'Naslov može imati najviše 120 karaktera.' }),
  subtext: z.string().trim().max(200).optional(),
  cta: z.string().trim().max(40).optional(),
  aspectRatio: templateAspectSchema.default('1:1'),
  template: z.union([z.literal('auto'), templateIdSchema]).default('auto'),
  image: visualImageSourceSchema.default({ kind: 'none' }),
  format: z.enum(['jpeg', 'png']).default('jpeg'),
})
export type VisualTemplateInput = z.infer<typeof visualTemplateSchema>

export const canvaDesignSchema = z.object({
  brandId: z.uuid(),
  mediaAssetId: z.uuid().optional(),
  title: z.string().trim().min(1).max(255).optional(),
  width: z.number().int().min(40).max(8000).optional(),
  height: z.number().int().min(40).max(8000).optional(),
})
export type CanvaDesignInput = z.infer<typeof canvaDesignSchema>

/** mp4 je video iz Canve: pozadinski posao (D-104), odgovor 202 sa ID-jem posla. */
export const canvaExportSchema = z.object({
  brandId: z.uuid(),
  designId: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, { error: 'Neispravan ID Canva dizajna.' }),
  format: z.enum(['png', 'jpg', 'mp4']).default('png'),
})
export type CanvaExportInput = z.infer<typeof canvaExportSchema>

export const canvaDesignListSchema = z.object({
  workspaceId: z.uuid(),
  query: z.string().trim().max(255).optional(),
  continuation: z.string().max(2000).optional(),
})
export type CanvaDesignListInput = z.infer<typeof canvaDesignListSchema>
