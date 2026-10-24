import { z } from 'zod'

import { photoStyleSchema, type PhotoStyle } from '@/lib/brand/profile-schema'

/** Gemini vision nad 5–10 fotografija sa sajta → stil fotografije (brif 5.2). */
export const photoStyleOutputSchema = z.object({
  summary: z.string(),
  subjects: z.array(z.string()),
  lighting: z.string(),
  mood: z.string(),
  composition: z.string(),
  color_treatment: z.string(),
  has_people: z.boolean(),
  avoid: z.array(z.string()),
  image_prompt_suffix: z.string(),
  confidence: z.number().min(0).max(1),
})
export type PhotoStyleOutput = z.infer<typeof photoStyleOutputSchema>

export function photoStyleJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(photoStyleOutputSchema) as Record<string, unknown>
  delete schema.$schema
  return schema
}

export function buildPhotoStyleSystemPrompt(): string {
  return [
    'Ti si art direktor. Gledaš fotografije sa sajta jednog brenda i opisuješ njihov zajednički vizuelni stil,',
    'da bi nove AI slike za društvene mreže ličile na postojeće.',
    'Opisuj samo ono što vidiš; ne pogađaj naziv brenda ni delatnost ako se ne vidi.',
    'image_prompt_suffix je kratak dodatak za generator slika na engleskom (do 40 reči), npr. "natural daylight, warm tones, candid people at work, shallow depth of field, no text".',
    'avoid su stvari koje se na ovim fotografijama ne pojavljuju i koje bi odudarale (npr. neonske boje, stock osmesi).',
    'Ostala polja piši na srpskom latinicom. confidence je koliko su fotografije stilski ujednačene (0–1).',
    'Vraćaš isključivo JSON po zadatoj šemi.',
  ].join(' ')
}

export function buildPhotoStylePrompt(count: number, brandName: string): string {
  return `Priloženo je ${count} fotografija sa sajta brenda „${brandName}”. Opiši zajednički stil po šemi. Ako su fotografije stock ili nepovezane, reci to u summary i daj nisku pouzdanost.`
}

export function toPhotoStyle(o: PhotoStyleOutput): PhotoStyle {
  return photoStyleSchema.parse({
    summary: o.summary.trim().slice(0, 600),
    subjects: o.subjects
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    lighting: o.lighting.trim().slice(0, 120),
    mood: o.mood.trim().slice(0, 120),
    composition: o.composition.trim().slice(0, 200),
    color_treatment: o.color_treatment.trim().slice(0, 200),
    has_people: o.has_people,
    avoid: o.avoid
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6),
    image_prompt_suffix: o.image_prompt_suffix.trim().slice(0, 500),
  })
}
