import { describe, expect, it } from 'vitest'

import { locales } from './config'
import en from './messages/en.json'
import srLatn from './messages/sr-Latn.json'
import uk from './messages/uk.json'

type Messages = { [key: string]: string | Messages }

function flatten(obj: Messages, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) }
  }, {})
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()

describe('poruke interfejsa (D-108)', () => {
  const all = { 'sr-Latn': flatten(srLatn), en: flatten(en), uk: flatten(uk) }

  it('svaki jezik interfejsa ima svoj fajl', () => {
    expect(Object.keys(all).sort()).toEqual([...locales].sort())
  })

  it('sva tri jezika imaju iste ključeve i iste promenljive', () => {
    const base = all['sr-Latn']
    for (const locale of ['en', 'uk'] as const) {
      expect(Object.keys(all[locale]).sort()).toEqual(Object.keys(base).sort())
      for (const [key, text] of Object.entries(base))
        expect(placeholders(all[locale][key] ?? ''), `${locale}: ${key}`).toEqual(placeholders(text))
    }
  })

  it('nijedna poruka nije prazna', () => {
    for (const messages of Object.values(all))
      for (const [key, text] of Object.entries(messages)) expect(text.trim(), key).not.toBe('')
  })
})
