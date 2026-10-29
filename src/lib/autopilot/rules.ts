import { validateText, type SocialPlatform } from '@/config/platforms'
import { CYRILLIC_LOCALES, type ContentLocale } from '@/config/locales'

/**
 * Čista pravila Autopilota (brif 9.2–9.3, faza 10c): nivoi, budžet tokena (80 % / 100 %),
 * kada je nedeljni prolaz na redu, rok za odobrenje, kontrola kvaliteta i reaktivni okidači.
 * Bez baze i AI-ja; jedinično testirano u rules.test.ts.
 */
export type AutopilotLevel = 0 | 1 | 2 | 3

export const AUTOPILOT_LEVELS: Record<AutopilotLevel, { label: string; description: string }> = {
  0: { label: 'Ručno', description: 'Sova pomaže samo na zahtev. Nema automatskih nacrta.' },
  1: {
    label: 'Kopilot',
    description: 'Svake nedelje Sova pripremi nacrte za narednu nedelju; sve ide na odobrenje.',
  },
  2: {
    label: 'Autopilot sa odobrenjem',
    description:
      'Sova pravi strategiju, kalendar i sadržaj; objave idu na odobrenje. Neodobrene do roka se preskaču ili objavljuju, po podešavanju.',
  },
  3: {
    label: 'Pun autopilot',
    description:
      'Sova planira, kreira i objavljuje bez odobrenja na izabranim nalozima i šalje nedeljni izveštaj. Uključuje se izričito, isključuje jednim klikom.',
  },
}

export const BUDGET_WARNING_PERCENT = 80
/** mreže koje bez vizuala ne mogu da objave sliku-objavu */
export const MEDIA_REQUIRED: readonly SocialPlatform[] = ['instagram', 'pinterest']
/** najviše nacrta po nedeljnom prolazu (zaštita budžeta i kvota) */
export const MAX_WEEKLY_DRAFTS = 21

export type BudgetState = 'unlimited' | 'ok' | 'warning' | 'stopped'

export function budgetState(
  used: number,
  budget: number | null,
  warnPercent = BUDGET_WARNING_PERCENT,
): { state: BudgetState; percent: number | null; remaining: number | null } {
  if (budget === null) return { state: 'unlimited', percent: null, remaining: null }
  if (budget <= 0) return { state: 'stopped', percent: 100, remaining: 0 }
  const percent = Math.round((used / budget) * 1000) / 10
  const remaining = Math.max(0, budget - used)
  if (used >= budget) return { state: 'stopped', percent, remaining }
  if (percent >= warnPercent) return { state: 'warning', percent, remaining }
  return { state: 'ok', percent, remaining }
}

/** Da li Autopilot sme da potroši još `amount` tokena u mesecu. */
export function canSpend(used: number, budget: number | null, amount: number): boolean {
  if (budget === null) return true
  return used + amount <= budget
}

export function monthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function localParts(
  now: Date,
  timeZone: string,
): { date: string; weekday: number; hour: number; day: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const hour = Number(parts.hour) % 24
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WD[parts.weekday as string] ?? 1,
    hour,
    day: Number(parts.day),
  }
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Sledeća nedelja (ponedeljak–nedelja) u zoni brenda, gledano od `now`. */
export function nextWeekRange(now: Date, timeZone: string): { start: string; end: string } {
  const p = localParts(now, timeZone)
  const delta = (8 - p.weekday) % 7 || 7
  const start = addDays(p.date, delta)
  return { start, end: addDays(start, 6) }
}

/**
 * Nedeljni prolaz: ponedeljkom od `hourLocal` po zoni brenda (cron radi svaki sat, a red u
 * `autopilot_runs` sa (brend, nedelja) sprečava dupli prolaz, pa propušten sat ne gubi nedelju).
 */
export function isWeeklyRunDue(now: Date, timeZone: string, hourLocal = 6): boolean {
  const p = localParts(now, timeZone)
  return p.weekday === 1 && p.hour >= hourLocal
}

