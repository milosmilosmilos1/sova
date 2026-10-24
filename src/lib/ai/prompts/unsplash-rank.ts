import { z } from 'zod'

/** Vision rangiranje Unsplash kandidata po relevantnosti za temu i stil brenda (brif 6.2). */
export const rankOutputSchema = z.object({
  ranking: z.array(
    z.object({
      index: z.number().int().min(0),
      score: z.number().min(0).max(10),
      reason: z.string(),
    }),
  ),
})
export type RankOutput = z.infer<typeof rankOutputSchema>

export function rankJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(rankOutputSchema) as Record<string, unknown>
  delete schema.$schema
  return schema
}

export function buildRankSystemPrompt(): string {
  return [
    'Ti si art direktor koji bira fotografiju za objavu na društvenim mrežama.',
    'Dobijaš numerisane fotografije (redosled = index od 0) i opis objave i brenda.',
    'Oceni svaku od 0 do 10: relevantnost za temu, uklapanje u stil brenda, čitljivost kad se preko nje stavi tekst (mirna površina), bez vidljivih logotipa, teksta i prepoznatljivih tuđih brendova, bez stock osmeha ako brend nije takav.',
    'Vrati sve indekse, sortirane od najbolje ka najlošijoj, sa kratkim razlogom na srpskom.',
    'Vraćaš isključivo JSON po šemi.',
  ].join(' ')
}

export function buildRankPrompt(input: {
  headline: string
  topic?: string | null
  brandName: string
  photoStyle?: string | null
  count: number
}): string {
  return [
    `Brend: ${input.brandName}.`,
    input.photoStyle
      ? `Stil fotografija brenda: ${input.photoStyle}`
      : 'Stil brenda nije poznat; biraj prirodne, nenametljive fotografije.',
    `Naslov objave: ${input.headline}`,
    input.topic ? `Tema pretrage: ${input.topic}` : null,
    `Priloženo je ${input.count} fotografija. Rangiraj ih.`,
  ]
    .filter(Boolean)
    .join('\n')
}
