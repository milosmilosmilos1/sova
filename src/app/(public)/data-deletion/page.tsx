import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'

export const metadata: Metadata = {
  title: 'Brisanje podataka',
  description: 'Kako da obrišete nalog, prekinete vezu sa mrežom ili zatražite brisanje podataka iz Sove.',
}

export default async function DataDeletionPage({ searchParams }: PageProps<'/data-deletion'>) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code : null

  return (
    <LegalPage title="Brisanje podataka" titleEn="Data Deletion Instructions">
      {code ? (
        <div className="rounded-lg border bg-muted p-4">
          <p className="font-medium">Zahtev za brisanje je primljen.</p>
          <p className="text-sm text-muted-foreground">
            Kod potvrde: <code className="font-mono">{code}</code>. Brisanje se izvršava u roku od 30 dana. O
            završetku ćemo obavestiti email adresu povezanu sa nalogom. / Your deletion request has been
            received and will be completed within 30 days.
          </p>
        </div>
      ) : null}

      <LegalSection title="1. Brisanje celog naloga (u aplikaciji)">
        <LegalList
          items={[
            'Prijavite se u Sovu.',
            'Otvorite Podešavanja → Nalog → Brisanje naloga.',
            'Ukucajte svoju email adresu radi potvrde i kliknite „Obriši nalog”.',
            'Sova odmah opoziva pristupne tokene svih povezanih mreža, otkazuje zakazane objave i briše podatke. Brisanje iz rezervnih kopija završava se najkasnije za 30 dana.',
          ]}
        />
        <p>
          Ako ste jedini vlasnik radnog prostora sa drugim članovima, prvo prenesite vlasništvo ili obrišite
          radni prostor; aplikacija vas vodi kroz taj korak.
        </p>
      </LegalSection>

      <LegalSection title="2. Prekid veze sa jednom mrežom">
        <p>
          Otvorite Integracije, pronađite nalog i kliknite „Prekini vezu”. Sova briše pristupni token, uvezene
          objave i metrike tog naloga. Već objavljen sadržaj ostaje na mreži; njega brišete direktno na mreži.
        </p>
        <p>
          Vezu možete prekinuti i sa strane mreže: Facebook i Instagram (Podešavanja → Aplikacije i sajtovi),
          LinkedIn (Podešavanja → Dozvole aplikacija), TikTok (Podešavanja → Bezbednost → Aplikacije), X
          (Podešavanja → Povezane aplikacije), Google (myaccount.google.com → Bezbednost → Aplikacije trećih
          strana), Pinterest (Podešavanja → Bezbednost → Povezane aplikacije). Sova to prepoznaje i briše
          tokene.
        </p>
      </LegalSection>

      <LegalSection title="3. Zahtev emailom">
        <p>
          Ako ne možete da se prijavite, pošaljite email sa adrese kojom ste registrovani na{' '}
          <a href={`mailto:${company.privacyEmail}?subject=Brisanje%20podataka`}>{company.privacyEmail}</a> sa
          naslovom „Brisanje podataka”. Potvrdićemo identitet i obrisati podatke u roku od 30 dana.
        </p>
      </LegalSection>

      <LegalSection title="4. Šta se briše, a šta ostaje">
        <LegalList
          items={[
            'Briše se: profil, radni prostori čiji ste jedini vlasnik, brendovi, profil brenda i znanje o brendu, povezani nalozi i tokeni, uvezene i kreirane objave, mediji, strategije, metrike, obaveštenja.',
            'Ostaje u zakonskom roku: fakture i podaci o plaćanju koje moramo čuvati po računovodstvenim propisima, kao i anonimizovani zbirni podaci o korišćenju koji ne mogu da vas identifikuju.',
            'Ako ste član tuđeg radnog prostora, brišu se vaši lični podaci, a sadržaj koji ste kreirali za taj radni prostor ostaje njegovom vlasniku.',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Automatski zahtevi sa Facebooka i Instagrama">
        <p>
          Kad uklonite Sovu iz podešavanja Facebook ili Instagram naloga, Meta nam automatski šalje zahtev za
          brisanje. Sova odmah briše podatke tog naloga i vraća vam kod potvrde i link na ovu stranicu, gde
          možete proveriti status.
        </p>
      </LegalSection>

      <hr />

      <LegalSection title="Data Deletion (English)">
        <LegalList
          items={[
            'Delete your whole account in the app: Settings → Account → Delete account, type your email to confirm. Tokens for all connected networks are revoked immediately, scheduled posts are cancelled and data is deleted; backups are purged within 30 days.',
            'Disconnect a single network: Integrations → Disconnect. The token, imported posts and metrics for that account are deleted. Content already published stays on the network.',
            <>
              Request by email: write from your registered address to{' '}
              <a href={`mailto:${company.privacyEmail}?subject=Data%20deletion`}>{company.privacyEmail}</a>{' '}
              with the subject “Data deletion”. We verify your identity and delete within 30 days.
            </>,
            'Invoices and payment records are kept for the period required by accounting law; everything else is deleted.',
            'When you remove Sova from your Facebook or Instagram settings, Meta sends us an automatic deletion request. We delete that account’s data immediately and return a confirmation code with a link to this page.',
          ]}
        />
        <p>
          See also the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
