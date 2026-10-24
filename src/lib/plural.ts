/**
 * Srpski oblik uz broj: 1, 21, 31… → `one`; 2–4, 22–24… → `few`; ostalo (i 11–14) → `many`.
 * Primer: pluralSr(n, 'zakazana objava', 'zakazane objave', 'zakazanih objava').
 */
export function pluralSr(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
