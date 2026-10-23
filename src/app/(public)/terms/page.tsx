import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'

export const metadata: Metadata = {
  title: 'Uslovi korišćenja',
  description: 'Uslovi pod kojima koristite platformu Sova.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Uslovi korišćenja" titleEn="Terms of Service">
      <LegalSection title="1. Ugovorne strane i prihvatanje">
        <p>
          Ove uslove zaključujete sa <strong>{company.legalName}</strong> (u daljem tekstu „mi”), vlasnikom
          platforme {company.productName}. Registracijom naloga potvrđujete da ste ih pročitali i prihvatili.
          Ako nalog otvarate u ime firme ili agencije, potvrđujete da ste ovlašćeni da je obavežete.
        </p>
      </LegalSection>

      <LegalSection title="2. Šta je Sova">
        <p>
          Sova je softver koji pomaže u vođenju društvenih mreža: analizira vaš sajt, predlaže strategiju,
          generiše tekstove i vizuale uz pomoć veštačke inteligencije, zakazuje i objavljuje sadržaj na
          mrežama koje povežete i prikazuje rezultate. Sova je alat; odluke o tome šta se objavljuje donosite
          vi.
        </p>
      </LegalSection>

      <LegalSection title="3. Nalog">
        <LegalList
          items={[
            'Morate imati najmanje 18 godina i dati tačne podatke.',
            'Odgovorni ste za čuvanje lozinke i za sve što se dogodi pod vašim nalogom. Preporučujemo dvofaktorsku zaštitu.',
            'Jedan besplatan nalog po osobi. Otvaranje više besplatnih naloga radi dodatnih tokena nije dozvoljeno.',
            'Članove tima i klijente koje pozovete u radni prostor obavezuju isti uslovi.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Povezane društvene mreže">
        <p>
          Povezivanjem naloga na nekoj mreži ovlašćujete Sovu da u vaše ime objavljuje sadržaj koji ste
          odobrili ili koji nastaje u režimu Autopilota koji ste sami uključili, da uvozi vaše ranije objave i
          da čita metrike. Ovlašćenje možete povući u svakom trenutku u aplikaciji (Integracije → Prekini
          vezu) ili u podešavanjima same mreže. Dužni ste da poštujete pravila svake mreže; mi ne odgovaramo
          za ograničenja, odbijanja ili suspenzije koje mreža primeni na vaš nalog.
        </p>
      </LegalSection>

      <LegalSection title="5. Vaš sadržaj i veštačka inteligencija">
        <LegalList
          items={[
            'Sadržaj koji otpremite ili kreirate u Sovi ostaje vaš. Dajete nam samo dozvolu da ga obrađujemo, čuvamo i objavljujemo u vaše ime, koliko je potrebno za rad usluge.',
            'Sadržaj koji generiše veštačka inteligencija može biti netačan ili neprikladan. Pre objave ga pregledajte. Sova proverava činjenice samo naspram podataka iz vašeg profila brenda i ne garantuje tačnost.',
            'Odgovorni ste za sve što objavite: autorska prava na fotografije, tačnost cena i tvrdnji, poštovanje propisa o oglašavanju i pravila mreža.',
            'Zabranjeno je: nezakonit, uvredljiv, obmanjujući ili diskriminatorski sadržaj; spam; sadržaj koji krši tuđa prava; pokušaji zaobilaženja bezbednosnih mera ili ograničenja AI servisa.',
            'Fotografije sa Unsplasha i dizajni iz Canve podležu uslovima tih servisa, koje prihvatate kad ih koristite.',
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Tokeni, planovi i plaćanje">
        <LegalList
          items={[
            'Radnje koje koriste veštačku inteligenciju troše tokene. Cena svake radnje je prikazana u aplikaciji pre potvrde. Tokeni se rezervišu pre radnje i naplaćuju tek kad radnja uspe; neuspela radnja ne troši tokene.',
            'Besplatan nalog dobija jednokratnu količinu tokena posle potvrde email adrese. Mesečni i godišnji plan dobijaju tokene po obračunskom periodu; neiskorišćeni tokeni iz pretplate ne prenose se u sledeći period. Dodatno kupljeni paketi tokena ne ističu.',
            'Pretplate se naplaćuju unapred preko Stripe-a i automatski obnavljaju dok ih ne otkažete. Otkazivanje važi od kraja tekućeg perioda; do tada zadržavate pristup.',
            'Cene mogu da se promene uz obaveštenje najmanje 30 dana unapred; promena važi od sledećeg obračunskog perioda.',
            'Povraćaj novca za iskorišćene tokene nije moguć. Za neiskorišćenu pretplatu u prvih 14 dana od prve kupovine možete tražiti povraćaj pisanjem na našu adresu podrške.',
            'Tokeni nemaju novčanu vrednost van Sove i ne mogu se prenositi između radnih prostora.',
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Dostupnost i podrška">
        <p>
          Trudimo se da Sova radi bez prekida, ali ne garantujemo dostupnost. Sova zavisi od API-ja društvenih
          mreža, Google Gemini servisa i drugih dobavljača na koje ne utičemo; njihovi prekidi, promene
          pravila ili ukidanje pristupa mogu privremeno ili trajno onemogućiti pojedine funkcije. Ako objava
          ne uspe, Sova vas obaveštava i nudi ponovni pokušaj ili ručno objavljivanje.
        </p>
      </LegalSection>

      <LegalSection title="8. Intelektualna svojina">
        <p>
          Softver, dizajn, naziv Sova i dokumentacija su naše vlasništvo ili vlasništvo naših davalaca
          licence. Ne smete kopirati, menjati, dekompilirati ni preprodavati Sovu bez pisane dozvole. Povratne
          informacije koje nam date možemo slobodno koristiti.
        </p>
      </LegalSection>

      <LegalSection title="9. Ograničenje odgovornosti">
        <p>
          Sova se pruža „takva kakva jeste”. U meri u kojoj zakon dozvoljava, ne odgovaramo za indirektnu
          štetu, izgubljenu dobit, gubitak podataka ni za posledice sadržaja koji ste objavili. Naša ukupna
          odgovornost po ovim uslovima ograničena je na iznos koji ste nam platili u 12 meseci pre događaja
          koji je doveo do štete. Ništa u ovim uslovima ne isključuje odgovornost koja se po zakonu ne može
          isključiti.
        </p>
      </LegalSection>

      <LegalSection title="10. Prekid">
        <p>
          Nalog možete obrisati u svakom trenutku (postupak je na strani{' '}
          <Link href="/data-deletion">Brisanje podataka</Link>). Mi možemo da suspendujemo ili ukinemo nalog
          koji krši ove uslove, pravila mreža ili zakon, uz obaveštenje kad je to razumno moguće. Odredbe o
          sadržaju, odgovornosti i merodavnom pravu važe i posle prekida.
        </p>
      </LegalSection>

      <LegalSection title="11. Merodavno pravo">
        <p>
          Na ove uslove primenjuje se pravo države u kojoj je registrovan {company.legalName}, uz poštovanje
          obaveznih propisa o zaštiti potrošača i podataka o ličnosti u zemlji vašeg prebivališta. Sporove
          ćemo prvo pokušati da rešimo dogovorom.
        </p>
      </LegalSection>

      <LegalSection title="12. Izmene uslova">
        <p>
          O izmenama ovih uslova obavestićemo vas emailom ili u aplikaciji najmanje 14 dana unapred. Nastavak
          korišćenja posle tog roka znači prihvatanje izmena.
        </p>
      </LegalSection>

      <LegalSection title="13. Kontakt">
        <p>
          Pitanja o ovim uslovima: <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>.
        </p>
      </LegalSection>

      <hr />

      <LegalSection title="Terms of Service (English summary)">
        <LegalList
          items={[
            <>
              These terms are an agreement between you and <strong>{company.legalName}</strong>, operator of{' '}
              {company.productName}. By creating an account you accept them.
            </>,
            'Sova is a social media management tool with AI assistance. You decide what gets published and you are responsible for the content you publish, including copyright, accuracy and compliance with each network’s rules.',
            'By connecting a social account you authorise Sova to publish approved content on your behalf, import your past posts and read metrics. You can revoke this at any time.',
            'AI-generated content may be inaccurate; review it before publishing.',
            'AI actions consume tokens. Tokens are reserved before an action and charged only on success. Subscription tokens do not roll over; purchased top-up tokens do not expire. Subscriptions renew automatically until cancelled; cancellation takes effect at the end of the current period. Price changes are announced at least 30 days ahead.',
            'The service is provided “as is”. Our total liability is limited to the amount you paid us in the 12 months before the event giving rise to the claim, to the extent permitted by law.',
            'You may delete your account at any time. We may suspend accounts that breach these terms, network rules or the law.',
            <>
              Governing law is the law of the jurisdiction where {company.legalName} is registered, without
              prejudice to mandatory consumer and data protection rules in your country.
            </>,
          ]}
        />
      </LegalSection>
    </LegalPage>
  )
}
