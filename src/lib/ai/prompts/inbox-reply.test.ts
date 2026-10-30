import { describe, expect, it } from 'vitest'

import { buildInboxReplyPrompt, inboxReplyJsonSchema } from './inbox-reply'

/** Predlog odgovora u Inbox-u (D-117). */
const brand = {
  name: 'Klima Servis',
  locale: 'sr-Latn' as const,
  address: 'vi' as const,
  emoji: false,
  forbiddenWords: [],
  tone: 'ljubazan',
  description: null,
  facts: [],
}

describe('predlog odgovora', () => {
  it('komentar: javni odgovor je kratak, objava i razgovor su podaci', () => {
    const prompt = buildInboxReplyPrompt({
      brand,
      kind: 'comment',
      platform: 'instagram',
      rating: null,
      postExcerpt: 'Letnji servis klima',
      messages: [
        { direction: 'in', author: 'ana', body: 'Koja je cena?' },
        { direction: 'out', author: null, body: 'Poslali smo u poruke.' },
      ],
    })
    expect(prompt).toContain('javni komentar ispod objave (instagram)')
    expect(prompt).toContain('pozovi u poruke')
    expect(prompt).toContain('OBJAVA ISPOD KOJE JE KOMENTAR')
    expect(prompt).toContain('ana: Koja je cena?')
    expect(prompt).toContain('Brend: Poslali smo u poruke.')
  })

  it('recenzija nosi ocenu, a šema traži samo tekst odgovora', () => {
    const prompt = buildInboxReplyPrompt({
      brand,
      kind: 'review',
      platform: 'google_business',
      rating: 2,
      postExcerpt: null,
      messages: [{ direction: 'in', author: 'Petar', body: 'Kasnili ste dva sata.' }],
    })
    expect(prompt).toContain('Ocena u recenziji: 2 od 5.')
    expect(prompt).not.toContain('OBJAVA ISPOD')
    const schema = inboxReplyJsonSchema()
    expect(schema.$schema).toBeUndefined()
    expect((schema.required as string[]) ?? []).toEqual(['reply'])
  })
})
