import type { ContentLocale } from '@/config/locales'
import type { Testimonial } from '@/lib/schemas/brand-content'
import type { Slide } from '@/lib/visuals/design/types'

import type { KindTarget } from './index'

/**
 * Tekst objave po vrsti (D-165, faza 2): uputstvo modelu i podaci biznisa, plus provere u kodu.
 * Utisak klijenta se nikad ne prepušta modelu: citat na slajdu mora biti doslovan izvod iz utiska
 * (inače ga kod zameni početkom utiska), a ceo utisak sa imenom autora kod sam stavlja u opis.
 */
const SOURCE_LABEL: Record<Testimonial['source'], string> = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  website: 'sajt',
  direct: 'lično ili porukom',
  other: 'drugo',
}

const QUOTES: Record<ContentLocale, readonly [string, string]> = {
  'sr-Latn': ['„', '”'],
  'sr-Cyrl': ['„', '”'],
  en: ['“', '”'],
  uk: ['«', '»'],
}

function dataBlock(lines: Array<string | null | undefined>): string[] {
  return ['<<<PODACI>>>', ...lines.filter((l): l is string => Boolean(l)), '<<<KRAJ PODATAKA>>>']
}

/**
 * Uputstvo i podaci za tekst objave po vrsti; idu pre teme objave. `designed` je objava sa
 * slajdovima, `text` objava samo sa tekstom.
 */