/** Mesečni prolaz: od `day`. u mesecu po zoni brenda. */
export function isMonthlyRunDue(now: Date, timeZone: string, day = 25): boolean {
  return localParts(now, timeZone).day >= day
}

/** Prvi ponedeljak sledećeg meseca (lokalno) — početak perioda mesečne strategije. */
export function firstMondayNextMonth(now: Date, timeZone: string): string {
  const p = localParts(now, timeZone)
  const [y, m] = p.date.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
  const wd = first.getUTCDay()
  first.setUTCDate(first.getUTCDate() + ((8 - wd) % 7))
  return first.toISOString().slice(0, 10)
}

export type DeadlineAction = 'wait' | 'remind' | 'skip' | 'publish' | 'expire'

/**
 * Šta uraditi sa Autopilot objavom koja još čeka odobrenje:
 * - pre roka (termin − `deadlineHours`): čekaj;
 * - nivo ≥ 2 posle roka: preskoči ili objavi (podešavanje brenda);
 * - nivo 1 posle roka: podsetnik, a kad termin prođe objava se vraća u nacrt.
 */
export function deadlineAction(input: {
  level: AutopilotLevel
  unapprovedAction: 'skip' | 'publish'
  scheduledFor: string
  deadlineHours: number
  now: Date
}): DeadlineAction {
  const at = new Date(input.scheduledFor).getTime()
  const deadline = at - input.deadlineHours * 3600_000
  const now = input.now.getTime()
  if (now < deadline) return 'wait'
  if (input.level >= 2) {
    if (input.unapprovedAction === 'publish' && at - now > 60_000) return 'publish'
    return 'skip'
  }
  return now >= at ? 'expire' : 'remind'
}

// ---------------------------------------------------------------------------
// Kontrola kvaliteta (brif 9.3.4)
// ---------------------------------------------------------------------------

export interface QaInput {
  platform: SocialPlatform
  text: string
  hashtags: string[]
  locale: ContentLocale
  forbiddenWords: string[]
  /** tekst iz kog smeju da dođu brojke (činjenice profila, usluge, odlomci sa sajta, tema) */
  factsCorpus: string
  /** tekstovi objava iz poslednjih 90 dana */
  recentTexts: string[]
  hasMedia: boolean
}

export interface QaCheck {
  name: 'empty' | 'length' | 'forbidden' | 'script' | 'similarity' | 'facts' | 'media'
  ok: boolean
  message: string
}

export interface QaReport {
  passed: boolean
  checks: QaCheck[]
  similarity: number
}

export const SIMILARITY_THRESHOLD = 0.6

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
}

function shingles(text: string, n = 3): Set<string> {
  const words = normalizeWords(text)
  const out = new Set<string>()
  if (words.length < n) {
    if (words.length) out.add(words.join(' '))
    return out
  }
  for (let i = 0; i <= words.length - n; i++) out.add(words.slice(i, i + n).join(' '))
  return out
}

/** Jaccard sličnost nad trojkama reči (0–1). */
export function similarity(a: string, b: string): number {
  const sa = shingles(a)
  const sb = shingles(b)
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const s of sa) if (sb.has(s)) inter += 1
  return inter / (sa.size + sb.size - inter)
}

export function cyrillicRatio(text: string): number {
  const letters = [...text].filter((c) => /\p{L}/u.test(c))
  if (!letters.length) return 0
  return letters.filter((c) => /[Ѐ-ӿ]/.test(c)).length / letters.length
}

