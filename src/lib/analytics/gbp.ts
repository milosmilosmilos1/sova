/**
 * Dnevne metrike Google poslovnog profila (Business Profile Performance API). Svaka metrika ostaje
 * posebno: pravila API-ja ne dozvoljavaju da se različite metrike sabiraju u jedan broj (D-188), pa
 * nema „ukupnih prikaza” ni „ukupnih radnji”. Za period se sabiraju samo dnevne vrednosti iste metrike,
 * isto što API vraća za opseg datuma.
 */
export const GBP_IMPRESSION_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
] as const
export const GBP_ACTION_METRICS = [
  'WEBSITE_CLICKS',
  'CALL_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'MESSAGING_CLICKS',
] as const
export const GBP_METRICS = [...GBP_IMPRESSION_METRICS, ...GBP_ACTION_METRICS] as const
export type GbpMetric = (typeof GBP_METRICS)[number]

export interface GbpLocationTotals {
  accountId: string
  name: string | null
  /** dani sa snimkom u periodu */
  days: number
  metrics: Record<GbpMetric, number>
}

const isGbpMetric = (k: string): k is GbpMetric => (GBP_METRICS as readonly string[]).includes(k)

/** Zbir svake metrike posebno, po lokaciji, iz sirovih dnevnih snimaka (`account_metrics_daily.raw`). */
export function gbpLocationTotals(
  rows: Array<{ accountId: string; raw: unknown }>,
  names: Map<string, string | null>,
): GbpLocationTotals[] {
  const byAccount = new Map<string, GbpLocationTotals>()
  for (const row of rows) {
    if (!row.raw || typeof row.raw !== 'object') continue
    let loc = byAccount.get(row.accountId)
    if (!loc) {
      loc = {
        accountId: row.accountId,
        name: names.get(row.accountId) ?? null,
        days: 0,
        metrics: Object.fromEntries(GBP_METRICS.map((m) => [m, 0])) as Record<GbpMetric, number>,
      }
      byAccount.set(row.accountId, loc)
    }
    loc.days += 1
    for (const [key, value] of Object.entries(row.raw as Record<string, unknown>)) {
      if (isGbpMetric(key) && typeof value === 'number' && Number.isFinite(value)) loc.metrics[key] += value
    }
  }
  return [...byAccount.values()]
}
