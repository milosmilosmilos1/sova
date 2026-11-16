import { z } from 'zod'

/**
 * Provera ljudi na fotografijama i snimcima pre automatskog izbora (D-154): na slikama za tržište
 * Balkana smeju biti samo ljudi evropskog izgleda. Oznaka na početku uputstva razlikuje ovaj poziv
 * od ostalih (lažni Gemini u testovima odgovara na njega posebno).
 */
export const PEOPLE_CHECK_TAG = 'PROVERA LJUDI'

export const PEOPLE_VERDICTS = ['none', 'european', 'other', 'unclear'] as const
export type PeopleVerdict = (typeof PEOPLE_VERDICTS)[number]

export const peopleCheckSchema = z.object({
  items: z.array(z.object({ index: z.number().int().min(0), verdict: z.enum(PEOPLE_VERDICTS) })),
})
export type PeopleCheckOutput = z.infer<typeof peopleCheckSchema>

export function peopleCheckJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(peopleCheckSchema) as Record<string, unknown>
  delete schema.$schema
  return schema
}

/** Sova uzima sliku bez ljudi, sa ljudima evropskog izgleda ili sa ljudima čiji se izgled ne vidi. */
export function verdictAllowed(verdict: PeopleVerdict): boolean {
  return verdict !== 'other'
}

export function buildPeopleCheckSystemPrompt(): string {
  return [
    `${PEOPLE_CHECK_TAG}.`,
    'Ti si urednik fotografije za objave brendova iz Srbije i regiona; publika je na Balkanu i u Evropi.',
    'Pravilo kastinga: na slici smeju biti samo ljudi evropskog izgleda, kao stanovnici Srbije i Balkana.',
    'Dobijaš numerisane slike (redosled = index od 0). Slika snimka su tri kadra istog snimka jedan pored drugog; oceni ih zajedno.',
    'Za svaku sliku vrati verdict:',
    '"none" kad na slici nema ljudi (ni lica, ni ruku, ni dela tela);',
    '"european" kad su svi ljudi koji se vide evropskog izgleda;',
    '"other" kad bar jedna osoba, ili samo njene ruke ili koža, nije evropskog izgleda (crni ljudi, ljudi afričkog, istočnoazijskog, južnoazijskog, bliskoistočnog ili latinoameričkog izgleda);',
    '"unclear" kad se ljudi vide samo kao senke, izdaleka, s leđa ili mutno, bez vidljive kože ili lica.',
    'Kad se dvoumiš između "european" i "other", vrati "other".',
    'Vrati sve indekse. Vraćaš isključivo JSON po šemi.',
  ].join(' ')
}

export function buildPeopleCheckPrompt(count: number): string {
  return `Priloženo je ${count} slika. Za svaku vrati index i verdict.`
}