/** Brojke koje nose tvrdnju: cene, procenti, popusti, godine garancije, količine sa jedinicom. */
export function extractClaims(text: string): string[] {
  const re = /(\d+(?:[.,]\d+)*)\s*(%|€|eur|rsd|din(?:ara)?|dinara|godin\w*|meseci|dana|h|sati|km|m2|kom)?/giu
  const out: string[] = []
  for (const m of text.matchAll(re)) {
    const num = m[1]!
    const unit = (m[2] ?? '').toLowerCase()
    // sat u formatu 18:00 ili datum nisu tvrdnje
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1)
    const before = text.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0)
    if (after === ':' || before === ':' || before === '.' || after === '.') continue
    if (!unit && Number(num.replace(',', '.')) < 10) continue
    out.push(num.replace(',', '.'))
  }
  return [...new Set(out)]
}

export function qaCheck(input: QaInput): QaReport {
  const checks: QaCheck[] = []
  const text = input.text.trim()
  checks.push({
    name: 'empty',
    ok: text.length >= 20,
    message: text.length >= 20 ? 'Tekst postoji.' : 'Tekst je prazan ili prekratak.',
  })

  const v = validateText(input.platform, text, input.hashtags)
  checks.push({
    name: 'length',
    ok: v.ok,
    message: v.ok ? `Dužina ${v.length}/${v.max}.` : v.problems.join(' '),
  })

  const lower = text.toLowerCase()
  const hits = input.forbiddenWords
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .filter((w) =>
      new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(lower),
    )
  checks.push({
    name: 'forbidden',
    ok: hits.length === 0,
    message: hits.length ? `Zabranjene reči: ${hits.join(', ')}.` : 'Bez zabranjenih reči.',
  })

  const cyr = cyrillicRatio(text)
  const cyrillic = CYRILLIC_LOCALES.has(input.locale)
  const scriptOk = cyrillic ? cyr >= 0.5 : cyr <= 0.2
  checks.push({
    name: 'script',
    ok: scriptOk,
    message: scriptOk
      ? 'Pismo odgovara brendu.'
      : cyrillic
        ? 'Tekst nije na ćirilici.'
        : 'Tekst je na pogrešnom pismu (ćirilica).',
  })

  const sim = input.recentTexts.reduce((max, t) => Math.max(max, similarity(text, t)), 0)
  const simOk = sim < SIMILARITY_THRESHOLD
  checks.push({
    name: 'similarity',
    ok: simOk,
    message: simOk
      ? `Najveća sličnost sa ranijim objavama ${Math.round(sim * 100)} %.`
      : `Previše liči na raniju objavu (${Math.round(sim * 100)} %).`,
  })

  const corpus = input.factsCorpus.replace(/,/g, '.')
  const unknown = extractClaims(text).filter((c) => !corpus.includes(c))
  checks.push({
    name: 'facts',
    ok: unknown.length === 0,
    message: unknown.length
      ? `Brojke kojih nema u profilu brenda: ${unknown.join(', ')}.`
      : 'Brojke potiču iz profila ili nema brojki.',
  })

  const mediaOk = !MEDIA_REQUIRED.includes(input.platform) || input.hasMedia
  checks.push({
    name: 'media',
    ok: mediaOk,
    message: mediaOk ? 'Vizual je u redu.' : 'Mreža traži vizual, a nije napravljen.',
  })

  return { passed: checks.every((c) => c.ok), checks, similarity: Math.round(sim * 1000) / 1000 }
}

// ---------------------------------------------------------------------------
// Reaktivni okidači (brif 9.3.5)
// ---------------------------------------------------------------------------

export const OUTLIER_MULTIPLIER = 2
export const OUTLIER_MIN_BASELINE = 5

export function isOutlier(engagement: number, baseline: number[]): boolean {
  if (baseline.length < OUTLIER_MIN_BASELINE) return false
  const avg = baseline.reduce((a, b) => a + b, 0) / baseline.length
  return avg > 0 && engagement >= OUTLIER_MULTIPLIER * avg
}

export function holidaysInWindow<T extends { date: string }>(
  holidays: T[],
  today: string,
  daysAhead = 7,
): T[] {
  const end = addDays(today, daysAhead)
  return holidays.filter((h) => h.date > today && h.date <= end)
}
