/** Zajednička skala i format za grafikone (D-092). */

export interface Scale {
  lo: number
  hi: number
  step: number
  ticks: number[]
}

/** Okrugla granica ose (korak 1, 2, 2,5, 5 × 10^k), oko 4 podeoka; bez nule po potrebi (pratioci). */
export function niceScale(min: number, max: number, zeroBaseline = true): Scale {
  let lo = zeroBaseline ? 0 : min
  let hi = max
  if (hi === lo) hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.1)
  if (!zeroBaseline) {
    const pad = (hi - lo) * 0.15
    lo = Math.max(0, lo - pad)
    hi += pad
  }
  const raw = (hi - lo) / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return { lo, hi, step, ticks }
}

/** Brojevi i datumi grafikona na zadatom jeziku (D-130): `INTL_UI[locale]` ili jezik izveštaja. */
export function chartNumbers(tag = 'sr-Latn-RS') {
  const full = new Intl.NumberFormat(tag)
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 })
  const usd = new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
  const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return {
    full: (v: number) => full.format(v),
    usd: (v: number) => usd.format(v),
    /** Podeoci se skraćuju (12 hilj.) tek kad korak ose to podnosi; inače se ponavljaju isti natpisi. */
    tick: (scale: Scale) =>
      scale.step >= 1000 ? (v: number) => compact.format(v) : (v: number) => full.format(v),
    /** Vrednost na grafikonu: pun broj do 10.000, preko toga skraćen. */
    value: (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : full.format(v)),
    /** dan iz `YYYY-MM-DD` (npr. „20. okt”) */
    day: (iso: string) => day.format(new Date(`${iso}T12:00:00Z`)),
  }
}

/** Dan na srpskom, za admin panel (ostaje na srpskom). */
export const dayLabel = chartNumbers().day
