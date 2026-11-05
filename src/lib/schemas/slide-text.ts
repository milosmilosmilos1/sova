import { z } from 'zod'
import { SLIDES_MAX } from '@/lib/visuals/design/catalog'

/**
 * Tekst na slikama (D-129). Granice su šire od onoga što Sova piše sama (naslov do 60 znakova),
 * jer stil smanjuje slova da tekst stane; pregled pokazuje kako izgleda pre čuvanja.
 */
export const SLIDE_TEXT_LIMITS = { kicker: 40, title: 120, body: 320, stat: 16, item: 60, items: 6 } as const

export const slideTextSchema = z.object({
  kicker: z.string().max(SLIDE_TEXT_LIMITS.kicker).nullable().optional(),
  title: z.string().trim().min(1, 'Naslov ne može da bude prazan.').max(SLIDE_TEXT_LIMITS.title),
  body: z.string().max(SLIDE_TEXT_LIMITS.body).nullable().optional(),
  stat: z.string().max(SLIDE_TEXT_LIMITS.stat).nullable().optional(),
  items: z.array(z.string().max(SLIDE_TEXT_LIMITS.item)).max(SLIDE_TEXT_LIMITS.items).nullable().optional(),
})

/** Čuvanje: tekst svih slajdova redom, za verziju objave koju je korisnik video. */
export const slideTextSaveSchema = z.object({
  version: z.number().int().min(1),
  slides: z.array(slideTextSchema).min(1).max(SLIDES_MAX),
})
export type SlideTextSaveInput = z.infer<typeof slideTextSaveSchema>

/** Pregled jednog slajda sa tekstom koji se još kuca. */
export const slideTextPreviewSchema = z.object({
  index: z.number().int().min(0).max(9),
  slide: slideTextSchema,
})
export type SlideTextPreviewInput = z.infer<typeof slideTextPreviewSchema>
