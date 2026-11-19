import { describe, expect, it } from 'vitest'

import {
  buildSupportPrompt,
  buildSupportSystemPrompt,
  cleanSupportAnswer,
  SUPPORT_ANSWER_MAX,
  SUPPORT_HISTORY,
  SUPPORT_QUESTION_MAX,
  SUPPORT_TAG,
  supportJsonSchema,
} from './support'

/** Chatbot podrške (D-172): uputstvo, podaci razgovora i čišćenje odgovora. */
describe('chatbot podrške: prompt (D-172)', () => {
  it('uputstvo nosi oznaku poziva, pravila i ceo tekst pomoći između oznaka', () => {
    const system = buildSupportSystemPrompt('## Povezivanje mreža\nKoraci…\n')
    expect(system.startsWith(`${SUPPORT_TAG}.`)).toBe(true)
    expect(system).toContain('isključivo na osnovu ZNANJA')
    expect(system).toContain('Nikad ne traži lozinku')
    expect(system).toContain('<<<ZNANJE>>>\n## Povezivanje mreža\nKoraci…\n<<<KRAJ ZNANJA>>>')
  })

  it('pitanje i ranije poruke su podaci; istorija ima najviše 12 poruka, pitanje 1.000 znakova', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      body: `poruka ${i}\n  sa novim redom`,
    }))
    const prompt = buildSupportPrompt({
      locale: 'en',
      brandName: 'Kafana Kod Mike',
      steps: [
        { title: 'Connect a network', done: true },
        { title: 'Describe the brand voice', done: false },
      ],
      history,
      question: `  ${'x'.repeat(SUPPORT_QUESTION_MAX + 50)}  `,
    })
    expect(prompt).toContain('JEZIK INTERFEJSA: engleski')
    expect(prompt).toContain('BREND KORISNIKA: Kafana Kod Mike')
    expect(prompt).toContain('1. Connect a network: urađeno')
    expect(prompt).toContain('2. Describe the brand voice: nije urađeno')
    expect(prompt).not.toContain('poruka 7')
    expect(prompt).toContain(`Korisnik: poruka ${20 - SUPPORT_HISTORY} sa novim redom`)
    expect(prompt).toContain('Sova: poruka 19 sa novim redom')
    const question = prompt
      .split('NOVO PITANJE KORISNIKA\n<<<PODACI>>>\n')[1]!
      .split('\n<<<KRAJ PODATAKA>>>')[0]!
    expect(question).toBe('x'.repeat(SUPPORT_QUESTION_MAX))
  })

  it('bez brenda, koraka i istorije ostaje samo jezik i pitanje', () => {
    const prompt = buildSupportPrompt({ locale: 'sr-Latn', history: [], question: 'Gde je kalendar?' })
    expect(prompt).toBe(
      'JEZIK INTERFEJSA: srpski, latinicom, sa „vi”\n\nNOVO PITANJE KORISNIKA\n<<<PODACI>>>\nGde je kalendar?\n<<<KRAJ PODATAKA>>>',
    )
  })

  it('odgovor bez markdown oznaka i viška praznih redova, ograničene dužine', () => {
    expect(cleanSupportAnswer('### Naslov\r\n**Bitno** i __podvučeno__\n\n\n\n* prvo\n• drugo')).toBe(
      'Naslov\nBitno i podvučeno\n\n- prvo\n- drugo',
    )
    expect(cleanSupportAnswer('a'.repeat(SUPPORT_ANSWER_MAX + 10))).toHaveLength(SUPPORT_ANSWER_MAX)
  })

  it('JSON šema traži odgovor i oznaku za podršku, bez $schema', () => {
    const schema = supportJsonSchema() as { properties: Record<string, unknown>; required: string[] }
    expect(Object.keys(schema.properties).sort()).toEqual(['answer', 'escalate'])
    expect(schema.required.sort()).toEqual(['answer', 'escalate'])
    expect(schema).not.toHaveProperty('$schema')
  })
})
