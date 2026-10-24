/**
 * Pravila naplate bez baze i mreže (D-090), da bi se testirala zasebno.
 */

/** Rok posle neuspelog plaćanja (T9): generisanje radi još 7 dana. */
export const GRACE_DAYS = 7
/** Podsetnici za neuspelo plaćanje: dan 1, 3 i 6 roka (korak 1, 2, 3). */
export const DUNNING_DAYS = [1, 3, 6] as const

const DAY_MS = 86_400_000

/** `date + n` meseci u UTC; dan koji ne postoji pada na poslednji dan meseca (31.1. + 1 → 28/29.2.). */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

export interface TokenSlice {
  index: number
  start: Date
  end: Date
}

/**
 * Mesečni deo plaćenog perioda koji sadrži `now` (godišnji plan daje tokene mesečno, T13). Kraj dela je
 * najviše kraj perioda. Van perioda nema dela.
 */
export function tokenSlice(periodStart: Date, periodEnd: Date, now: Date): TokenSlice | null {
  if (now < periodStart || now >= periodEnd) return null
  for (let index = 0; ; index++) {
    const start = addMonthsUtc(periodStart, index)
    const next = addMonthsUtc(periodStart, index + 1)
    if (now < next || next >= periodEnd) return { index, start, end: next < periodEnd ? next : periodEnd }
  }
}

/** Referenca granta za deo perioda: jedinstvena po pretplati i početku dela (UNIQUE štiti od duplikata). */
export function sliceReference(subscriptionId: string, sliceStart: Date): string {
  return `${subscriptionId}:${sliceStart.toISOString().slice(0, 10)}`
}

/** Tokeni koje treba oduzeti za vraćen novac: srazmerno vraćenom delu, zaokruženo. */
export function refundTokens(grantedTokens: number, amountRefunded: number, amountCharged: number): number {
  if (grantedTokens <= 0 || amountCharged <= 0 || amountRefunded <= 0) return 0
  return Math.round((grantedTokens * Math.min(amountRefunded, amountCharged)) / amountCharged)
}

/** Kraj roka za plaćanje: postojeći rok ostaje, inače 7 dana od neuspeha. */
export function graceUntil(existing: string | null, failedAt: Date): string {
  return existing ?? new Date(failedAt.getTime() + GRACE_DAYS * DAY_MS).toISOString()
}

/** Koji podsetnik je na redu (0 = nijedan) prema danima proteklim od početka roka. */
export function dunningStepDue(graceUntilIso: string, now: Date): number {
  const started = new Date(graceUntilIso).getTime() - GRACE_DAYS * DAY_MS
  const days = (now.getTime() - started) / DAY_MS
  let step = 0
  DUNNING_DAYS.forEach((d, i) => {
    if (days >= d) step = i + 1
  })
  return step
}

/** Generisanje staje posle roka za plaćanje ili kad je pretplata `unpaid` (T9, K6). */
export function billingBlocked(
  sub: { status: string; grace_until: string | null } | null,
  now: Date,
): boolean {
  if (!sub) return false
  if (sub.status === 'unpaid') return true
  return sub.status === 'past_due' && Boolean(sub.grace_until) && now > new Date(sub.grace_until!)
}
