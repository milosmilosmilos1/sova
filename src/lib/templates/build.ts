import { INTL_LOCALE, type ContentLocale } from '@/config/locales'
import { isForeign } from '@/lib/content-language'
import type { Slide } from '@/lib/visuals/design/types'

import type { TemplateFormat, TemplateId } from './catalog'
import { fill, PHRASES, toCyrillic, type Phrases } from './phrases'

/**
 * Slajdovi i opis iz šablona (D-175), bez AI-ja: tekst je tačno ono što je korisnik upisao, a Sova
 * dodaje samo kratke stalne reči (oznake, poziv da se glasa ili prijavi) na jeziku objava brenda.
 * Fotografije idu redom na slajdove koji ih crtaju; pre i posle kao jedna slika je spoj dve
 * fotografije koji pravi server.
 */
export interface TemplateBuild {
  slides: Slide[]
  /** fotografije redom (prva na naslovni slajd), samo korisnikove */
  photos: string[]
  /** pre i posle na jednoj slici: server spaja dve fotografije u jednu, levo pre, desno posle */
  composite: { before: string; after: string } | null
  caption: string
  /** naziv nacrta u listama */
  title: string
}

export interface BuildOptions {
  format: TemplateFormat
  locale: ContentLocale
  /** poziv na akciju iz glasa brenda (kompletan brend ga ima) */
  cta: string
}

type V = Record<string, unknown>

const str = (v: V, key: string): string => (typeof v[key] === 'string' ? (v[key] as string).trim() : '')
const strs = (v: V, key: string): string[] =>
  Array.isArray(v[key])
    ? (v[key] as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim())
    : []
const id = (v: V, key: string): string | null =>
  typeof v[key] === 'string' && v[key] ? (v[key] as string) : null

/** Skraćuje na granici reči, sa trotačkom. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

const TITLE = 120
const BODY = 200
/** duži tekst ide u manji red ispod naslova */
const LONG = 280
const ITEM = 60

/** Spisak u tekstu slajda, red po red: svaki stil crta tekst, a `items` crta samo stil „Lista”. */
const lines = (items: string[]) => items.join('\n')

/** Datum iz polja (YYYY-MM-DD) na jeziku objave, bez tačke na kraju (rečenica je dodaje). */
export function formatDay(day: string, locale: ContentLocale): string {
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  const text = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: locale === 'en' ? 'long' : 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return text.replace(/\.$/, '')
}

const paragraphs = (...parts: Array<string | null | undefined | false>) =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join('\n\n')

const letter = (i: number) => String.fromCharCode(65 + i)

/** Stalne reči na jeziku objava; ćirilica je prevod latinice (podaci se ubacuju posle, neprevedeni). */
function phrasesFor(locale: ContentLocale): Phrases {
  if (locale === 'en') return PHRASES.en
  if (locale === 'sr-Cyrl')
    return Object.fromEntries(
      Object.entries(PHRASES['sr-Latn']).map(([k, val]) => [k, toCyrillic(val)]),
    ) as unknown as Phrases
  return PHRASES['sr-Latn']
}

function ctaSlide(p: Phrases, cta: string): Slide {
  return { kind: 'cta', title: clip(cta || p.ctaFallback, 70), body: null }
}

/** Slajdovi po obliku: slika ima samo naslovni, priča najviše tri, karusel sve uz poziv na kraju. */
function shape(format: TemplateFormat, cover: Slide, rest: Slide[], cta: Slide | null): Slide[] {
  if (format === 'image') return [cover]
  if (format === 'story') return [cover, ...rest].slice(0, 3)
  return [cover, ...rest, ...(cta ? [cta] : [])]
}

