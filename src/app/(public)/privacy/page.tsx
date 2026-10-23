import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'

export const metadata: Metadata = {
  title: 'Politika privatnosti',
  description: 'Kako Sova prikuplja, koristi i štiti podatke o ličnosti.',
}

const processors = [
  ['Supabase', 'baza podataka, autentifikacija, skladište fajlova'],
  ['Vercel', 'hosting aplikacije i isporuka sadržaja'],
  ['Google (Gemini API)', 'generisanje teksta i slika, analiza sadržaja sajta i slika'],
  ['Stripe', 'naplata pretplata i paketa tokena'],
  ['Resend', 'slanje transakcionih emailova'],
  ['Upstash', 'ograničavanje broja zahteva i privremeni keš'],
  ['Inngest', 'pozadinski poslovi (analiza sajta, objavljivanje, metrike)'],
  ['Sentry', 'praćenje tehničkih grešaka'],
  ['PostHog', 'analitika korišćenja proizvoda'],
  ['Cloudflare Turnstile', 'zaštita od botova pri registraciji'],
  ['Unsplash i Canva', 'fotografije i dizajni, samo kad ih vi izaberete'],
] as const

export default function PrivacyPage() {
  return (
    <LegalPage title="Politika privatnosti" titleEn="Privacy Policy">
      <LegalSection title="1. Ko je rukovalac podacima">
        <p>
          Rukovalac podacima je <strong>{company.legalName}</strong>, vlasnik platforme {company.productName}{' '}
          dostupne na {company.domain}. Za sva pitanja o zaštiti podataka pišite na{' '}
          <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a>.
          {company.address ? ` Adresa: ${company.address}.` : ''}
        </p>
      </LegalSection>

      <LegalSection title="2. Koje podatke obrađujemo">
        <LegalList
          items={[
            <>
              <strong>Podaci o nalogu:</strong> ime, email adresa, lozinka (čuva se samo kao heš kod našeg
              obrađivača za autentifikaciju), jezik, vremenska zona, podešavanja obaveštenja.
            </>,
            <>
              <strong>Podaci o brendu:</strong> URL sajta i javno dostupan sadržaj sa njega (tekstovi, logo,
              boje, fontovi, slike, podaci o uslugama), opisi koje sami unesete, podaci o konkurentima koje
              dodate.
            </>,
            <>
              <strong>Podaci sa povezanih društvenih mreža:</strong> identifikator i naziv naloga ili
              stranice, slika profila, pristupni tokeni koje nam mreža izda kad odobrite povezivanje, vaše
              ranije objave sa javnim metrikama (doseg, reakcije, komentari), metrike objava koje Sova objavi
              u vaše ime.
            </>,
            <>
              <strong>Sadržaj koji kreirate u Sovi:</strong> tekstovi objava, fotografije i video koje
              otpremite, generisane slike, strategije, komentari i odluke o odobravanju.
            </>,
            <>
              <strong>Podaci o plaćanju:</strong> obrađuje ih Stripe. Mi čuvamo samo identifikator kupca,
              plan, status pretplate i istoriju tokena. Broj kartice nikad ne dolazi do nas.
            </>,
            <>
              <strong>Tehnički podaci:</strong> IP adresa, tip pregledača i uređaja, vreme pristupa, zapisi o
              greškama, kolačići neophodni za sesiju.
            </>,
            <>
              <strong>Podaci članova tima i klijenata:</strong> email adrese osoba koje pozovete u radni
              prostor i njihove odluke o odobravanju objava.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Svrhe i pravni osnov">
        <LegalList
          items={[
            'Pružanje usluge koju ste zatražili (analiza sajta, kreiranje sadržaja, zakazivanje i objavljivanje, analitika): izvršenje ugovora.',
            'Bezbednost naloga, sprečavanje zloupotrebe i otklanjanje grešaka: legitimni interes.',
            'Naplata i računovodstvena evidencija: izvršenje ugovora i zakonska obaveza.',
            'Emailovi o stanju naloga, neuspelim objavama i odobrenjima: izvršenje ugovora. Marketinški emailovi samo uz vašu saglasnost, koju možete povući u svakom trenutku.',
            'Analitika korišćenja proizvoda i kolačići koji nisu neophodni: saglasnost.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Podaci sa platformi trećih strana">
        <p>
          Kad povežete Facebook, Instagram, LinkedIn, TikTok, X, YouTube, Pinterest ili Google poslovni
          profil, Sova dobija pristup isključivo onim podacima koje ste odobrili u toku povezivanja. Te
          podatke koristimo samo za funkcije koje ste tražili: objavljivanje sadržaja u vaše ime, uvoz ranijih
          objava radi učenja o brendu i prikaz metrika. Podatke sa platformi ne prodajemo, ne koristimo za
          oglašavanje i ne delimo sa trećim stranama osim obrađivača iz odeljka 5. Pristupni tokeni se čuvaju
          šifrovani (AES-256-GCM) i brišu se čim prekinete vezu sa nalogom.
        </p>
        <p>
          Korišćenje podataka dobijenih preko Google API-ja (YouTube, Google poslovni profil, Google prijava)
          u skladu je sa{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noreferrer"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , uključujući zahteve o ograničenoj upotrebi (Limited Use). Korišćenje podataka sa Meta platformi u
          skladu je sa Meta Platform Terms, a sa TikToka sa TikTok Developer Terms.
        </p>
      </LegalSection>

      <LegalSection title="5. Obrađivači kojima poveravamo podatke">
        <LegalList
          items={processors.map(([name, purpose]) => (
            <>
              <strong>{name}</strong>: {purpose}
            </>
          ))}
        />
        <p>
          Sa svakim obrađivačem imamo ugovor o obradi podataka. Neki od njih obrađuju podatke u Sjedinjenim
          Američkim Državama; prenos se zasniva na standardnim ugovornim klauzulama ili EU-US Data Privacy
          Framework-u.
        </p>
      </LegalSection>

      <LegalSection title="6. Veštačka inteligencija">
        <p>
          Za generisanje teksta i slika i za analizu sajta koristimo Google Gemini API. Gemini-ju šaljemo
          javni sadržaj vašeg sajta, opis brenda, vaše unose i fotografije koje sami priložite. Po uslovima
          plaćenog Gemini API-ja, Google te podatke ne koristi za treniranje svojih modela. Vizuali koje
          napravi veštačka inteligencija su u aplikaciji označeni kao AI generisani, a tamo gde mreža to
          podržava, Sova postavlja i oznaku na samoj objavi.
        </p>
      </LegalSection>

      <LegalSection title="7. Koliko dugo čuvamo podatke">
        <LegalList
          items={[
            'Podatke naloga i brenda: dok nalog postoji, a zatim najviše 30 dana posle brisanja naloga.',
            'Pristupne tokene mreža: dok je nalog povezan; brišu se odmah po prekidu veze.',
            'Tehničke zapise (logove): do 90 dana.',
            'Podatke o plaćanju i fakture: u roku koji propisuju računovodstveni propisi.',
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Vaša prava">
        <p>
          Po Opštoj uredbi o zaštiti podataka (GDPR) i Zakonu o zaštiti podataka o ličnosti Republike Srbije
          imate pravo na pristup, ispravku, brisanje, ograničenje obrade, prenosivost podataka, prigovor na
          obradu i povlačenje saglasnosti. Zahtev pošaljite na{' '}
          <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a> i odgovorićemo u roku od 30
          dana. Imate pravo i na pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o
          ličnosti (Srbija) ili nadzornom organu u svojoj zemlji.
        </p>
        <p>
          Nalog i sve podatke možete obrisati sami, bez kontakta sa nama. Postupak je opisan na strani{' '}
          <Link href="/data-deletion">Brisanje podataka</Link>.
        </p>
      </LegalSection>

      <LegalSection title="9. Kolačići">
        <p>
          Neophodni kolačići služe za prijavu, zaštitu od zloupotrebe i pamćenje jezika i ne traže saglasnost.
          Kolačići za analitiku korišćenja postavljaju se samo ako ih prihvatite. Pregledač možete podesiti da
          odbija kolačiće, ali bez neophodnih kolačića prijava ne radi.
        </p>
      </LegalSection>

      <LegalSection title="10. Bezbednost">
        <p>
          Podaci putuju šifrovano (TLS). Pristupni tokeni su šifrovani u bazi, pristup podacima je ograničen
          politikama na nivou baze tako da svaki korisnik vidi samo svoj radni prostor, a pristup osoblja je
          zabeležen u evidenciji. Ni jedan sistem nije potpuno bezbedan; u slučaju povrede podataka
          obavestićemo vas i nadležni organ u zakonskom roku.
        </p>
      </LegalSection>

      <LegalSection title="11. Deca">
        <p>
          Sova je namenjena poslovnim korisnicima starijim od 18 godina. Ne prikupljamo svesno podatke dece.
        </p>
      </LegalSection>

      <LegalSection title="12. Izmene">
        <p>
          O važnim izmenama ove politike obavestićemo vas emailom ili obaveštenjem u aplikaciji najmanje 14
          dana pre stupanja na snagu.
        </p>
      </LegalSection>

      <hr />

      <LegalSection title="Privacy Policy (English summary)">
        <p>
          <strong>{company.legalName}</strong> operates {company.productName} ({company.domain}). Contact for
          privacy matters: <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a>.
        </p>
        <LegalList
          items={[
            <>
              <strong>Data we process:</strong> account data (name, email, hashed password, preferences);
              brand data (your website URL and its public content); data from social accounts you connect
              (account IDs and names, access tokens, your past posts and public metrics, metrics of posts
              published by Sova); content you create in Sova; billing identifiers (card details stay with
              Stripe); technical logs; team members&apos; and clients&apos; emails and approval decisions.
            </>,
            <>
              <strong>Purposes and legal bases:</strong> providing the service (contract), security and abuse
              prevention (legitimate interest), billing (contract and legal obligation), product analytics and
              non-essential cookies (consent).
            </>,
            <>
              <strong>Third-party platform data:</strong> used only for the features you request (publishing
              on your behalf, importing history, showing metrics). Never sold, never used for advertising.
              Tokens are stored encrypted (AES-256-GCM) and deleted when you disconnect. Sova&apos;s use of
              information received from Google APIs adheres to the Google API Services User Data Policy,
              including the Limited Use requirements.
            </>,
            <>
              <strong>Processors:</strong> Supabase, Vercel, Google Gemini API, Stripe, Resend, Upstash,
              Inngest, Sentry, PostHog, Cloudflare Turnstile, Unsplash and Canva (only when you choose them).
              Transfers to the US rely on Standard Contractual Clauses or the EU-US Data Privacy Framework.
            </>,
            <>
              <strong>AI:</strong> your website content, brand description, inputs and uploaded photos are
              sent to the Google Gemini API to generate content. Paid Gemini API data is not used to train
              Google&apos;s models. AI-generated visuals are labelled.
            </>,
            <>
              <strong>Retention:</strong> account and brand data while the account exists plus up to 30 days;
              tokens until disconnection; logs up to 90 days; invoices as required by law.
            </>,
            <>
              <strong>Your rights:</strong> access, rectification, erasure, restriction, portability,
              objection and withdrawal of consent under the GDPR and the Serbian Personal Data Protection Act.
              You can delete your account yourself; see <Link href="/data-deletion">Data deletion</Link>.
            </>,
            <>
              <strong>Children:</strong> the service is for business users aged 18 and over.
            </>,
          ]}
        />
      </LegalSection>
    </LegalPage>
  )
}
