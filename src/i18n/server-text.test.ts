import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { translateFields, translateServerText } from './server-text'
import en from './server/en.json'
import uk from './server/uk.json'

/**
 * Poruke servera na jeziku korisnika (D-130). Test izvlači poruke iz koda (greške API-ja, provere
 * formi, prijava, prelazi statusa objave) i traži prevod za svaku; šablon sa promenljivim delom je
 * ključ sa {0}, {1}… `WRITE_SERVER_MISSING=putanja` upisuje spisak poruka bez prevoda.
 */
const ROOT = join(__dirname, '..')
const SERBIAN =
  /[čćšžđČĆŠŽĐ]|\b(nije|nema|niste|objav|nacrt|tokena|brend|mrež|nalog|lozink|korisni|izaber|pokušajte|proverite|unesite|sačekajte|dozvol|zahtev|podatak|pristup)|\s(je|su|se|za|na|da|od|sa|ili|kao|bez|još|ste|vas|vam)\s/i

/**
 * Fajlovi u kojima je svaki srpski string poruka korisniku: greške, obaveštenja (naslov i tekst),
 * greške objavljivanja na mrežama, istorija objave i rokovi Autopilota.
 */
const MESSAGE_FILES = [
  'lib/api/errors.ts',
  'lib/auth/actions.ts',
  'lib/auth/messages.ts',
  'lib/auth/impersonation-core.ts',
  'lib/posts/state-machine.ts',
  'config/notifications.ts',
  'services/account.ts',
  'services/analytics/insights.ts',
  'services/autopilot/deadlines.ts',
  'services/billing/daily.ts',
  'services/billing/events.ts',
  'services/posts/approval-links.ts',
  'services/posts/comments.ts',
  'services/posts/publisher.ts',
  'services/posts/system.ts',
  'services/posts/workflow.ts',
  'services/reports/monthly.ts',
  'services/social/refresh.ts',
]

/** Servisi čiji se `title`, `body`, `message` i `reason` prikazuju korisniku (obaveštenja, predlozi, napredak). */
const PROPERTY_DIRS = ['services/', 'lib/autopilot/', 'inngest/']

/** Sadržaj, ne poruke korisniku: primeri za pregled teme po jeziku objava i ime dizajna u Canvi. */
const CONTENT_FILES = ['services/design/preview.ts', 'services/canva/designs.ts']

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

/** Komentari napolje, da se ne broje kao poruke. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

/** Kraj string literala od pozicije početnog navodnika (šabloni sa ugnježdenim `${}`). */
function literalEnd(src: string, start: number): number {
  const quote = src[start]
  let depth = 0
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      i++
      continue
    }
    if (quote === '`') {
      if (c === '$' && src[i + 1] === '{') {
        depth++
        i++
        continue
      }
      if (c === '}' && depth > 0) {
        depth--
        continue
      }
      if (c === '`' && depth === 0) return i
    } else if (c === quote || c === '\n') return i
  }
  return -1
}

/** Tekst literala; `${…}` u šablonu postaje {0}, {1}… */
function literalText(raw: string): string {
  const quote = raw[0]
  let body = raw.slice(1, -1)
  if (quote === '`') {
    let out = ''
    let slot = 0
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '\\') {
        out += body[i]! + (body[i + 1] ?? '')
        i++
        continue
      }
      if (body[i] === '$' && body[i + 1] === '{') {
        let depth = 1
        let j = i + 2
        for (; j < body.length && depth > 0; j++) {
          if (body[j] === '{') depth++
          else if (body[j] === '}') depth--
        }
        out += `{${slot++}}`
        i = j - 1
        continue
      }
      out += body[i]
    }
    body = out
  }
  return body.replace(/\\n/g, '\n').replace(/\\(.)/g, '$1')
}

/** Svi srpski string literali u kodu. */
function serbianLiterals(src: string): string[] {
  const out: string[] = []
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c !== "'" && c !== '"' && c !== '`') continue
    const end = literalEnd(src, i)
    if (end < 0) continue
    const text = literalText(src.slice(i, end + 1))
    if (SERBIAN.test(text) && text.trim().length > 2) out.push(text)
    i = end
  }
  return out
}

