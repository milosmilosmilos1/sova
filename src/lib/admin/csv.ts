/**
 * CSV za izvoz audit loga (brif 16): RFC 4180 navodnici, CRLF redovi, zaštita od formula u Excelu
 * (vrednost koja počinje sa =, +, - ili @ dobija apostrof ispred).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s =
    typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))]
  return `${lines.join('\r\n')}\r\n`
}
