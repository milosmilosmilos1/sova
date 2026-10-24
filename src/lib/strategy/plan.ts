import { PLATFORMS, type SocialPlatform } from '@/config/platforms'

/**
 * Čista pravila strategije (faza 10a): najbolja vremena iz istorije ili pretpostavke,
 * raspored objava po nedeljama iz mixa mreža i nedeljnih tema, zaobilaženje praznika.
 * Bez baze i AI-ja; vremena su lokalna (zona brenda), konverziju u UTC radi servis.
 */
export interface BestTimeSlot {
  /** 0 = nedelja … 6 = subota */
  weekday: number
  hour: number
  minute: number
  source: 'data' | 'assumption'
}
export type BestTimes = Partial<Record<SocialPlatform, BestTimeSlot[]>>

export interface NetworkMixEntry {
  per_week: number
  formats: string[]
  role: string
}
export type NetworkMix = Partial<Record<SocialPlatform, NetworkMixEntry>>

export interface WeeklyTheme {
  week: number
  theme: string
  angle: string
  pillar: string
  campaign: string
}

export interface HistoryPoint {
  platform: SocialPlatform
  publishedAt: string
  engagement: number
}

/** Pretpostavke po mreži (lokalno vreme), dok nema bar MIN_POSTS_FOR_DATA objava iz istorije. */
export const DEFAULT_BEST_TIMES: Record<SocialPlatform, Array<[weekday: number, hour: number]>> = {
  instagram: [
    [2, 18],
    [4, 18],
    [6, 11],
  ],
  facebook: [
    [1, 12],
    [3, 12],
    [5, 17],
  ],
  linkedin: [
    [2, 9],
    [3, 9],
    [4, 9],
  ],
  tiktok: [
    [2, 19],
    [4, 19],
    [0, 20],
  ],
  x: [
    [1, 12],
    [3, 12],
    [5, 12],
  ],
  youtube: [
    [5, 17],
    [0, 11],
  ],
  pinterest: [
    [6, 20],
    [0, 20],
  ],
  google_business: [
    [1, 10],
    [4, 10],
  ],
}

export const MIN_POSTS_FOR_DATA = 10
export const PILLAR_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#ea580c']

/** Angažovanje iz metrika mreže (razni nazivi polja); čuvanja i deljenja vrede više. */
export function engagementOf(metrics: Record<string, unknown> | null | undefined): number {
  if (!metrics) return 0
  const n = (k: string) => (typeof metrics[k] === 'number' ? (metrics[k] as number) : 0)
  if (typeof metrics.engagement === 'number') return metrics.engagement as number
  return (
    n('likes') +
    n('reactions') +
    n('like_count') +
    2 * (n('comments') + n('comments_count')) +
    3 * (n('shares') + n('saves') + n('saved'))
  )
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Lokalni dan u nedelji i sat za UTC trenutak u zoni. */
export function localWeekdayHour(iso: string, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso))
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '12')
  return { weekday: WEEKDAY_INDEX[wd] ?? 1, hour: hourRaw === 24 ? 0 : hourRaw }
}

/**
 * Vremena iz podataka: po mreži sa bar `minPosts` objava, top 3 (dan, sat) para po prosečnom
 * angažovanju, uz uslov da par ima bar 2 objave. Mreže bez dovoljno podataka se ne vraćaju.
 */
export function bestTimesFromHistory(
  points: HistoryPoint[],
  timeZone: string,
  minPosts = MIN_POSTS_FOR_DATA,
): BestTimes {
  const byPlatform = new Map<SocialPlatform, HistoryPoint[]>()
  for (const p of points) {
    const list = byPlatform.get(p.platform) ?? []
    list.push(p)
    byPlatform.set(p.platform, list)
  }
  const out: BestTimes = {}
  for (const [platform, list] of byPlatform) {
    if (list.length < minPosts) continue
    const buckets = new Map<string, { weekday: number; hour: number; total: number; count: number }>()
    for (const p of list) {
      const { weekday, hour } = localWeekdayHour(p.publishedAt, timeZone)
      const key = `${weekday}:${hour}`
      const b = buckets.get(key) ?? { weekday, hour, total: 0, count: 0 }
      b.total += p.engagement
      b.count += 1
      buckets.set(key, b)
    }
    const ranked = [...buckets.values()]
      .filter((b) => b.count >= 2)
      .sort((a, b) => b.total / b.count - a.total / a.count)
      .slice(0, 3)
    if (ranked.length) {
      out[platform] = ranked.map((b) => ({
        weekday: b.weekday,
        hour: b.hour,
        minute: 0,
        source: 'data' as const,
      }))
    }
  }
  return out
}

