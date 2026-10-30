import type { SocialPlatform } from '@/config/platforms'
import { PLATFORM_FORMATS, POST_FORMATS, type PostFormat } from '@/config/post-formats'
import { addDays, DEFAULT_BEST_TIMES, weekdayOf, type BestTimes } from '@/lib/strategy/plan'

/**
 * Termini mesečnog plana (D-119): koliko objava nedeljno, u koje dane, u koje vreme i koje vrste.
 * Raspored je pravilan i predvidiv (Sova bira teme, ne termine): dani po šablonu za broj objava,
 * vreme iz najboljih termina mreže, a vrste se smenjuju tako da karusel i slika dolaze najčešće.
 * Svaki termin ide na mreže koje primaju njegovu vrstu. Plan može da pokrije do tri meseca (D-120).
 */
export const PER_WEEK_OPTIONS = [3, 5, 7, 10, 14] as const
export const MONTH_OPTIONS = [1, 2, 3] as const
/** najviše termina u jednom kalendarskom mesecu (jedan poziv modela bira teme za jedan mesec) */
export const MAX_SLOTS = 60

/** Dani u nedelji (0 = nedelja) za prvu objavu dana i redosled dana za drugu. */
const FIRST_DAYS: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
}
const SECOND_DAYS = [2, 4, 6, 1, 3, 5, 0]

/** Smenjivanje vrsta: karusel i slika dvaput, ostale jednom, bez dve iste zaredom. */
const ROTATION: PostFormat[] = ['carousel', 'image', 'video', 'carousel', 'story', 'image', 'text', 'link']

export interface PlanSlot {
  /** datum u zoni brenda (YYYY-MM-DD) */
  date: string
  /** vreme u zoni brenda (HH:MM) */
  time: string
  format: PostFormat
  platforms: SocialPlatform[]
}

export interface PlanPeriod {
  month: string
  start: string
  end: string
}

/** Poslednji dan meseca koji je `count - 1` meseci posle `month` (prvi dan meseca, YYYY-MM-01). */
export function monthEnd(month: string, count = 1): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1 + count, 0)).toISOString().slice(0, 10)
}

/**
 * Period plana: od sutra (ostatak ovog meseca) ili od prvog u sledećem mesecu, pa do kraja
 * `months`-tog meseca; `today` je datum u zoni brenda. Poslednji dan meseca nema ostatka.
 */
export function planPeriod(kind: 'current' | 'next', today: string, months = 1): PlanPeriod | null {
  const [y, m] = today.split('-').map(Number) as [number, number]
  if (kind === 'next') {
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
    return { month: next, start: next, end: monthEnd(next, months) }
  }
  const month = `${today.slice(0, 7)}-01`
  const start = addDays(today, 1)
  return start > monthEnd(month) ? null : { month, start, end: monthEnd(month, months) }
}

/** Kalendarski meseci (YYYY-MM) kroz koje termini prolaze, redom. */
export function slotMonths(slots: readonly Pick<PlanSlot, 'date'>[]): string[] {
  return [...new Set(slots.map((s) => s.date.slice(0, 7)))]
}

/** Koliko objava ide u dan (1 ili 2) po broju objava nedeljno. */
export function postsOnDay(weekday: number, perWeek: number): number {
  const first = FIRST_DAYS[Math.min(7, Math.max(1, perWeek))]!
  if (!first.includes(weekday)) return 0
  const extra = Math.max(0, Math.min(7, perWeek - 7))
  return SECOND_DAYS.slice(0, extra).includes(weekday) ? 2 : 1
}

/** Vrste koje bar jedna od izabranih mreža prima, redom smenjivanja. */
export function rotationFor(
  formats: readonly PostFormat[],
  platforms: readonly SocialPlatform[],
): PostFormat[] {
  const usable = formats.filter((f) => platforms.some((p) => PLATFORM_FORMATS[p].includes(f)))
  const rotation = ROTATION.filter((f) => usable.includes(f))
  // vrsta van osnovnog smenjivanja (npr. izabran samo tekst) ipak ulazi
  for (const f of POST_FORMATS) if (usable.includes(f) && !rotation.includes(f)) rotation.push(f)
  return rotation
}

function hourFor(platform: SocialPlatform, weekday: number, bestTimes: BestTimes | undefined): number {
  const slots = bestTimes?.[platform]
  const fromStrategy = slots?.find((s) => s.weekday === weekday)
  if (fromStrategy) return fromStrategy.hour
  const fallback = DEFAULT_BEST_TIMES[platform]?.find(([day]) => day === weekday)
  return fallback ? fallback[1] : 18
}

const hhmm = (h: number) => `${String(h).padStart(2, '0')}:00`

export function buildSlots(input: {
  start: string
  end: string
  perWeek: number
  formats: readonly PostFormat[]
  platforms: readonly SocialPlatform[]
  bestTimes?: BestTimes
}): PlanSlot[] {
  const rotation = rotationFor(input.formats, input.platforms)
  if (!rotation.length || !input.platforms.length) return []
  const main = input.platforms.includes('instagram') ? 'instagram' : input.platforms[0]!
  const out: PlanSlot[] = []
  const perMonth = new Map<string, number>()
  let turn = 0
  for (let date = input.start; date <= input.end; date = addDays(date, 1)) {
    const weekday = weekdayOf(date)
    const month = date.slice(0, 7)
    const count = Math.min(postsOnDay(weekday, input.perWeek), MAX_SLOTS - (perMonth.get(month) ?? 0))
    if (count > 0) perMonth.set(month, (perMonth.get(month) ?? 0) + count)
    for (let k = 0; k < count; k++) {
      const format = rotation[turn % rotation.length]!
      turn++
      const platforms = input.platforms.filter((p) => PLATFORM_FORMATS[p].includes(format))
      // prva objava dana ide u najbolji termin mreže, druga na drugi kraj dana
      const best = hourFor(main, weekday, input.bestTimes)
      const hour = k === 0 ? best : best <= 12 ? 19 : 10
      out.push({ date, time: hhmm(hour), format, platforms })
    }
  }
  return out
}
