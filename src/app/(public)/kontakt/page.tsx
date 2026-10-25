import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'

export const metadata: Metadata = {
  title: 'Kontakt',
  description: 'Kako da kontaktirate tim Sove: podrška, pitanja o naplati, privatnost i brisanje podataka.',
  alternates: { canonical: '/kontakt' },
}

export default function ContactPage() {
  return (
    <LegalPage title="Kontakt" titleEn="Contact" updated={false}>
      <LegalSection title="Podrška i pitanja">
        <p>
          Za pitanja o aplikaciji, naplati i povezivanju mreža pišite na{' '}
          <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>, na srpskom ili engleskom.
        </p>
      </LegalSection>
      <LegalSection title="Privatnost i brisanje podataka">
        <p>
          Zahteve u vezi sa ličnim podacima šaljite na{' '}
          <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a>. Nalog i podatke možete
          obrisati i sami, uputstvo je na stranici <Link href="/data-deletion">Brisanje podataka</Link>.
        </p>
      </LegalSection>
      <LegalSection title="Firma">
        <p>
          {company.productName} je proizvod firme {company.legalName}.
          {company.address ? ` Adresa: ${company.address}.` : ''}
        </p>
      </LegalSection>
    </LegalPage>
  )
}
