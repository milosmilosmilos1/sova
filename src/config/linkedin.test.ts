import { describe, expect, it } from 'vitest'

import { linkedinAsDocument, linkedinDocumentTitle, readLinkedInOptions } from './linkedin'

describe('LinkedIn karusel kao PDF dokument (D-149)', () => {
  it('automatski: slajdovi Sove idu kao dokument, fotografije kao mreža, jedna slika nikad', () => {
    const auto = readLinkedInOptions({})
    expect(auto.carousel).toBe('auto')
    expect(linkedinAsDocument(auto, 5, true)).toBe(true)
    expect(linkedinAsDocument(auto, 5, false)).toBe(false)
    expect(linkedinAsDocument(auto, 1, true)).toBe(false)
    expect(linkedinAsDocument(readLinkedInOptions({ linkedin: { carousel: 'document' } }), 2, false)).toBe(
      true,
    )
    expect(linkedinAsDocument(readLinkedInOptions({ linkedin: { carousel: 'images' } }), 6, true)).toBe(false)
    // nepoznata vrednost ne obara objavu
    expect(readLinkedInOptions({ linkedin: { carousel: 'pdf' } }).carousel).toBe('auto')
  })

  it('naslov dokumenta: iz podešavanja, pa naslov objave, pa prvi red teksta', () => {
    const o = readLinkedInOptions({ linkedin: { documentTitle: '  Vodič  ' } })
    expect(linkedinDocumentTitle(o, 'Naslov', 'Tekst')).toBe('Vodič')
    expect(linkedinDocumentTitle(readLinkedInOptions({}), 'Naslov objave', 'Tekst')).toBe('Naslov objave')
    expect(linkedinDocumentTitle(readLinkedInOptions({}), null, '\n\nPrvi red\nDrugi red')).toBe('Prvi red')
    expect(linkedinDocumentTitle(readLinkedInOptions({}), null, '')).toBe('Dokument')
    expect(linkedinDocumentTitle(readLinkedInOptions({}), '  ', 'Prvi red')).toBe('Prvi red')
  })
})
