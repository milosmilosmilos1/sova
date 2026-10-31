import { describe, expect, it } from 'vitest'

import { locales } from './config'
import en from './messages/en.json'
import enA from './messages/parts/a/en.json'
import srA from './messages/parts/a/sr-Latn.json'
import ukA from './messages/parts/a/uk.json'
import enB from './messages/parts/b/en.json'
import srB from './messages/parts/b/sr-Latn.json'
import ukB from './messages/parts/b/uk.json'
import enC from './messages/parts/c/en.json'
import srC from './messages/parts/c/sr-Latn.json'
import ukC from './messages/parts/c/uk.json'
import enD from './messages/parts/d/en.json'
import srD from './messages/parts/d/sr-Latn.json'
import ukD from './messages/parts/d/uk.json'
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
  // delovi (D-130) imaju svoje imenske prostore; preklapanje sa osnovnim fajlom bi tiho prepisalo poruke
  const merged = (base: Messages, ...parts: Messages[]) => {
    for (const part of parts)
      for (const key of Object.keys(part))
        if (key in base) throw new Error(`imenski prostor ${key} već postoji u osnovnom fajlu`)
    return flatten(Object.assign({}, base, ...parts))
  }
  const all = {
    'sr-Latn': merged(srLatn, srA, srB, srC, srD),
    en: merged(en, enA, enB, enC, enD),
    uk: merged(uk, ukA, ukB, ukC, ukD),
  }

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