export function kindCopyLines(target: KindTarget, mode: 'designed' | 'text'): string[] {
  const designed = mode === 'designed'
  const lines = (...items: Array<string | null | false>) => items.filter((l): l is string => Boolean(l))
  switch (target.kind) {
    case 'review': {
      const t = target.item
      return [
        'VRSTA OBJAVE: utisak klijenta. Utisak u podacima ispod je pravi i objavljuje se tačno kako je napisan.',
        ...lines(
          designed &&
            'Naslovni slajd: title je doslovan izvod iz utiska, jedna ili dve cele rečenice do 140 znakova, bez navodnika i bez ijedne promenjene reči; body null (Sova sama dodaje ime autora).',
          designed &&
            'Ako ima više slajdova, ostali govore o usluzi na koju se utisak odnosi, samo onim što piše u utisku i opisu brenda.',
          designed
            ? 'caption: jedna do dve rečenice uvoda (zahvalnost klijentu ili šta je urađeno) i poziv na akciju. Utisak ne prepisuj i ne prepričavaj: Sova ga sama stavlja na početak opisa, tačno kako je napisan.'
            : 'hook i body su kratak uvod (zahvalnost klijentu ili šta je urađeno), a cta poziv na akciju. Utisak ne prepisuj i ne prepričavaj: Sova ga sama stavlja na početak teksta, tačno kako je napisan.',
          'Ne izmišljaj druge utiske, klijente, ocene ni brojke.',
        ),
        'UTISAK KLIJENTA',
        ...dataBlock([
          `Autor: ${t.author}`,
          t.detail ? `O klijentu: ${t.detail}` : null,
          t.rating ? `Ocena: ${t.rating}/5` : null,
          `Izvor: ${SOURCE_LABEL[t.source]}`,
          `Utisak: ${t.text}`,
        ]),
        '',
      ]
    }
    case 'team': {
      const m = target.item
      return [
        'VRSTA OBJAVE: predstavljanje osobe iz tima, da publika vidi ko stoji iza brenda.',
        'Koristi samo podatke ispod: ime, ulogu, opis i zanimljivost. Ne izmišljaj godine iskustva, diplome, hobije, porodicu, citate ni izjave osobe.',
        ...lines(
          designed &&
            (m.photoAssetId
              ? 'Naslovni slajd: ime i uloga osobe; na slajdu je njena prava fotografija.'
              : 'Naslovni slajd: ime i uloga osobe; fotografije nema, pa tekst ne pominje sliku.'),
        ),
        'Ton je topao i ljudski, bez hvalospeva; poziv na akciju je prirodan (da upoznaju tim ili da se jave).',
        'OSOBA IZ TIMA',
        ...dataBlock([
          `Ime: ${m.name}`,
          `Uloga: ${m.role}`,
          m.bio ? `O osobi: ${m.bio}` : null,
          m.funFact ? `Zanimljivost: ${m.funFact}` : null,
        ]),
        '',
      ]
    }
    case 'before_after': {
      const p = target.item
      return [
        'VRSTA OBJAVE: rad pre i posle. Uz objavu idu dve prave fotografije tog rada: prvo stanje pre, pa rezultat posle.',
        ...lines(
          designed &&
            'Slajd 1 (cover) prati fotografiju pre: naslov počinje rečju „Pre” na jeziku objave. Slajd 2 (point) prati fotografiju posle: naslov počinje rečju „Posle”. Poslednji slajd (cta) je poziv na akciju.',
        ),
        'Opisuj samo ono što piše u podacima o radu; ne izmišljaj materijale, rokove, cene, površine ni utiske klijenta.',
        'RAD PRE I POSLE',
        ...dataBlock([`Naziv: ${p.title}`, p.note ? `Šta je urađeno: ${p.note}` : null]),
        '',
      ]
    }
    case 'interactive':
      return [
        'VRSTA OBJAVE: pitanje za publiku (anketa, kviz ili otvoreno pitanje). Cilj je da ljudi odgovore u komentarima.',
        designed
          ? 'Anketa: naslovni slajd postavlja pitanje, a 2 do 4 kratka ponuđena odgovora (A, B, C, D) idu u items ili body; poslednji slajd poziva da glasaju u komentarima. Kviz: pitanje i ponuđeni odgovori na početku, tačan odgovor tek na poslednjem slajdu.'
          : 'Tekst postavlja jedno jasno pitanje sa 2 do 4 kratka ponuđena odgovora (A, B, C, D) ili otvoreno pitanje i poziva da odgovore u komentarima.',
        'Pitanje je vezano za delatnost brenda i lako se odgovara. Ne obećavaj nagrade ni nagradne igre.',
        '',
      ]
    case 'humor':
      return [
        'VRSTA OBJAVE: humor iz struke. Lagana, prepoznatljiva situacija iz posla brenda ili iz života njegovih klijenata, koja nasmeje i podseti na brend.',
        'Bez ismevanja klijenata i konkurencije, bez psovki, politike, religije i šala na nečiji račun. Ne koristi tuđe memove, likove, citate iz filmova i serija ni poznate šablone.',
        'Šala je kratka; posle nje ide poenta ili poziv na akciju koji pristaje brendu.',
        '',
      ]
  }
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
const EDGE = /^[\s„“”"«»‚‘’'`….]+|[\s„“”"«»‚‘’'`…]+$/g
const QUOTE_CHARS = /[„“”"«»‚‘’'`]/g
const WORD = /[\p{L}\p{N}]/u

/** Početak utiska do `max` znakova: cele rečenice, a prva preduga rečenica se seče na celoj reči. */
export function leadExcerpt(text: string, max: number): string {
  const orig = collapse(text)
  if (orig.length <= max) return orig
  const sentences = (orig.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [orig]).map((s) => s.trim()).filter(Boolean)
  let out = ''
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s
    if (next.length > max) break
    out = next
  }
  if (out) return out
  const cut = orig.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`
}

/**
 * Citat za slajd: predlog modela ako je doslovan izvod iz utiska (cele reči, do `max` znakova),
 * vraćen sa pravopisom iz originala; inače početak utiska.
 */
export function verbatimExcerpt(text: string, candidate: string | null | undefined, max = 140): string {
  const orig = collapse(text)
  const cand = collapse((candidate ?? '').replace(EDGE, ''))
  const words = cand ? cand.split(' ').length : 0
  if (cand && cand.length <= max && (words >= 3 || cand.length === orig.length)) {
    const key = (s: string) => s.toLowerCase().replace(QUOTE_CHARS, '"')
    const o = key(orig)
    const c = key(cand)
    if (o.length === orig.length && c.length === cand.length) {
      for (let at = o.indexOf(c); at >= 0; at = o.indexOf(c, at + 1)) {
        const before = orig[at - 1]
        const after = orig[at + cand.length]
        if ((!before || !WORD.test(before)) && (!after || !WORD.test(after)))
          return orig.slice(at, at + cand.length)
      }
    }
  }
  return leadExcerpt(orig, max)
}

export function quoteMarks(locale: ContentLocale): readonly [string, string] {
  return QUOTES[locale]
}

/** „Marija P., vlasnica stana na Vračaru” */
export function reviewAttribution(t: Pick<Testimonial, 'author' | 'detail'>): string {
  return t.detail ? `${t.author}, ${t.detail}` : t.author
}

/** Ceo utisak tačno kako je unet, sa imenom autora i ocenom; ide na početak opisa objave. */
export function reviewQuoteBlock(t: Testimonial, locale: ContentLocale): string {
  const [open, close] = quoteMarks(locale)
  const stars = t.rating ? ` · ${'★'.repeat(t.rating)}` : ''
  return `${open}${t.text.trim()}${close}\n— ${reviewAttribution(t)}${stars}`
}

/** Kratak citat za X: početak utiska i ime autora, do 280 znakova. */
export function reviewShortQuote(t: Testimonial, locale: ContentLocale): string {
  const [open, close] = quoteMarks(locale)
  const tail = ` — ${t.author}`
  return `${open}${leadExcerpt(t.text, Math.max(40, 276 - tail.length))}${close}${tail}`
}

/**
 * Tekst dizajnirane objave sa utiskom: citat na naslovnom slajdu je doslovan, ispod je autor, a opis
 * počinje celim utiskom. Model piše samo uvod i poziv na akciju.
 */
export function applyReviewCopy<T extends { slides: Slide[]; caption: string; shortCaption: string }>(
  copy: T,
  t: Testimonial,
  locale: ContentLocale,
): T {
  const [open, close] = quoteMarks(locale)
  const [first, ...rest] = copy.slides
  const excerpt = verbatimExcerpt(t.text, first?.title)
  const cover: Slide = {
    ...(first ?? { kind: 'cover', kicker: null, items: null }),
    kind: 'cover',
    title: `${open}${excerpt}${close}`,
    body: `— ${reviewAttribution(t)}`,
    stat: null,
    kicker: t.rating ? `${t.rating}/5` : (first?.kicker ?? null),
    items: null,
  }
  return {
    ...copy,
    slides: [cover, ...rest],
    caption: `${reviewQuoteBlock(t, locale)}\n\n${copy.caption.trim()}`.trim(),
    shortCaption: reviewShortQuote(t, locale),
  }
}