export function buildTemplate(templateId: TemplateId, values: V, opts: BuildOptions): TemplateBuild {
  const p = phrasesFor(opts.locale)
  const L = opts.locale
  // jedan jezik u objavi: poziv na akciju iz glasa brenda na drugom jeziku ne ide u objavu, već kratak
  // poziv na jeziku objave
  const cta = isForeign(opts.cta, L) ? '' : opts.cta.trim()
  const q = (text: string) => (L === 'en' ? `“${text}”` : `„${text}”`)
  const day = (key: string) => (str(values, key) ? formatDay(str(values, key), L) : '')
  const photo = id(values, 'photo')
  const own = photo ? [photo] : []
  const out = (slides: Slide[], caption: string, title: string, photos: string[] = own): TemplateBuild => ({
    slides,
    photos,
    composite: null,
    caption: caption.trim(),
    title: clip(title, 200),
  })

  switch (templateId) {
    case 'team': {
      const name = str(values, 'name')
      const role = str(values, 'role')
      const bio = str(values, 'bio')
      const fun = str(values, 'funFact')
      const cover: Slide = { kind: 'cover', kicker: p.team, title: clip(name, 70), body: clip(role, BODY) }
      const rest: Slide[] = [
        ...(bio
          ? [{ kind: 'point', kicker: clip(name, 40), title: clip(role, 70), body: clip(bio, LONG) } as Slide]
          : []),
        ...(fun
          ? [{ kind: 'point', kicker: clip(name, 40), title: p.funFact, body: clip(fun, BODY) } as Slide]
          : []),
      ]
      const caption = paragraphs(fill(p.teamIntro, name, role), bio, fun && `${p.funFact}: ${fun}`, cta)
      return out(shape(opts.format, cover, rest, ctaSlide(p, cta)), caption, `${p.team}: ${name}`)
    }
    case 'testimonial': {
      const quote = str(values, 'quote')
      const author = str(values, 'author')
      const detail = str(values, 'detail')
      const rating = typeof values.rating === 'number' ? values.rating : null
      const who = detail ? `${author}, ${detail}` : author
      const cover: Slide = {
        kind: 'cover',
        kicker: rating ? `${rating}/5` : p.testimonial,
        title: q(clip(quote, 140)),
        body: `— ${clip(who, 90)}`,
      }
      const stars = rating ? ` · ${'★'.repeat(rating)}` : ''
      const caption = paragraphs(`${q(quote)}\n— ${who}${stars}`, p.thanksTrust, cta)
      return out(shape(opts.format, cover, [], ctaSlide(p, cta)), caption, `${p.testimonial}: ${author}`)
    }
    case 'before_after': {
      const before = id(values, 'before')!
      const after = id(values, 'after')!
      const title = str(values, 'title')
      const note = str(values, 'note')
      if (opts.format === 'image') {
        const slide: Slide = { kind: 'cover', kicker: p.beforeAfter, title: clip(title, 70), body: null }
        return {
          slides: [slide],
          photos: [],
          composite: { before, after },
          caption: paragraphs(title, note, p.leftRight, cta),
          title: clip(`${p.beforeAfter}: ${title}`, 200),
        }
      }
      const slides: Slide[] = [
        { kind: 'cover', kicker: p.before, title: clip(title, 70), body: null },
        { kind: 'point', kicker: p.after, title: clip(title, 70), body: note ? clip(note, BODY) : null },
      ]
      if (opts.format === 'carousel') slides.push(ctaSlide(p, cta))
      return out(slides, paragraphs(title, note, p.firstSecond, cta), `${p.beforeAfter}: ${title}`, [
        before,
        after,
      ])
    }
    case 'case_study': {
      const client = str(values, 'client')
      const problem = str(values, 'problem')
      const solution = str(values, 'solution')
      const result = str(values, 'result')
      const resultNote = str(values, 'resultNote')
      // rezultat je u naslovu: istaknut broj (`stat`) crta samo stil „Statistika”
      const cover: Slide = {
        kind: 'cover',
        kicker: p.caseStudy,
        stat: clip(result, 16),
        title: clip(`${client}: ${result}`, 90),
        body: resultNote ? clip(resultNote, BODY) : null,
      }
      const rest: Slide[] = [
        { kind: 'point', kicker: clip(client, 40), title: p.challenge, body: clip(problem, LONG) },
        { kind: 'point', kicker: clip(client, 40), title: p.whatWeDid, body: clip(solution, LONG) },
        {
          kind: 'point',
          kicker: p.result,
          stat: clip(result, 16),
          title: clip(result, 40),
          body: resultNote ? clip(resultNote, BODY) : null,
        },
      ]
      const caption = paragraphs(
        `${client}: ${result}${resultNote ? ` (${resultNote})` : ''}.`,
        `${p.challenge}: ${problem}`,
        `${p.whatWeDid}: ${solution}`,
        cta,
      )
      return out(shape(opts.format, cover, rest, ctaSlide(p, cta)), caption, `${p.caseStudy}: ${client}`)
    }
    case 'behind_scenes': {
      const photos = strs(values, 'photos')
      const title = str(values, 'title')
      const text = str(values, 'text')
      const n = opts.format === 'story' ? Math.min(photos.length, 3) : photos.length
      const slides: Slide[] = Array.from({ length: n }, (_, i) =>
        i === 0
          ? {
              kind: 'cover',
              kicker: p.behindScenes,
              title: clip(title, 70),
              body: text ? clip(text, BODY) : null,
            }
          : { kind: 'point', kicker: `${i + 1}/${n}`, title: clip(title, 70), body: null },
      )
      return out(slides, paragraphs(title, text, cta), `${p.behindScenes}: ${title}`, photos.slice(0, n))
    }
    case 'quiz': {
      const question = str(values, 'question')
      const answers = strs(values, 'answers')
      const correct = typeof values.correct === 'number' ? values.correct : 0
      const explanation = str(values, 'explanation')
      const options = answers.map((a, i) => clip(`${letter(i)}) ${a}`, ITEM))
      // odgovori su u tekstu slajda, red po red: spisak (`items`) crta samo stil „Lista”
      const cover: Slide = {
        kind: 'cover',
        kicker: p.quiz,
        title: clip(question, TITLE),
        body: lines(options),
        items: options,
      }
      const answer: Slide = {
        kind: 'point',
        kicker: p.correctAnswer,
        title: options[correct] ?? '',
        body: explanation ? clip(explanation, BODY) : null,
      }
      const slides = opts.format === 'story' ? [cover, answer] : [cover, answer, ctaSlide(p, cta)]
      const caption = paragraphs(
        `${p.quiz}: ${question}`,
        answers.map((a, i) => `${letter(i)}) ${a}`).join('\n'),
        opts.format === 'story' ? p.quizStory : p.quizCarousel,
      )
      return out(slides, caption, `${p.quiz}: ${question}`, [])
    }
    case 'poll': {
      const question = str(values, 'question')
      const options = strs(values, 'options').map((o, i) => `${i + 1}. ${o}`)
      const shown = options.map((o) => clip(o, ITEM))
      const cover: Slide = {
        kind: 'cover',
        kicker: p.poll,
        title: clip(question, TITLE),
        body: lines(shown),
        items: shown,
      }
      return out([cover], paragraphs(question, options.join('\n'), p.pollVote), `${p.poll}: ${question}`, [])
    }
    case 'faq': {
      const title = str(values, 'title') || p.faqTitle
      const pairs = (Array.isArray(values.pairs) ? values.pairs : []) as Array<{ q: string; a: string }>
      const cover: Slide = { kind: 'cover', kicker: p.faq, title: clip(title, 70), body: null }
      const rest: Slide[] = pairs.map((pair, i) => ({
        kind: 'point',
        kicker: fill(p.question, i + 1),
        title: clip(pair.q, 90),
        body: clip(pair.a, LONG),
      }))
      const caption = paragraphs(title, ...pairs.map((pair) => `${pair.q}\n${pair.a}`), cta)
      return out(shape('carousel', cover, rest, ctaSlide(p, cta)), caption, `${p.faq}: ${title}`, [])
    }
    case 'giveaway': {
      const prize = str(values, 'prize')
      const steps = strs(values, 'steps')
      const deadline = day('deadline')
      const rules = str(values, 'rules')
      const numbered = steps.map((s, i) => clip(`${i + 1}. ${s}`, ITEM))
      const cover: Slide = {
        kind: 'cover',
        kicker: p.giveaway,
        title: clip(prize, 70),
        body: fill(p.until, deadline),
      }
      const rest: Slide[] = [
        { kind: 'point', kicker: p.giveaway, title: p.howToEnter, body: lines(numbered), items: numbered },
        { kind: 'point', kicker: p.deadline, title: deadline, body: rules ? clip(rules, BODY) : null },
      ]
      const caption = paragraphs(
        `${p.giveaway}: ${prize}`,
        `${p.howToEnter}:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
        `${p.deadline}: ${deadline}.`,
        rules && `${p.rules}: ${rules}`,
      )
      return out(shape(opts.format, cover, rest, null), caption, `${p.giveaway}: ${prize}`)
    }
    case 'offer': {
      const headline = str(values, 'headline')
      const discount = str(values, 'discount')
      const details = str(values, 'details')
      const until = day('validUntil')
      const code = str(values, 'code')
      const terms = str(values, 'terms')
      // popust je u naslovu: istaknut broj (`stat`) crta samo stil „Statistika”
      const cover: Slide = {
        kind: 'cover',
        kicker: p.offer,
        stat: clip(discount, 16),
        title: clip(`${headline}: ${discount}`, 90),
        body: until ? fill(p.validUntil, until) : details ? clip(details, BODY) : null,
      }
      const rest: Slide[] = [
        ...(details
          ? [
              {
                kind: 'point',
                kicker: p.offer,
                title: clip(headline, 70),
                body: clip(details, LONG),
              } as Slide,
            ]
          : []),
        ...(code
          ? [{ kind: 'point', kicker: p.code, title: code, body: terms ? clip(terms, BODY) : null } as Slide]
          : []),
      ]
      const caption = paragraphs(
        `${headline}: ${discount}.`,
        details,
        [until && `${fill(p.validUntil, until)}.`, code && `${p.code}: ${code}`, terms]
          .filter(Boolean)
          .join('\n'),
        cta,
      )
      return out(shape(opts.format, cover, rest, ctaSlide(p, cta)), caption, `${p.offer}: ${headline}`, [])
    }
    case 'launch': {
      const name = str(values, 'name')
      const description = str(values, 'description')
      const price = str(values, 'price')
      const where = str(values, 'where')
      const cover: Slide = {
        kind: 'cover',
        kicker: p.launch,
        title: clip(name, 70),
        body: price || (opts.format === 'image' ? clip(description, BODY) : null),
      }
      const rest: Slide[] = [
        { kind: 'point', kicker: p.launch, title: clip(name, 70), body: clip(description, LONG) },
        ...(where ? [{ kind: 'point', kicker: p.where, title: clip(where, 90), body: null } as Slide] : []),
      ]
      const caption = paragraphs(`${p.launch}: ${name}${price ? ` (${price})` : ''}`, description, where, cta)
      return out(shape(opts.format, cover, rest, ctaSlide(p, cta)), caption, `${p.launch}: ${name}`)
    }
    case 'price_list': {
      const title = str(values, 'title')
      const prices = (Array.isArray(values.prices) ? values.prices : []) as Array<{
        name: string
        price: string
      }>
      const note = str(values, 'note')
      const rows = prices.map((x) => clip(`${x.name} · ${x.price}`, ITEM))
      const cover: Slide = {
        kind: 'cover',
        kicker: p.priceList,
        title: clip(title, 70),
        body: lines(note ? [...rows, clip(note, ITEM * 2)] : rows),
        items: rows,
      }
      const caption = paragraphs(title, prices.map((x) => `${x.name}: ${x.price}`).join('\n'), note, cta)
      return out([cover], caption, `${p.priceList}: ${title}`, [])
    }
    case 'event': {
      const title = str(values, 'title')
      const date = day('date')
      const time = str(values, 'time')
      const place = str(values, 'place')
      const description = str(values, 'description')
      const signup = str(values, 'signup')
      const when = time ? `${date} · ${time}` : date
      const cover: Slide = {
        kind: 'cover',
        kicker: clip(when, 40),
        title: clip(title, 70),
        body: clip(place, BODY),
      }
      const rest: Slide[] = description
        ? [{ kind: 'point', kicker: clip(when, 40), title: clip(title, 70), body: clip(description, LONG) }]
        : []
      const caption = paragraphs(
        title,
        `${p.when}: ${date}${time ? `, ${time}` : ''}\n${p.where}: ${place}`,
        description,
        signup || cta,
      )
      return out(shape(opts.format, cover, rest, ctaSlide(p, signup || cta)), caption, `${p.event}: ${title}`)
    }
    case 'milestone': {
      const number = str(values, 'number')
      const title = str(values, 'title')
      const text = str(values, 'text')
      // broj je naslov: istaknut broj (`stat`) crta samo stil „Statistika”
      const cover: Slide = {
        kind: 'cover',
        kicker: p.milestone,
        stat: clip(number, 16),
        title: clip(number, 40),
        body: clip(title, BODY),
      }
      const rest: Slide[] = text
        ? [{ kind: 'point', kicker: clip(number, 40), title: clip(title, 70), body: clip(text, LONG) }]
        : []
      const caption = paragraphs(`${number}: ${title}`, text, p.thanksAll)
      return out(
        shape(opts.format, cover, rest, { kind: 'cta', title: p.thanksAll, body: null }),
        caption,
        `${p.milestone}: ${number}`,
      )
    }
    case 'hiring': {
      const position = str(values, 'position')
      const location = str(values, 'location')
      const offer = strs(values, 'offer')
      const requirements = strs(values, 'requirements')
      const apply = str(values, 'apply')
      const deadline = day('deadline')
      const bullets = (items: string[]) => items.map((x) => clip(`– ${x}`, ITEM))
      const cover: Slide = {
        kind: 'cover',
        kicker: p.hiring,
        title: clip(position, 70),
        body: location ? clip(location, BODY) : null,
      }
      const rest: Slide[] = [
        ...(offer.length
          ? [
              {
                kind: 'point',
                kicker: clip(position, 40),
                title: p.weOffer,
                body: lines(bullets(offer)),
                items: bullets(offer),
              } as Slide,
            ]
          : []),
        ...(requirements.length
          ? [
              {
                kind: 'point',
                kicker: clip(position, 40),
                title: p.weLookFor,
                body: lines(bullets(requirements)),
                items: bullets(requirements),
              } as Slide,
            ]
          : []),
      ]
      const lastSlide: Slide = {
        kind: 'cta',
        title: clip(apply, 70),
        body: deadline ? fill(p.applyUntil, deadline) : null,
      }
      const caption = paragraphs(
        `${p.hiring}: ${position}${location ? `, ${location}` : ''}.`,
        offer.length ? `${p.weOffer}:\n${offer.map((x) => `– ${x}`).join('\n')}` : '',
        requirements.length ? `${p.weLookFor}:\n${requirements.map((x) => `– ${x}`).join('\n')}` : '',
        `${p.howToApply}: ${apply}${deadline ? `\n${fill(p.applyUntil, deadline)}.` : ''}`,
      )
      return out(shape(opts.format, cover, rest, lastSlide), caption, `${p.hiring}: ${position}`, [])
    }
    case 'announcement': {
      const title = str(values, 'title')
      const text = str(values, 'text')
      const dates = str(values, 'dates')
      const cover: Slide = {
        kind: 'cover',
        kicker: dates ? clip(dates, 40) : p.announcement,
        title: clip(title, 70),
        body: clip(text, LONG),
      }
      return out([cover], paragraphs(title, text, dates), `${p.announcement}: ${title}`, [])
    }
    case 'award': {
      const name = str(values, 'name')
      const issuer = str(values, 'issuer')
      const year = str(values, 'year')
      const text = str(values, 'text')
      const by = year ? `${issuer}, ${year}` : issuer
      const cover: Slide = { kind: 'cover', kicker: p.award, title: clip(name, 70), body: clip(by, BODY) }
      const rest: Slide[] = text
        ? [{ kind: 'point', kicker: p.award, title: clip(name, 70), body: clip(text, LONG) }]
        : []
      const caption = paragraphs(`${name}\n${by}`, text, p.thanksClients)
      return out(shape(opts.format, cover, rest, ctaSlide(p, cta)), caption, `${p.award}: ${name}`)
    }
    case 'partnership': {
      const partner = str(values, 'partner')
      const text = str(values, 'text')
      const cover: Slide = {
        kind: 'cover',
        kicker: p.partnership,
        title: clip(partner, 70),
        body: opts.format === 'image' ? clip(text, BODY) : null,
      }
      const rest: Slide[] = [
        { kind: 'point', kicker: p.partnership, title: clip(partner, 70), body: clip(text, LONG) },
      ]
      const caption = paragraphs(`${p.partnership}: ${partner}`, text, cta)
      return out(shape(opts.format, cover, rest, ctaSlide(p, cta)), caption, `${p.partnership}: ${partner}`)
    }
  }
}