/** Spaja vremena: podaci imaju prednost, zatim predlog modela, zatim pretpostavke iz tabele. */
export function mergeBestTimes(
  platforms: SocialPlatform[],
  fromData: BestTimes,
  fromModel: Array<{ platform: SocialPlatform; weekday: number; hour: number }> = [],
): BestTimes {
  const out: BestTimes = {}
  for (const p of platforms) {
    const data = fromData[p]
    if (data?.length) {
      out[p] = data
      continue
    }
    const model = fromModel
      .filter((m) => m.platform === p && m.weekday >= 0 && m.weekday <= 6 && m.hour >= 0 && m.hour <= 23)
      .slice(0, 3)
      .map((m) => ({ weekday: m.weekday, hour: m.hour, minute: 0, source: 'assumption' as const }))
    out[p] = model.length
      ? model
      : DEFAULT_BEST_TIMES[p].map(([weekday, hour]) => ({
          weekday,
          hour,
          minute: 0,
          source: 'assumption' as const,
        }))
  }
  return out
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

/** Prvi dan nedelje `week` (1-based) računajući od početka perioda. */
export function weekStartDate(periodStart: string, week: number): string {
  return addDays(periodStart, (week - 1) * 7)
}

/** Sledeći ponedeljak posle datog dana (za podrazumevani početak perioda). */
export function nextMonday(from: Date): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const day = d.getUTCDay()
  const delta = day === 1 ? 7 : (8 - day) % 7 || 7
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export interface PlannedPost {
  week: number
  /** YYYY-MM-DD u zoni brenda */
  date: string
  /** HH:MM lokalno */
  timeLocal: string
  platform: SocialPlatform
  theme: string
  angle: string
  pillar: string
  campaign: string
  source: BestTimeSlot['source']
}

export interface PlanInput {
  periodStart: string
  weeks: number
  networkMix: NetworkMix
  bestTimes: BestTimes
  weeklyThemes: WeeklyTheme[]
  /** datumi (YYYY-MM-DD) neradnih praznika koje preskačemo */
  holidays: Set<string>
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Raspored iz strategije: za svaku nedelju i mrežu `per_week` termina iz najboljih vremena
 * (rotiraju se po nedeljama), praznik pomera objavu za dan, isti (mreža, datum, vreme) se ne ponavlja.
 */
export function planCalendar(input: PlanInput): PlannedPost[] {
  const out: PlannedPost[] = []
  const used = new Set<string>()
  const periodEnd = addDays(input.periodStart, input.weeks * 7 - 1)
  const platforms = (Object.keys(input.networkMix) as SocialPlatform[]).filter((p) => p in PLATFORMS)
  for (let week = 1; week <= input.weeks; week++) {
    const theme = input.weeklyThemes.find((t) => t.week === week) ??
      input.weeklyThemes[input.weeklyThemes.length - 1] ?? {
        week,
        theme: `Nedelja ${week}`,
        angle: '',
        pillar: '',
        campaign: '',
      }
    const start = weekStartDate(input.periodStart, week)
    const startWd = weekdayOf(start)
    for (const platform of platforms) {
      const perWeek = Math.max(0, Math.min(7, Math.round(input.networkMix[platform]?.per_week ?? 0)))
      const slots = input.bestTimes[platform]?.length
        ? input.bestTimes[platform]!
        : DEFAULT_BEST_TIMES[platform].map(([weekday, hour]) => ({
            weekday,
            hour,
            minute: 0,
            source: 'assumption' as const,
          }))
      for (let i = 0; i < perWeek; i++) {
        const slot = slots[(i + week - 1) % slots.length]!
        // dan u ovoj nedelji sa traženim weekday-om
        let date = addDays(start, (slot.weekday - startWd + 7) % 7)
        let hour = slot.hour + Math.floor(i / slots.length) // više objava nego termina → pomeri sat
        if (hour > 22) hour = 22
        for (let guard = 0; guard < 7 && input.holidays.has(date); guard++) date = addDays(date, 1)
        let key = `${platform}|${date}|${pad(hour)}:${pad(slot.minute)}`
        for (let guard = 0; used.has(key) && guard < 12; guard++) {
          hour = hour + 1 > 22 ? 9 : hour + 1
          if (hour === 9) date = addDays(date, 1)
          key = `${platform}|${date}|${pad(hour)}:${pad(slot.minute)}`
        }
        if (date > periodEnd) continue
        used.add(key)
        out.push({
          week,
          date,
          timeLocal: `${pad(hour)}:${pad(slot.minute)}`,
          platform,
          theme: theme.theme,
          angle: theme.angle,
          pillar: theme.pillar,
          campaign: theme.campaign,
          source: slot.source,
        })
      }
    }
  }
  return out.sort((a, b) => `${a.date}T${a.timeLocal}`.localeCompare(`${b.date}T${b.timeLocal}`))
}

/** Tekst nacrta iz strategije: tema i ugao kao brif za AI Studio, bez trošenja tokena. */
export function draftBrief(p: PlannedPost): string {
  return [
    `Tema nedelje: ${p.theme}`,
    p.angle ? `Ugao: ${p.angle}` : null,
    p.pillar ? `Stub sadržaja: ${p.pillar}` : null,
    p.campaign ? `Kampanja: ${p.campaign}` : null,
    `Mreža: ${PLATFORMS[p.platform].label}`,
    '',
    'Nacrt iz strategije: napišite tekst (ili ga napravite u AI Studiju iz ove teme), dodajte vizual, pa zakažite.',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

export function pillarColor(index: number): string {
  return PILLAR_COLORS[index % PILLAR_COLORS.length]!
}
