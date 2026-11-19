import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { company } from '@/config/company'

import { SOVA_HELP } from './sova-help'

/**
 * Tekst pomoći (D-172) je jedino znanje chatbota podrške: bez internih naziva i podataka korisnika, a
 * nazivi iz aplikacije moraju biti tačni, inače chatbot korisnika šalje na meni koji ne postoji.
 */
const MESSAGES = join(process.cwd(), 'src', 'i18n', 'messages')

/** Poruke interfejsa kao što ih aplikacija učitava: glavni fajl i delovi. */
function messages(locale: string): Record<string, unknown> {
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  return Object.assign(
    {},
    read(join(MESSAGES, `${locale}.json`)),
    ...['a', 'b', 'c', 'd'].map((p) => read(join(MESSAGES, 'parts', p, `${locale}.json`))),
  )
}

function strings(node: unknown, out = new Set<string>()): Set<string> {
  if (typeof node === 'string') out.add(node.trim())
  else if (node && typeof node === 'object') for (const v of Object.values(node)) strings(v, out)
  return out
}

/** Parovi „(EN: …, UK: …)”; naziv sme da ima svoje zagrade, npr. „Monthly report (PDF)”. */
function labelPairs(text: string): Array<{ en: string; uk: string }> {
  const pairs: Array<{ en: string; uk: string }> = []
  let at = text.indexOf('(EN: ')
  while (at >= 0) {
    const ukAt = text.indexOf(', UK: ', at)
    let depth = 1
    let i = ukAt + ', UK: '.length
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
    }
    pairs.push({ en: text.slice(at + 5, ukAt).trim(), uk: text.slice(ukAt + 6, i - 1).trim() })
    at = text.indexOf('(EN: ', i)
  }
  return pairs
}

describe('tekst pomoći za chatbot podrške (D-172)', () => {
  it('nema internih naziva servisa, putanja ni oznaka odluka', () => {
    const lower = SOVA_HELP.toLowerCase()
    for (const word of [
      'supabase',
      'netlify',
      'inngest',
      'upstash',
      'gemini',
      'stripe',
      'paddle',
      'resend',
      'sentry',
      'posthog',
      'turnstile',
      'vapid',
      'service role',
    ])
      expect(lower, word).not.toContain(word)
    expect(SOVA_HELP).not.toMatch(/\bD-\d{2,3}\b/)
    expect(SOVA_HELP).not.toMatch(/\/api\/|src\/|\.tsx?\b|process\.env/)
  })

  it('jedini email je email podrške koji aplikacija prikazuje', () => {
    // domen bez tačke na kraju: email na kraju rečenice
    const emails = new Set(SOVA_HELP.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])
    expect([...emails]).toEqual([company.supportEmail])
  })

  it('ključni koraci vodiča su navedeni tačno kao u aplikaciji', () => {
    const steps = (messages('sr-Latn').guide as { steps: Record<string, { title: string }> }).steps
    for (const { title } of Object.values(steps)) expect(SOVA_HELP).toContain(`„${title}”`)
  })

  it('svaki engleski i ukrajinski naziv postoji u porukama interfejsa', () => {
    const en = strings(messages('en'))
    const uk = strings(messages('uk'))
    const pairs = labelPairs(SOVA_HELP)
    expect(pairs.length).toBeGreaterThan(30)
    expect(pairs.filter((p) => !en.has(p.en)).map((p) => p.en)).toEqual([])
    expect(pairs.filter((p) => !uk.has(p.uk)).map((p) => p.uk)).toEqual([])
  })
})
