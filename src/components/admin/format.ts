/** Formatiranje za admin panel (srpski format brojeva i datuma). */
export const fmtN = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('sr-Latn-RS')

export const fmtUsd = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined
    ? '—'
    : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('sr-Latn-RS', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) })}`

export const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('sr-Latn-RS')} %`

export function fmtDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('sr-Latn-RS', {
    timeZone: 'Europe/Belgrade',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}
