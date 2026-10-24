/** Zajednička skala i format za grafikone (D-092). */
const compact = new Intl.NumberFormat('sr-Latn-RS', { notation: 'compact', maximumFractionDigits: 1 })
export const fullNumber = new Intl.NumberFormat('sr-Latn-RS')

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

/** Podeoci se skraćuju (12 hilj.) tek kad korak ose to podnosi; inače se ponavljaju isti natpisi. */
export function tickFormatter(scale: Scale): (v: number) => string {
  return scale.step >= 1000 ? (v) => compact.format(v) : (v) => fullNumber.format(v)
}

/** Vrednost na grafikonu: pun broj do 10.000, preko toga skraćen. */
export function valueLabel(v: number): string {
  return Math.abs(v) >= 10_000 ? compact.format(v) : fullNumber.format(v)
}

export const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('sr-Latn-RS', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