/**
 * Poruke iz `new ApiError('KOD', '…')` i problemi sadržaja (`problems.push('…')`, `list.push('…')`),
 * koji idu u poruku „Objava nije spremna…”.
 */
function apiErrorMessages(src: string): string[] {
  const out: string[] = []
  const re =
    /new ApiError\(\s*'[A-Z_]+'\s*,\s*|\b(?:problems|list)\.push\(\s*|\bchangeSummary:\s*|\bsnapshotVersion\([^,()]+,[^,()]+,\s*|\btitle:\s*(?=`[^`]*\$\{)|\bnotifyOwner\([^,()]+,\s*'[a-z_]+',\s*|\b(?:translateServerText|tr)\(\s*/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const start = m.index + m[0].length
    const quote = src[start]
    if (quote !== "'" && quote !== '"' && quote !== '`') continue
    const end = literalEnd(src, start)
    if (end < 0) continue
    const text = literalText(src.slice(start, end + 1))
    if (SERBIAN.test(text)) out.push(text)
  }
  return out
}

/** Literali izraza od `start` do zareza, tačke-zareza ili zatvorene zagrade (i obe grane `a ? 'x' : 'y'`). */
function expressionLiterals(src: string, start: number): string[] {
  const out: string[] = []
  let depth = 0
  for (let i = start; i < src.length; i++) {
    const c = src[i]!
    if (c === "'" || c === '"' || c === '`') {
      const end = literalEnd(src, i)
      if (end < 0) break
      out.push(literalText(src.slice(i, end + 1)))
      i = end
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break
      depth--
    } else if ((c === ',' || c === ';') && depth === 0) break
  }
  return out
}

/**
 * Tekst koji server upisuje u polja koja korisnik vidi: naslov i tekst obaveštenja i predloga,
 * poruka napretka i provere kvaliteta, razlog preskočenog posla.
 */
function propertyMessages(src: string): string[] {
  const out: string[] = []
  const re = /\b(?:title|body|message|reason):\s*/g
  for (let m = re.exec(src); m; m = re.exec(src))
    for (const text of expressionLiterals(src, m.index + m[0].length))
      if (SERBIAN.test(text) && text.trim().length > 2) out.push(text)
  return out
}

function serverMessages(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    const src = stripComments(readFileSync(file, 'utf8'))
    const all = MESSAGE_FILES.includes(rel) || rel.startsWith('lib/schemas/')
    const properties =
      PROPERTY_DIRS.some((d) => rel.startsWith(d)) && !CONTENT_FILES.includes(rel)
        ? propertyMessages(src)
        : []
    for (const text of [...(all ? serbianLiterals(src) : apiErrorMessages(src)), ...properties])
      if (!found.has(text)) found.set(text, rel)
  }
  return found
}

/** Promenljive poruke; `{0|dan|dana}` je oblik reči uz broj iz promenljive 0. */
const slots = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]))].sort()
const hasPlural = (text: string) => /\{\w+\|[^{}]*\}/.test(text)

