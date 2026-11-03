import type { SocialPlatform } from '@/config/platforms'

/**
 * Anketa (D-151): LinkedIn i X objavljuju pitanje sa 2 do 4 odgovora; Facebook i Instagram ankete
 * nemaju u API-ju. Čuva se u `post_targets.options.poll` svakog LinkedIn i X targeta (ista vrednost),
 * a tekst objave je uvod. Anketa ide bez slika: obe mreže ne dozvoljavaju anketu i medij zajedno.
 * Sme u klijentski kod.
 */
export const POLL_PLATFORMS = ['linkedin', 'x'] as const satisfies readonly SocialPlatform[]
export type PollPlatform = (typeof POLL_PLATFORMS)[number]

/** Trajanje u danima; X dozvoljava najviše 7, pa duža anketa tamo traje 7 dana. */
export const POLL_DURATIONS = [1, 3, 7, 14] as const
export type PollDuration = (typeof POLL_DURATIONS)[number]

export const POLL_LIMITS = {
  question: 140,
  option: { linkedin: 30, x: 25 },
  minOptions: 2,
  maxOptions: 4,
} as const

export interface PollOptions {
  question: string
  options: string[]
  durationDays: PollDuration
}

export const isPollPlatform = (p: string): p is PollPlatform =>
  (POLL_PLATFORMS as readonly string[]).includes(p)

/** Anketa iz podešavanja targeta; bez pitanja ili sa manje od dva odgovora nema ankete. */
export function readPoll(options: Record<string, unknown> | null | undefined): PollOptions | null {
  const o = options?.poll
  if (!o || typeof o !== 'object') return null
  const raw = o as Record<string, unknown>
  const question = typeof raw.question === 'string' ? raw.question.trim() : ''
  const answers = Array.isArray(raw.options)
    ? raw.options
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
    : []
  if (!question || answers.length < POLL_LIMITS.minOptions) return null
  const days = POLL_DURATIONS.includes(raw.durationDays as PollDuration)
    ? (raw.durationDays as PollDuration)
    : 3
  return { question, options: answers.slice(0, POLL_LIMITS.maxOptions), durationDays: days }
}

/** Šta mreža ne bi prihvatila; poruke ostaju srpske u kodu (D-130). */
export function pollProblems(poll: PollOptions, platform: PollPlatform): string[] {
  const problems: string[] = []
  if (platform === 'linkedin' && Array.from(poll.question).length > POLL_LIMITS.question)
    problems.push('Pitanje ankete na LinkedIn-u može imati najviše 140 znakova.')
  const max = POLL_LIMITS.option[platform]
  if (poll.options.some((o) => Array.from(o).length > max))
    problems.push(
      platform === 'x'
        ? 'Odgovor u anketi na X-u može imati najviše 25 znakova.'
        : 'Odgovor u anketi na LinkedIn-u može imati najviše 30 znakova.',
    )
  if (new Set(poll.options.map((o) => o.toLocaleLowerCase())).size !== poll.options.length)
    problems.push('Odgovori u anketi moraju biti različiti.')
  return problems
}

/** X traži trajanje u minutima (5 do 10.080). */
export const xPollMinutes = (days: PollDuration) => Math.min(days, 7) * 24 * 60

export const LINKEDIN_POLL_DURATION: Record<PollDuration, string> = {
  1: 'ONE_DAY',
  3: 'THREE_DAYS',
  7: 'SEVEN_DAYS',
  14: 'FOURTEEN_DAYS',
}

/** Odgovor modela u anketu: granice najstrože mreže (X), bez ponavljanja i numeracije. */
export function normalizePoll(
  raw: { question?: unknown; options?: unknown; duration_days?: unknown } | null | undefined,
): PollOptions | null {
  if (!raw) return null
  const clip = (s: string, max: number) =>
    Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim()
  const question = typeof raw.question === 'string' ? clip(raw.question, POLL_LIMITS.question) : ''
  const seen = new Set<string>()
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => clip(x.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, ''), POLL_LIMITS.option.x))
    .filter((x) => {
      const k = x.toLocaleLowerCase()
      if (!x || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, POLL_LIMITS.maxOptions)
  const days = POLL_DURATIONS.includes(raw.duration_days as PollDuration)
    ? (raw.duration_days as PollDuration)
    : 3
  return question && options.length >= POLL_LIMITS.minOptions
    ? { question, options, durationDays: days }
    : null
}

/** Anketa kako je korisnik kuca u editoru (i nedovršena); `null` kad je anketa isključena. */
export function rawPoll(options: Record<string, unknown> | null | undefined): PollOptions | null {
  const o = options?.poll
  if (!o || typeof o !== 'object') return null
  const raw = o as Record<string, unknown>
  const answers = Array.isArray(raw.options)
    ? raw.options.filter((x): x is string => typeof x === 'string')
    : []
  return {
    question: typeof raw.question === 'string' ? raw.question : '',
    options:
      answers.length >= POLL_LIMITS.minOptions
        ? answers.slice(0, POLL_LIMITS.maxOptions)
        : [...answers, '', ''].slice(0, 2),
    durationDays: POLL_DURATIONS.includes(raw.durationDays as PollDuration)
      ? (raw.durationDays as PollDuration)
      : 3,
  }
}

/** Uključena, a nedovršena anketa: objava bi inače otišla kao običan tekst. */
export function incompletePoll(options: Record<string, unknown> | null | undefined): boolean {
  return Boolean(options?.poll) && !readPoll(options)
}
