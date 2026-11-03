import { describe, expect, it } from 'vitest'

import { readXOptions, xThreadParts } from '@/config/x'

import { composeXText, splitXThread, X_TEXT_MAX, xWeightedLength } from './x-text'

const sentence = (n: number) =>
  `Rečenica broj ${n} objašnjava jedan korak adaptacije stana bez stresa i bez skrivenih troškova.`

describe('nit na X-u (D-150)', () => {
  it('kratak tekst ostaje jedna objava, bez broja', () => {
    expect(splitXThread('Kratka objava.')).toEqual(['Kratka objava.'])
    expect(splitXThread('   ')).toEqual([])
  })

  it('dug tekst se deli po pasusima i rečenicama, svaki deo staje i nosi „1/n”', () => {
    const text = [
      [1, 2, 3].map(sentence).join(' '),
      [4, 5].map(sentence).join(' '),
      [6, 7, 8, 9].map(sentence).join(' '),
    ].join('\n\n')
    const parts = splitXThread(text)
    expect(parts.length).toBeGreaterThan(2)
    parts.forEach((p, i) => {
      expect(xWeightedLength(p), p).toBeLessThanOrEqual(X_TEXT_MAX)
      expect(p.endsWith(` ${i + 1}/${parts.length}`)).toBe(true)
    })
    // ništa se ne gubi: bez brojeva i razmaka ostaje isti tekst
    const joined = parts.map((p) => p.replace(/ \d+\/\d+$/, '')).join(' ')
    expect(joined.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
  })

  it('link se ne seče, a predugačka reč se seče po znakovima', () => {
    const link = 'https://adaptiko.rs/usluge/adaptacija-stanova-beograd?utm_source=x&utm_medium=social'
    const text = `${[1, 2, 3].map(sentence).join(' ')}\n\nViše na ${link}`
    const parts = splitXThread(text)
    expect(parts.some((p) => p.includes(link))).toBe(true)
    const long = 'a'.repeat(700)
    const cut = splitXThread(long, { numbered: false })
    expect(cut.join('')).toBe(long)
    cut.forEach((p) => expect(xWeightedLength(p)).toBeLessThanOrEqual(X_TEXT_MAX))
  })

  it('podešavanje: nit je uključena dok se ne isključi; link ide na kraj teksta', () => {
    expect(readXOptions({})).toEqual({ thread: true, numbered: true })
    const off = readXOptions({ x: { thread: false } })
    const long = [1, 2, 3, 4].map(sentence).join(' ')
    expect(xThreadParts(long, off)).toEqual([long])
    expect(
      xThreadParts(long, readXOptions({ x: { numbered: false } })).every((p) => !/\d+\/\d+$/.test(p)),
    ).toBe(true)
    expect(composeXText({ text: 'Tekst', link: 'https://a.rs' })).toBe('Tekst\n\nhttps://a.rs')
    expect(composeXText({ text: 'Tekst https://a.rs', link: 'https://a.rs' })).toBe('Tekst https://a.rs')
  })
})
