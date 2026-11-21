/**
 * Podaci o vlasniku platforme za pravne stranice i emailove.
 * Adresa je registrovana adresa firme (TangerineSEO LLC, Vajoming, SAD); poreski broj, telefon i
 * podaci banke namerno nisu ovde, jer se ne objavljuju na sajtu.
 */
export const company = {
  productName: 'Sova',
  legalName: 'TangerineSEO LLC',
  /**
   * Pravi domen platforme: samo na njemu se sajt indeksira (D-095). Dok ne proradi, pravne strane i
   * mejlovi pokazuju adresu na kojoj Sova stvarno radi (`siteUrl()` iz NEXT_PUBLIC_APP_URL).
   */
  domain: 'sovaai.rs',
  appUrl: 'https://sovaai.rs',
  /** Registrovana adresa firme (Vajoming, SAD; merodavno pravo u uslovima korišćenja, s11). */
  address: '75 E 3rd St, Ste 7, Sheridan, WY 82801, USA',
  /** Kontakt za privatnost i brisanje podataka. */
  privacyEmail: 'podrska@sovaai.rs',
  supportEmail: 'podrska@sovaai.rs',
  /** Datum poslednje izmene pravnih dokumenata. */
  legalUpdatedAt: '2026-11-22',
} as const
