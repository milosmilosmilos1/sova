/**
 * Lokalno vreme u IANA zoni ↔ UTC preko Intl, bez biblioteke. Koriste ga server (zakazivanje, red
 * objava, promena zone brenda) i editor objave u pregledaču, pa ne uvozi ništa serversko.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsAt(ms: number, timeZone: string): Record<string, string> {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
}

/** Pomak zone (lokalno − UTC) u milisekundama u datom trenutku. */
function offsetAt(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone)
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
  )
  return asIfUtc - Math.floor(ms / 60_000) * 60_000
}

/** Datum (YYYY-MM-DD) i sat (HH:MM) trenutka u zoni. */
export function wallClock(iso: string, timeZone: string): { date: string; time: string } {
  const p = partsAt(new Date(iso).getTime(), timeZone)
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/**
 * Lokalni datum i sat u zoni → UTC ISO (EDGE_CASES K2), po pravilu Temporal `compatible`: sat koji
 * ne postoji (prelaz na letnje vreme) pomera se unapred za veličinu skoka (02:30 → 03:30), a sat
 * koji postoji dvaput (prelaz na zimsko) uzima raniji trenutak.
 */
export function zonedToUtc(date: string, timeLocal: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = timeLocal.split(':').map(Number)
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!)
  // pravi trenutak je najviše 14 h od `wall`; u ±24 h postoji najviše jedan prelaz, pa su ovo pomaci pre i posle njega
  const before = offsetAt(wall - 86_400_000, timeZone)
  const after = offsetAt(wall + 86_400_000, timeZone)
  const withBefore = wall - before
  const withAfter = wall - after
  const valid: number[] = []
  if (offsetAt(withBefore, timeZone) === before) valid.push(withBefore)
  if (offsetAt(withAfter, timeZone) === after) valid.push(withAfter)
  return new Date(valid.length ? Math.min(...valid) : withBefore).toISOString()
}

/** Isto lokalno vreme u drugoj zoni (10:00 u Beogradu → 10:00 u Njujorku), za promenu zone brenda (K7). */
export function shiftToZone(iso: string, fromTimeZone: string, toTimeZone: string): string {
  const w = wallClock(iso, fromTimeZone)
  return zonedToUtc(w.date, w.time, toTimeZone)
}
