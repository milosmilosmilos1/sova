import { wallClock, zonedToUtc } from '@/lib/zoned-time'

/**
 * Raspored pripreme toka (D-108): dani u nedelji (0 = nedelja … 6 = subota) i vreme u zoni brenda.
 * Tok priprema nacrt u to vreme, a nacrt ide na odobravanje; objava se zakazuje pri odobravanju.
 */
export const AUTO_TIME_FROM = 7 * 60
export const AUTO_TIME_TO = 21 * 60 + 45

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay()
}

/** Stabilan termin za „Sova bira vreme”: isti tok uvek isti sat, različiti tokovi različite (na 15 min). */
export function autoTimeFor(flowId: string): string {
  let h = 0
  for (const c of flowId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const slots = (AUTO_TIME_TO - AUTO_TIME_FROM) / 15 + 1
  const minutes = AUTO_TIME_FROM + (h % slots) * 15
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Sledeći termin pripreme posle trenutka `after` (UTC ISO); null kad nema izabranih dana. */
export function nextRunAt(input: {
  days: number[]
  timeLocal: string
  timeZone: string
  after: Date
}): string | null {
  const days = new Set(input.days.filter((d) => d >= 0 && d <= 6))
  if (!days.size) return null
  const time = input.timeLocal.slice(0, 5)
  const today = wallClock(input.after.toISOString(), input.timeZone).date
  for (let i = 0; i <= 7; i++) {
    const date = addDays(today, i)
    if (!days.has(weekday(date))) continue
    const at = zonedToUtc(date, time, input.timeZone)
    if (new Date(at).getTime() > input.after.getTime()) return at
  }
  return null
}

/** Koliko nacrta tok pravi nedeljno (za prikaz „otprilike 3 nacrta nedeljno”). */
export function draftsPerWeek(days: number[]): number {
  return new Set(days.filter((d) => d >= 0 && d <= 6)).size
}
