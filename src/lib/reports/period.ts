import { wallClock, zonedToUtc } from '@/lib/zoned-time'

/**
 * Mesec izveštaja (D-094) kao `YYYY-MM`. Granice se računaju u zoni brenda, pa izveštaj za oktobar
 * počinje u ponoć 1. oktobra po lokalnom vremenu, i na dan prelaska na zimsko vreme.
 */
export type ReportMonth = string

const MONTHS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
]

export function isReportMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function parts(month: ReportMonth): [number, number] {
  const [y, m] = month.split('-').map(Number)
  return [y!, m!]
}

function format(y: number, m: number): ReportMonth {
  return `${y}-${String(m).padStart(2, '0')}`
}

export function shiftMonth(month: ReportMonth, by: number): ReportMonth {
  const [y, m] = parts(month)
  const index = y * 12 + (m - 1) + by
  return format(Math.floor(index / 12), (index % 12) + 1)
}

export interface MonthBounds {
  /** prvi i poslednji dan meseca (datumi za `reports.period_start/end`) */
  periodStart: string
  periodEnd: string
  /** granice u UTC: od ponoći prvog dana do poslednje milisekunde meseca, u zoni brenda */
  from: string
  to: string
}

export function monthBounds(month: ReportMonth, timeZone: string): MonthBounds {
  const [y, m] = parts(month)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const next = `${shiftMonth(month, 1)}-01`
  return {
    periodStart: `${month}-01`,
    periodEnd: `${month}-${String(lastDay).padStart(2, '0')}`,
    from: zonedToUtc(`${month}-01`, '00:00', timeZone),
    to: new Date(new Date(zonedToUtc(next, '00:00', timeZone)).getTime() - 1).toISOString(),
  }
}

/** Mesec u kome je trenutak `now` po lokalnom vremenu brenda. */
export function monthOf(now: Date, timeZone: string): ReportMonth {
  return wallClock(now.toISOString(), timeZone).date.slice(0, 7)
}

/** Poslednji završen mesec po lokalnom vremenu brenda (mesečni posao pravi izveštaj za njega). */
export function previousMonth(now: Date, timeZone: string): ReportMonth {
  return shiftMonth(monthOf(now, timeZone), -1)
}

/** Meseci za izbor u aplikaciji: tekući (u toku) pa `count - 1` prethodnih. */
export function recentMonths(now: Date, timeZone: string, count = 12): ReportMonth[] {
  const current = monthOf(now, timeZone)
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -i))
}

/** „oktobar 2026.” */
export function monthLabel(month: ReportMonth): string {
  const [y, m] = parts(month)
  return `${MONTHS[m - 1]} ${y}.`
}

/** „oktobar” (bez godine, za poređenje sa prethodnim mesecom). */
export function monthName(month: ReportMonth): string {
  return MONTHS[parts(month)[1] - 1]!
}

/**
 * Mesečni posao radi na sat 1. i 2. u mesecu (UTC); brend je na redu 1. od `hourLocal` po svojoj
 * zoni, a 2. dan je rezerva. Pre toga lokalni datum je još poslednji dan meseca, pa bi „prethodni
 * mesec” bio pogrešan.
 */
export function isMonthlyReportDue(now: Date, timeZone: string, hourLocal = 6): boolean {
  const { date, time } = wallClock(now.toISOString(), timeZone)
  const day = Number(date.slice(8, 10))
  return day === 2 || (day === 1 && Number(time.slice(0, 2)) >= hourLocal)
}
