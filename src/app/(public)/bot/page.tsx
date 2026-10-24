import type { Metadata } from 'next'

import { LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'

export const metadata: Metadata = {
  title: 'SovaBot',
  description: 'Šta je SovaBot, kada čita sajtove i kako da ga dozvolite ili zabranite.',
}

/** Javna strana na koju pokazuje User-Agent crawlera (BOT_INFO_URL). */
export default function BotPage() {
  return (
    <LegalPage title="SovaBot" titleEn="SovaBot crawler">
      <LegalSection title="Šta je SovaBot">
        <p>
          SovaBot je čitač sajtova aplikacije Sova ({company.legalName}). Pokreće ga vlasnik brenda kad u Sovi
          unese adresu svog sajta, da bi Sova naučila ponudu, ton i vizuelni identitet brenda. SovaBot ne
          obilazi internet sam od sebe i ne čita sajtove koje niko nije uneo.
        </p>
      </LegalSection>
      <LegalSection title="Kako se ponaša">
        <ul className="list-disc space-y-1 pl-5">
          <li>Poštuje robots.txt (token User-agent: SovaBot) i Crawl-delay.</li>
          <li>Čita najviše 60 strana po analizi, 3 istovremeno, uz pauzu kad sajt to traži.</li>
          <li>
            Posle prve analize proverava sitemap i RSS jednom nedeljno; stranice ne preuzima ponovo bez
            zahteva vlasnika.
          </li>
          <li>Ne popunjava forme, ne prijavljuje se i ne izvršava JavaScript.</li>
          <li>User-Agent: SovaBot/1.0 (+https://sovaai.rs/bot)</li>
        </ul>
      </LegalSection>
      <LegalSection title="Kako da ga zabranite">
        <p>Dodajte u robots.txt:</p>
        <pre className="rounded-md bg-muted p-3 text-sm">{`User-agent: SovaBot\nDisallow: /`}</pre>
        <p>
          Sova će tada vlasniku brenda prikazati poruku da sajt ne dozvoljava čitanje i ponuditi ručni unos
          podataka. Za pitanja pišite na {company.privacyEmail}.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
