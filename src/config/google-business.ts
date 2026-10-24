/**
 * Podešavanja objave na Google poslovnom profilu po targetu (`post_targets.options.google_business`):
 * vrsta objave (obična, događaj, ponuda) i dugme. Događaj i ponuda traže naslov i trajanje; vreme je
 * lokalno vreme lokacije, pa se šalje kao datum i sat bez pretvaranja u UTC.
 */
export const GBP_TOPICS = ['STANDARD', 'EVENT', 'OFFER'] as const
export type GbpTopic = (typeof GBP_TOPICS)[number]

export const GBP_ACTIONS = ['NONE', 'LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'] as const
export type GbpAction = (typeof GBP_ACTIONS)[number]

export const GBP_TOPIC_LABELS: Record<GbpTopic, string> = {
  STANDARD: 'Obična objava',
  EVENT: 'Događaj',
  OFFER: 'Ponuda',
}

export const GBP_ACTION_LABELS: Record<GbpAction, string> = {
  NONE: 'Bez dugmeta',
  LEARN_MORE: 'Saznajte više',
  BOOK: 'Rezervišite',
  ORDER: 'Poručite',
  SHOP: 'Kupite',
  SIGN_UP: 'Prijavite se',
  CALL: 'Pozovite',
}

export interface GbpOptions {
  topicType: GbpTopic
  actionType: GbpAction
  /** prazno = link objave */
  ctaUrl: string | null
  eventTitle: string | null
  /** `YYYY-MM-DDTHH:mm`, lokalno vreme lokacije */
  eventStart: string | null
  eventEnd: string | null
  couponCode: string | null
  redeemUrl: string | null
  terms: string | null
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export function readGbpOptions(options: Record<string, unknown> | null | undefined): GbpOptions {
  const o = (options?.google_business ?? {}) as Record<string, unknown>
  const topic = GBP_TOPICS.includes(o.topicType as GbpTopic) ? (o.topicType as GbpTopic) : 'STANDARD'
  const action = GBP_ACTIONS.includes(o.actionType as GbpAction) ? (o.actionType as GbpAction) : 'LEARN_MORE'
  return {
    topicType: topic,
    actionType: action,
    ctaUrl: str(o.ctaUrl, 2048),
    eventTitle: str(o.eventTitle, 58),
    eventStart: str(o.eventStart, 16),
    eventEnd: str(o.eventEnd, 16),
    couponCode: str(o.couponCode, 58),
    redeemUrl: str(o.redeemUrl, 2048),
    terms: str(o.terms, 5000),
  }
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Problemi koje korisnik ispravlja pre zakazivanja (prazno = u redu). */
export function gbpOptionProblems(o: GbpOptions, postLink: string | null): string[] {
  const problems: string[] = []
  if (o.actionType !== 'NONE' && o.actionType !== 'CALL' && !(o.ctaUrl ?? postLink))
    problems.push('Dugme na Google poslovnom profilu traži link: upišite link objave ili adresu dugmeta.')
  if (o.topicType !== 'STANDARD') {
    if (!o.eventTitle) problems.push('Događaj i ponuda na Google poslovnom profilu traže naslov.')
    if (
      !o.eventStart ||
      !o.eventEnd ||
      !LOCAL_DATETIME.test(o.eventStart) ||
      !LOCAL_DATETIME.test(o.eventEnd)
    )
      problems.push('Događaj i ponuda traže početak i kraj (datum i sat).')
    else if (o.eventEnd <= o.eventStart) problems.push('Kraj događaja mora biti posle početka.')
  }
  return problems
}

/** `2026-11-03T18:30` → Google Date i TimeOfDay (sva polja su obavezna). */
export function gbpDateTime(local: string): {
  date: { year: number; month: number; day: number }
  time: { hours: number; minutes: number; seconds: number; nanos: number }
} {
  const [d, t] = local.split('T') as [string, string]
  const [year, month, day] = d.split('-').map(Number) as [number, number, number]
  const [hours, minutes] = t.split(':').map(Number) as [number, number]
  return { date: { year, month, day }, time: { hours, minutes, seconds: 0, nanos: 0 } }
}
