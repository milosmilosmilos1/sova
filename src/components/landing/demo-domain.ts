/**
 * Adresa iz forme na landingu (D-098): bez razmaka, protokola, `www.`, putanje i upita, malim
 * slovima, najviše 40 znakova. Prazno znači da ostaje prethodna adresa. Primer adrese dok posetilac
 * ne unese svoju je u porukama (`site.demo.domain`), na jeziku strane (D-130).
 */
export function cleanDomain(value: string): string {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#\s]/)[0]
  return (host ?? '').slice(0, 40)
}
