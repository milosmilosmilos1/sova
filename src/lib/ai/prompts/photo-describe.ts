import { z } from 'zod'

import { WRITE_IN, type ContentLocale } from '@/config/locales'

/**
 * Opis fotografije iz galerije (D-114): jedna rečenica šta se vidi i pojmovi za pretragu na jeziku
 * brenda i na engleskom (upit za vizual iz teksta objave je na engleskom), da Sova izabere pravu
 * fotografiju za temu.
 */
export const photoDescribeOutputSchema = z.object({
  description: z.string(),
  tags: z.array(z.string()),
  tags_en: z.array(z.string()),
})
export type PhotoDescribeOutput = z.infer<typeof photoDescribeOutputSchema>

export function photoDescribeJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(photoDescribeOutputSchema) as Record<string, unknown>
  delete schema.$schema
  return schema
}

export function buildPhotoDescribeSystemPrompt(): string {
  return [
    'Ti si Sova i opisuješ fotografije iz galerije brenda da bi se kasnije izabrala prava fotografija za objavu.',
    'Opisuješ samo ono što se vidi: ljude, prostor, predmete, proizvod, aktivnost i atmosferu.',
    'Ne nagađaš imena ljudi, nazive firmi ni mesta koja se ne vide jasno na fotografiji.',
    'Vraćaš isključivo JSON po zadatoj šemi.',
  ].join(' ')
}

export function buildPhotoDescribePrompt(input: { brandName: string; locale: ContentLocale }): string {
  return [
    WRITE_IN[input.locale],
    `Brend: ${input.brandName}`,
    '',
    'description: jedna rečenica do 160 znakova o tome šta je na fotografiji.',
    'tags: 3 do 6 kratkih pojmova (jedna ili dve reči) na istom jeziku kao opis.',
    'tags_en: isti pojmovi na engleskom.',
  ].join('\n')
}

/** Odgovor u granicama: opis do 300 znakova, ukupno najviše 12 tagova, mala slova, bez duplikata. */
export function normalizePhotoDescription(out: PhotoDescribeOutput): { description: string; tags: string[] } {
  const description = out.description.replace(/\s+/g, ' ').trim().slice(0, 300)
  const tags: string[] = []
  for (const raw of [...out.tags, ...out.tags_en]) {
    const t = raw.replace(/^#/, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase().slice(0, 40)
    if (t.length >= 2 && !tags.includes(t)) tags.push(t)
    if (tags.length >= 12) break
  }
  return { description, tags }
}