describe('poruke servera na jeziku korisnika (D-130)', () => {
  const messages = serverMessages()
  const dictionaries = { en: en as Record<string, string>, uk: uk as Record<string, string> }

  it('svaka poruka iz koda ima engleski i ukrajinski prevod', () => {
    const missing = [...messages.keys()].filter((m) => !(m in dictionaries.en) || !(m in dictionaries.uk))
    if (process.env.WRITE_SERVER_MISSING)
      writeFileSync(
        process.env.WRITE_SERVER_MISSING,
        JSON.stringify(Object.fromEntries(missing.map((m) => [m, messages.get(m)])), null, 2),
      )
    expect(missing).toEqual([])
  })

  it('prevod ima iste promenljive i nije prazan', () => {
    for (const [locale, dict] of Object.entries(dictionaries))
      for (const [key, text] of Object.entries(dict)) {
        expect(text.trim(), `${locale}: ${key}`).not.toBe('')
        // prevod sme da izostavi srpski oblik reči uz broj samo kad ga zameni svojim oblikom ({0|…})
        if (hasPlural(text))
          expect(slots(key), `${locale}: ${key}`).toEqual(expect.arrayContaining(slots(text)))
        else expect(slots(text), `${locale}: ${key}`).toEqual(slots(key))
      }
  })

  it('sastavljena poruka prevodi i svoje delove (status objave, problem na mreži)', () => {
    expect(translateServerText('Radnja nije moguća dok je objava „zakazano”.', 'en')).toBe(
      'This action isn’t possible while the post is “scheduled”.',
    )
    expect(
      translateServerText(
        'Objava nije spremna za zakazivanje. Instagram: Instagram objava mora imati bar jednu sliku ili video.',
        'uk',
      ),
    ).toBe(
      'Допис не готовий до планування. Instagram: Допис в Instagram має містити принаймні одне зображення або відео.',
    )
    expect(translateServerText('Tekst ima 2300 karaktera, a Instagram dozvoljava 2200.', 'en')).toBe(
      'The text has 2300 characters and Instagram allows 2200.',
    )
  })

  it('reč uz broj dobija oblik jezika: engleski dva, ukrajinski tri', () => {
    const linkedin = (days: number) =>
      `Firma: veza ističe za ${days} ${days === 1 ? 'dan' : 'dana'}. Povežite nalog ponovo na strani Mreže da objave ne bi stale.`
    expect(translateServerText(linkedin(1), 'en')).toContain('expires in 1 day.')
    expect(translateServerText(linkedin(3), 'en')).toContain('expires in 3 days.')
    expect(translateServerText(linkedin(1), 'uk')).toContain('через 1 день.')
    expect(translateServerText(linkedin(3), 'uk')).toContain('через 3 дні.')
    expect(translateServerText(linkedin(5), 'uk')).toContain('через 5 днів.')
  })

  it('obaveštenje od više rečenica bez šablona za celinu prevodi se rečenicu po rečenicu', () => {
    const weekly =
      'Prošle nedelje: 3 objava, doseg 120, angažovanje 15. Za nedelju od 2026-11-02: 1 nacrta. Čeka odobrenje: 1.'
    expect(translateServerText(weekly, 'en')).toBe(
      'Last week: 3 posts, reach 120, engagement 15. For the week of 2026-11-02: 1 draft. Waiting for approval: 1.',
    )
    expect(translateServerText('„Leto”: Tekst je prazan ili prekratak. Vizual je u redu.', 'uk')).toBe(
      '«Leto»: Текст порожній або закороткий. Візуал у порядку.',
    )
    // šablon sa dva problema: drugi problem je posebna rečenica posle šablona
    const notReady = translateServerText(
      'Objava nije spremna za zakazivanje. Instagram: Instagram objava mora imati bar jednu sliku ili video. Tekst ima 2300 karaktera, a Instagram dozvoljava 2200.',
      'en',
    )
    expect(notReady).toContain('The text has 2300 characters and Instagram allows 2200.')
    expect(notReady).not.toMatch(/objava|nije|karaktera/)
  })

  it('tačna poruka, šablon i ugnježdena poruka se prevode; nepoznata ostaje', () => {
    const exact = Object.keys(dictionaries.en).find((k) => !/\{\w+\}/.test(k))
    if (exact) expect(translateServerText(exact, 'en')).toBe(dictionaries.en[exact])
    expect(translateServerText('Ovo nije u rečniku.', 'en')).toBe('Ovo nije u rečniku.')
    expect(translateServerText('Bilo šta', 'sr-Latn')).toBe('Bilo šta')
    const forbidden = 'Nemate dozvolu za ovu radnju.'
    if (forbidden in dictionaries.uk)
      expect(translateFields({ x: [forbidden] }, 'uk')).toEqual({ x: [dictionaries.uk[forbidden]] })
  })
})
