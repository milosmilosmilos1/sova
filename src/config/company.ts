/**
 * Podaci o vlasniku platforme za pravne stranice i emailove.
 * Adresa i poštanski podaci se dopunjavaju kad ih vlasnik dostavi (docs/PROGRESS.md).
 */
export const company = {
  productName: 'Sova',
  legalName: 'TangerineSEO LLC',
  domain: 'sovaai.rs',
  appUrl: 'https://sovaai.rs',
  /** Adresa sedišta: dopuniti pre prijava kod Mete i Google-a. */
  address: '',
  /** Kontakt za privatnost i brisanje podataka. Prebaciti na adresu @sovaai.rs kad sanduče postoji. */
  privacyEmail: 'milos.milosevic.seo@gmail.com',
  supportEmail: 'milos.milosevic.seo@gmail.com',
  /** Datum poslednje izmene pravnih dokumenata. */
  legalUpdatedAt: '2026-10-23',
} as const
