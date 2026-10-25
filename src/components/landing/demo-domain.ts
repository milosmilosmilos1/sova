/** Primer adrese u demo prikazu dok posetilac ne unese svoju. */
export const DEMO_DOMAIN = 'pekarazrno.rs'

/**
 * Adresa iz forme na landingu (D-098): bez razmaka, protokola, `www.`, putanje i upita, malim
 * slovima, najviše 40 znakova. Prazno znači da ostaje prethodna adresa.
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
