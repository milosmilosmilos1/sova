# Odobrenja platformi za komercijalnu upotrebu

Stanje 13.11.2026. Pravila su čitana sa zvaničnih stranica platformi istog dana (izvori na kraju). Cilj je da se svaki kupac sam poveže, bez uloge testera kod mreže. Ništa od ovoga još nije poslato ni promenjeno.

## Ukratko

- Nijedna prijava ne može da se pošalje danas. Platforme proveravaju istu osnovu: pravi domen, tačnu politiku privatnosti i da aplikacija radi ono što tekst kaže.
- Zajedničke prepreke su domen sovaai.rs (ne postoji u DNS-u), adresa firme i email na domenu, netačni pravni tekstovi i brisanje podataka koje ne briše. Treba ih rešiti pre svih prijava.
- LinkedIn lični profil i Pexels su već dozvoljeni za komercijalnu upotrebu, uz ispravke. Sve ostalo traži pregled kod platforme.

## Stanje 22.11.2026: šta je spremno za slanje

Zajedničke prepreke iz odeljka 1 su rešene (domen, firma, pravni tekstovi, brisanje kod Mete, Autopilot, stok bez AI-ja, logoi). Tekstovi za formulare, scenariji snimaka i redosled su pripremljeni van repoa, u materijalu za mreže (po jedan fajl za svaku prijavu).

| Platforma                | Aplikacija                    | Sledeći korak                                                                                                                                                                                                                                        | Kod pre slanja                                                                                                                                  |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta                     | postoji (razvojni režim)      | App Review (11 dozvola, prva prijava); firma potvrđena 22.11. (TANGERINESEO LLC, email na tangerineseo.com); `pages_manage_engagement` dodata u slučaj upotrebe 22.11.                                                                               | urađeno (D-189); posle objave ponovo povezati Facebook                                                                                          |
| Google (YouTube, profil) | postoji (Testing)             | Search Console Domain property potvrđen 22.11. (TXT u zoni sovaai.rs); formular za Business Profile API, pa provera                                                                                                                                  | urađeno (D-188, čeka objavu): YouTube rečenica i linkovi, bez izvedenih metrika, metrike profila posebno                                        |
| Google prijava           | ne postoji                    | poseban projekat „Sova prijava” (DEPLOY.md 10, 2b)                                                                                                                                                                                                   | nema                                                                                                                                            |
| Google „Sova Dev”        | ne postoji                    | projekat za localhost, pa localhost van produkcionog klijenta                                                                                                                                                                                        | nema                                                                                                                                            |
| TikTok                   | Sandbox                       | Production podešen 22.11. (Login Kit, Content Posting sa Direct Post, Webhooks, 6 dozvola, domen sovaai.rs, tekst za pregled); snimak povezivanja gotov; fale snimci objave i analitike, pa Submit for review                                        | urađeno (D-188). Webhook proba u Sandbox-u 200; u Production-u 403 dok Sova koristi Sandbox ključ (posle odobrenja upisati Production ključeve) |
| LinkedIn lični profil    | postoji, radi za sve          | nema                                                                                                                                                                                                                                                 | nema                                                                                                                                            |
| LinkedIn stranice        | ne postoji                    | aplikacija „Sova Pages” napravljena 22.11. (stranica Sova potvrđena, poslovni email potvrđen), zahtev za Community Management API (Development tier, Platform; Page management i Page analytics) poslat 22.11.; čeka Microsoft Vetting mejl i odluku | drugi par ključeva (`LINKEDIN_PAGES_CLIENT_ID/SECRET`) posle odobrenja                                                                          |
| Canva                    | postoji (javna, nije poslata) | slanje na pregled                                                                                                                                                                                                                                    | nema (D-184)                                                                                                                                    |
| Figma                    | nacrt                         | objava kao javne aplikacije                                                                                                                                                                                                                          | nema (D-184); prekidač `figma` za nalog recenzenta                                                                                              |
| Unsplash                 | Demo                          | Apply for Production                                                                                                                                                                                                                                 | hotlinking, potpis uz svaku fotografiju, bez automatskog izbora (odluka vlasnika)                                                               |
| Pinterest                | ne postoji                    | nalog za firmu „Sova” (podrska@sovaai.rs) i sovaai.rs potvrđen 22.11.; aplikacija „Sova Scheduler” (App ID 1642925) poslata 22.11., Trial access pending                                                                                             | nema (D-085)                                                                                                                                    |
| X                        | ne postoji                    | odluka vlasnika (pay-per-use se plaća)                                                                                                                                                                                                               | nema (D-086)                                                                                                                                    |

Za sve preglede treba probni nalog na engleskom sa gotovim brendom (bez njega su Posts i Studio zaključani). Adresa za prijavu propusta je u `/.well-known/security.txt` (D-188, čeka objavu).

Google poslovni profil: metrike se više ne sabiraju u jedan broj; svaka se čuva i prikazuje posebno (D-188, čeka objavu). Rok čuvanja od 30 dana je i dalje otvoren (odeljak 2, Google).

## 1. Šta blokira sve platforme

1. **Domen.** Pravne strane i `src/config/company.ts` kažu da je Sova na sovaai.rs, a taj domen se ne otvara. Aplikacija radi na sovaai.netlify.app. Google ne prihvata netlify.app za početnu stranu i politiku, jer domen mora biti „tvoj”, a netlify.app je javni sufiks. Rešenje: sovaai.rs usmeriti na Netlify kao glavni domen, pa promeniti adrese u Supabase-u, u env-u (`NEXT_PUBLIC_APP_URL`) i redirect adrese kod svih mreža. Promena domena posle odobrenja traži novi pregled, zato ide prva. **22.11.2026:** domen je kupljen, DNS zona i sandučići `podrska@` i `info@sovaai.rs` su podešeni (D-179); ostaje promena nameservera kod registra, domen u Netlify-ju, Supabase i adrese kod mreža (DEPLOY.md 10, korak 8). **Isto veče sve urađeno:** Sova radi na https://sovaai.rs (deploy 6b023cd9), adrese kod Mete, Google-a, LinkedIn-a, TikTok-a i Canve dopunjene, domen potvrđen na TikTok-u. Za Google ostaje Domain property u Search Console-u.
2. **Firma.** Rešeno 13.11.2026 u `company.ts`: registrovana adresa TangerineSEO LLC (75 E 3rd St, Ste 7, Sheridan, WY 82801, USA), kontakt office@tangerineseo.com umesto ličnog Gmail-a, a u uslovima je merodavno pravo savezne države Vajoming. Poslovni email je na domenu firme (tangerineseo.com), što Meta i LinkedIn traže. Poreski broj, telefon i podaci banke se ne objavljuju na sajtu (za proveru firme kod Mete idu u dokumentima). Pravne strane i mejlovi sada pokazuju adresu na kojoj Sova stvarno radi, a ne sovaai.rs.
3. **Pravni tekstovi nisu tačni ni potpuni** (rešeno 22.11.2026, D-183) (`src/i18n/messages/parts/d/{sr-Latn,en,uk}.json`, ključevi privacy, terms, dataDeletion; `src/app/(public)/privacy/page.tsx`):
   - kao hosting piše Vercel, a mi smo na Netlify-ju;
   - nema Pexels-a, Figme ni LinkedIn-a;
   - ne piše da Gemini dobija uvezene objave sa mreža, poruke i komentare iz Inbox-a, slike iz biblioteke i stock fotografije;
   - Inbox (poruke, komentari, recenzije) i DM automatizacija nisu opisani;
   - nema posebnog dela za Google podatke (YouTube ToS, Google Privacy Policy, Limited Use, rokovi), ni za Metu, TikTok i LinkedIn;
   - nema rokova čuvanja za uvezene podatke i Inbox, ni adrese za prijavu bezbednosnih propusta;
   - uslovi ne prenose obaveze mreža na korisnika (YouTube ToS, Meta pravila za poruke, LinkedIn Pages Terms) i ne zabranjuju ono što mreže zabranjuju.
4. **Brisanje podataka ne briše.** Kad Meta pošalje zahtev za brisanje, Sova samo označi nalog kao opozvan (`src/services/social/webhooks.ts`), a strana za status samo ponovi kod. Kad korisnik ukloni Sovu kod mreže, tokeni i uvezeni podaci ostaju, a strana o brisanju kaže suprotno. Meta za ovo može da ugasi aplikaciju.
5. **Autopilot objavljuje bez odobrenja svake objave** (rešeno 22.11.2026, D-182: TikTok, LinkedIn i Pinterest uvek čekaju „Odobri”, X samo uz potvrdu oznake „Automated”) (nivo 3 i „objavi ako niko ne odobri do roka”). LinkedIn to izričito zabranjuje (API Terms 3.1(26)), TikTok traži izričitu saglasnost za svaku objavu, a X traži oznaku „Automated”. Na sajtu piše „ili automatski”. Rešenje: TikTok, LinkedIn i X isključiti iz automatskog objavljivanja, kao što je već Pinterest.
6. **Provera ljudi na fotografijama (D-154). Rešeno 22.11.2026 (D-180): stok bez AI obrade, izgled ljudi se nigde ne procenjuje.** Gemini procenjuje izgled ljudi na Unsplash i Pexels fotografijama. Unsplash zabranjuje „data mining” i AI obradu, Pexels automatsku obradu „za mašinsko učenje”, Canva zaključivanje osetljivih osobina, a zaključivanje etničkog porekla je i posebna kategorija podataka po GDPR-u (čl. 9). Pregled ovo neće videti, ali na pitanje o AI obradi mora se odgovoriti istinito. Odluka vlasnika (vidi odeljak 4).
7. **Logoi mreža na sajtu.** (rešeno 22.11.2026: javni sajt prikazuje TikTok i LinkedIn kao neutralne pločice sa početnim slovima, `SITE_PLATFORMS`; u aplikaciji logoi ostaju) TikTok i LinkedIn ne dozvoljavaju svoje logoe u marketingu bez pisane dozvole (`src/components/landing/platforms.ts`). U aplikaciji mogu, sajt treba da ih ukloni ili da se traži dozvola.

## 2. Po platformama

### Meta (Facebook stranice i Instagram)

- **Stanje:** aplikacija je tipa Business, pa nema razvojni i javni režim, nego nivoe pristupa. Kupac bez uloge dobija samo dozvole sa naprednim pristupom (Advanced Access), a njih daje tek App Review uz proveru firme (Business Verification). Provera pristupa za Tech Provider-e je ukinuta 9.10.2026.
- **Predlog:** dve prijave. Prva za objavljivanje, uvide i komentare, a druga kasnije za poruke (Messenger, Instagram DM) i DM automatizaciju. Meta odbija dozvole tražene „za kasnije”.
- **Dozvole, prva prijava:** pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement (u kodu od D-189; u Meta panelu dodati u slučaj upotrebe i, ako postoji, u konfiguraciju prijave), pages_read_user_content, read_insights, business_management (obrazložiti kao pristup stranicama koje drži business portfolio), instagram_basic, instagram_content_publish, instagram_manage_comments i instagram_manage_insights. Poslednje dve treba dodati u slučaju korišćenja za Instagram, pa ih tek onda konfiguracija nudi.
- **Druga prijava:** pages_messaging, pages_manage_metadata, instagram_manage_messages. Traži webhook-ove umesto čitanja na 10 minuta, odgovor automatizacije za manje od 30 s, obradu povučenih poruka, brisanje razgovora, odjavu („stop”) i oznaku da je poruka automatska gde zakon to traži.
- **Vlasnik:**
  1. Business Verification za portfolio TangerineSEO: tačan naziv „TangerineSEO LLC” i adresa, plus Articles of Organization ili potvrda EIN broja (IRS CP 575 ili 147C). Sajt mora da pokazuje ime firme. Traje od nekoliko dana do dve nedelje.
  2. U podešavanjima aplikacije: ikonica 1024 px bez Meta znakova, adrese politike, uslova i brisanja podataka, kategorija, email i namena „Clients”.
  3. Dodati dozvole u slučajevima korišćenja i novu Facebook Login for Business konfiguraciju; novi ID ide u `META_LOGIN_CONFIG_ID`.
  4. Svaku funkciju upotrebiti bar jednom u 30 dana pre prijave (dugme za napredni pristup je sivo dok poziv nije zabeležen).
  5. Facebook stranica „Sova” sa kontaktom i poštanskom adresom (Developer Policies 5.5).
  6. Probni nalog u Sovi za recenzente (potvrđen email, tokeni, engleski jezik), bez Meta lozinki.
  7. Snimci ekrana za svaku dozvolu, od odjavljenog stanja do korišćenja podataka, 1080p, bez zvuka.
  8. Odluka obično stiže za oko nedelju dana; računati na jedno do dva ponovna slanja.
- **Mi:** pravni tekstovi (Tech Provider uloga, Inbox, automatizacije, rokovi), stvarno brisanje po zahtevu Mete i strana sa statusom zahteva, brisanje tokena kad korisnik ukloni Sovu kod Mete, pages_manage_engagement, adresa za bezbednosne propuste (/.well-known/security.txt), a za drugu prijavu webhook-ovi, odjava i oznaka automatske poruke.

### Google (YouTube, Google poslovni profil, prijava, Gemini)

- **Stanje:** ekran saglasnosti je u režimu Testing (samo test korisnici, veza traje 7 dana). Za javni rad potrebni su provera brenda i provera osetljivih dozvola (youtube.upload, youtube.readonly, verovatno business.manage). Restriktivnih dozvola nema, pa nema ni godišnje bezbednosne provere (CASA).
- **Domen je obavezan:** početna strana i politika moraju biti na domenu verifikovanom u Search Console-u kao Domain property, a to za netlify.app nije moguće. Prijava preko Google naloga ide preko supabase.co adrese, koju takođe ne možemo verifikovati. Rešenje: poseban domen za prijavu (npr. auth.sovaai.rs, plaćeni dodatak Supabase-a), prelazak na Google Identity Services, ili poseban Cloud projekat samo za prijavu.
- **Promene kod YouTube-a 2026:** od 2.11.2026 video iz neproverenog projekta više nije zaključan na privatno. Od 1.6.2026 otpremanje ima posebnu kvotu, 100 videa dnevno za ceo projekat (za više treba YouTube audit).
- **YouTube pravila koja Sova danas krši:**
  - naslovi, opisi i sličice uvezenih videa ne smeju se čuvati duže od 30 dana bez osvežavanja;
  - posle opoziva pristupa podaci se brišu (u roku od 7 dana posle odjave u Sovi, 30 posle opoziva kod Google-a);
  - nema izvedenih metrika: Sova sada računa „impresije = pregledi”, angažovanje, najbolja vremena i glas brenda iz YouTube podataka;
  - na ekranu otpremanja mora stajati YouTube-ova rečenica o usklađenosti sa uslovima i link;
  - u politici i uslovima moraju biti linkovi na YouTube ToS i Google Privacy Policy;
  - logo mora biti zvanični.
- **Google poslovni profil:** pristup API-ju se traži posebnim formularom (kvota 0 znači da nije odobren). Sadržaj se čuva najviše 30 dana i ne sme se sabirati; Sova danas čuva istoriju, recenzije i dnevne metrike neograničeno i sabira metrike. Na forumu ima prijava da business.manage daje 403 spoljnim korisnicima i posle odobrenja, pa pre prodaje probati sa nalogom koji nije test.
- **Prijava preko Google-a:** dugme mora da prati Google-ove smernice (standardno „G”, propisane boje).
- **Gemini:** komercijalna upotreba je u redu ako ključ pripada projektu sa aktivnim naplatnim nalogom. Bez toga Google sme da koristi podatke, a naša politika bi bila netačna. Vlasnik treba da potvrdi.
- **Vlasnik:**
  1. Odmah, paralelno sa ostalim: formular za pristup Business Profile API-ju (support.google.com/business/contact/api_default), sa brojem projekta Sova i nalogom koji vodi profil firme stariji od 60 dana. Odobrenje traje od par dana do više nedelja.
  2. Domen sovaai.rs na Netlify i Search Console Domain property (DNS TXT), istim nalogom kao Cloud projekat.
  3. Poseban projekat „Sova Dev” za localhost adrese; iz produkcije ukloniti localhost.
  4. Branding: naziv Sova, logo 120×120, početna, politika i uslovi na sovaai.rs. Automatska provera traje minute, ručna dva do tri radna dana.
  5. Data Access: tačno 6 dozvola sa obrazloženjima (pišemo mi).
  6. Demo video na engleskom: adresa sa client_id, ekran saglasnosti, svaka dozvola u upotrebi.
  7. „Publish app”, pa odmah slanje na proveru. Pregled traje oko 10 radnih dana, često duže.
  8. Posle odobrenja: YouTube audit za više od 100 videa dnevno.
  - „Publish app” bez provere je dozvoljen, ali korisnici vide upozorenje „aplikacija nije proverena”, a limit je 100 korisnika za ceo vek projekta. Zato tek kad su ispravke na sovaai.rs, i odmah slanje na proveru.
- **Mi:** odeljak „Google podaci” u politici, YouTube ToS u uslovima, rečenica i link na ekranu otpremanja, dijalog pre povezivanja, stalni linkovi na politiku i uslove u aplikaciji, zvanično dugme za prijavu i YouTube logo, dnevni posao koji osvežava ili briše YouTube i Google podatke starije od 30 dana, brisanje posle opoziva, bez izvedenih YouTube metrika, metrike profila bez sabiranja, rok brisanja na zahtev 7 dana umesto 30.

### TikTok

- **Stanje:** Sandbox, do 10 testera, objave samo „Samo ja”. Prvo ide pregled aplikacije (od nekoliko dana do dve nedelje), pa audit za Direct Post (nedeljama, prema neslužbenim izvorima). Tek posle audita objave mogu biti javne, a broj kreatora dnevno TikTok određuje prema proceni iz prijave.
- **Pravila koja se proveravaju:** prava stranica (ne samo prijava), politika i uslovi vidljivi bez menija, demo za svaki proizvod i dozvolu snimljen u Sandbox-u, aplikacija za „autentične kreatore”, a ne alat za tim koji objavljuje na tuđe naloge. Ne sme se dodavati žig ni promotivni tekst. Unapred upisan tekst mora ostati izmenljiv, a objava ide tek po izričitoj saglasnosti.
- **Šta Sova već ima:** panel po TikTok smernicama (nalog, privatnost bez podrazumevane vrednosti, komentari, Duet, Stitch, oznaka komercijalnog sadržaja, saglasnost sa muzikom), status obrade, verifikovan domen.
- **Šta fali:**
  - pregled objave i polje za naslov u samom panelu;
  - oznaka i informacija uz komercijalni sadržaj tačnim TikTok rečima;
  - dugme za objavu onemogućeno dok podešavanja nisu ispravna;
  - oznaka „AI-generated” u panelu i ručni prekidač;
  - provera dužine videa pre zakazivanja;
  - video preko PULL_FROM_URL sa verifikovanog domena umesto FILE_UPLOAD;
  - webhook kad korisnik ukloni Sovu, posle kog se brišu podaci;
  - isključenje iz automatskog objavljivanja.
- **Otvoreno pitanje:** TikTok uslovi (III.3(c)) zabranjuju komercijalnu upotrebu bez pisane saglasnosti. Pitati TikTok u napomeni uz prijavu i sačuvati odgovor.
- **Vlasnik:** konačan domen, tačno 5 dozvola sa obrazloženjima, demo u Sandbox-u, slanje. Posle odobrenja produkcioni ključevi u Netlify (svi ponovo povezuju TikTok), pa prijava za Direct Post audit sa velikodušnom procenom broja korisnika.

### LinkedIn

- **Stanje:** lični profil (openid, profile, email, w_member_social) je otvoren za sve bez pregleda. Mora se poštovati API Terms, jer se kršenje kažnjava kasnije, gašenjem pristupa.
- **Šta fali:**
  - zabrana automatskog objavljivanja (3.1(26)): isključiti LinkedIn iz automatskog objavljivanja;
  - na lični profil sme da objavi samo ono što je vlasnik profila odobrio;
  - dijalog saglasnosti pre povezivanja, sa podacima, svrhom, opozivom i brisanjem (5.2), i ponovo pri obnovi na 60 dana;
  - ukloniti dozvolu email, koju ne koristimo (svi ponovo povezuju LinkedIn);
  - napomena uz tekst koji predlaže Sova;
  - u uslovima zabrana kockanja, sadržaja za odrasle i duvana ili alkohola za maloletne: Luxspin i noćni život ne smeju da idu na LinkedIn preko Sove;
  - LinkedIn ne daje opoziv preko API-ja, pa tekst o brisanju za LinkedIn mora biti tačan;
  - ne naplaćivati LinkedIn kao dodatak.
- **Stranice firmi (Community Management API):** samo za registrovane firme, sa poslovnim emailom (Gmail ne prolazi), verifikovanim domenom i stranicom. Odbijena prijava traži novu aplikaciju. Pre uključivanja: rokovi čuvanja (objave stranice 6 meseci, profil stranice 8 nedelja, izveštaji 1 godina), LinkedIn podaci ne idu u Gemini ni u izvoz naloga, i klik-saglasnost sa LinkedIn Pages Terms.

### Canva

- **Stanje:** integracija nije poslata na pregled, pa radi samo za vlasnikov tim. Privatna integracija postoji samo za Enterprise, pa ova mora biti javna i proći Canvin pregled. Rok pregleda nije objavljen.
- **Šta fali:**
  - suvišne dozvole: brandtemplate:content:read i profile:read se ne koriste, brandtemplate:meta:read služi samo za proveru koja besplatnim korisnicima vraća 403, a Canva prati stopu grešaka;
  - opoziv tokena kod Canve pri prekidu veze;
  - „Powered by Canva” ili Canva logo na ulazu u Canvu i u biraču dizajna;
  - prikaz povezanog naloga;
  - oznaka AI slika pri otpremanju u Canvu;
  - pravni tekstovi.
- **Vlasnik:** proveriti da je integracija javna („Anyone on Canva”) i da je uključen MFA; ukloniti localhost redirect; tačne dozvole; probni nalog za recenzente; kratak snimak; prihvatiti važeće Developer Terms (menjani su u novembru 2026).

### Figma

- **Stanje:** aplikacija je nacrt (draft), pa radi samo za vlasnika. Privatna radi samo za jedan tim. Za sve kupce mora biti javna i proći Figmin pregled; red je spor (na forumu prijava od 7.10 bez odgovora do 5.11).
- **Šta fali:** samo dozvola file_content:read (file_metadata:read se ne koristi), Figma u politici privatnosti uz rečenicu da je za podatke odgovorna Sova, a ne Figma, i pristup recenzentu (prekidač figma za njegov prostor).
- **Vlasnik:** naziv bez reči „Figma”, logo 512×512, redirect na pravom domenu, objava kao javne aplikacije sa uputstvom za proveru.

### Unsplash

- **Stanje:** verovatno Demo (50 zahteva na sat). Prijava za produkciju bi danas verovatno bila odbijena.
- **Šta fali:**
  - u aplikaciji izabrane fotografije prikazivati sa Unsplash adresa (hotlinking), a ne kopiju iz našeg skladišta; kopija služi samo za objavu na mreži;
  - autor i Unsplash uz svaku prikazanu fotografiju, ne samo u pretrazi;
  - bez automatskog izbora (Autopilot, plan) i bez AI obrade fotografija, ili uz pisano odobrenje Unsplash-a.
- **Vlasnik:** posle ispravki „Apply for Production” sa snimcima ekrana.

### Pexels

- **Stanje:** komercijalna upotreba je dozvoljena na podrazumevanim limitima (200 na sat, 20.000 mesečno). Novi ključevi i povećanja su trenutno pauzirani, pa je postojeći ključ sve što imamo; ne praviti dodatne.
- **Šta fali:** autor i „Photos provided by Pexels” svuda gde se prikazuje, Pexels u pravnim tekstovima, brisanje kopija koje ne pripadaju objavi, i AI provera ljudi (odluka vlasnika).

### Pinterest i X (isključeni, za kasnije)

- **Pinterest:** prvo Trial pristup (sandbox), pa Standard sa snimkom. Pinterest odbija zbog politike koja nije na domenu firme. Pinovi se ne smeju zakazivati na veliko: korisnik bira svaki pin. Podatke ne čuvati, nego čitati uživo.
- **X:** nema pregleda, ali pay-per-use je po uslovima za mali broj korisnika; za mnogo kupaca treba Enterprise ugovor. Isti tekst ne sme na više X naloga, automatske objave nose oznaku „Automated”, a uvezene objave se brišu u roku od 24 h od zahteva.

### Upis opisa profila iz Sove (D-166)

Sova sada sama upisuje opis samo na Google poslovni profil (`business.manage`, radi kad Google odobri pristup API-ju). Za direktan upis na ostale mreže treba:

- **Facebook stranica:** dozvola `pages_manage_metadata` kroz App Review kod Mete (polja `about` i `description` stranice).
- **YouTube kanal:** opseg `https://www.googleapis.com/auth/youtube` (ili `youtube.force-ssl`) i provera aplikacije kod Google-a; sada Sova ima samo `youtube.upload` i `youtube.readonly`.
- **LinkedIn stranica firme:** Community Management API (`rw_organization_admin`), isto odobrenje kao za objave na stranicama firmi.
- **X:** `PUT /2/users/me` kad X bude uključen.
- **Instagram, TikTok, Pinterest:** API ne dozvoljava izmenu opisa profila; ostaje „Kopiraj i otvori profil”.

Nijedna od ovih dozvola se ne dodaje u prijavu pre odobrenja: neodobrena dozvola obara povezivanje mreže za sve korisnike.

## 3. Predlog redosleda

1. **Vlasnik, odmah** (adresa firme i poslovni email su upisani 13.11.):
   - domen sovaai.rs na Netlify;
   - formular za Business Profile API;
   - pokretanje Business Verification-a kod Mete;
   - potvrda naplate za Gemini ključ.
2. **Mi, prva faza:** prelazak na sovaai.rs u kodu i dokumentaciji, novi pravni tekstovi na tri jezika, stvarno brisanje i strana sa statusom, isključenje TikTok-a, LinkedIn-a i X-a iz automatskog objavljivanja, LinkedIn saglasnost i uklanjanje dozvole email, Canva i Figma dozvole, logoi na sajtu.
3. **Mi, druga faza:** YouTube i Google rokovi čuvanja i metrike, ekran otpremanja, dugme za prijavu, TikTok panel, PULL_FROM_URL i webhook, Unsplash i Pexels prikaz i potpisi.
4. **Prijave redom:** Meta (prva prijava), Google, TikTok, Canva, Figma, Unsplash. Meta druga prijava kad su webhook-ovi gotovi.

## 4. Odluke vlasnika

1. Da li sovaai.rs ide na Netlify sada? Ko vodi DNS za taj domen?
2. Rokovi čuvanja: uvezene objave i metrike (YouTube i Google najviše 30 dana), Inbox poruke (predlog: dok je nalog povezan, najviše 12 meseci).
3. Automatsko objavljivanje bez odobrenja: isključiti TikTok, LinkedIn i X (preporuka), ili prijave za njih odložiti.
4. Provera ljudi na fotografijama (D-154): zadržati je samo na fotografijama koje nisu sa Unsplash-a i Pexels-a, zameniti je izborom po upitu i ručnim izborom, ili tražiti pisano odobrenje. Uz GDPR rizik.
5. Inbox poruke (Messenger, Instagram DM): u prvoj Meta prijavi ili kasnije (preporuka: kasnije).

**Odgovori vlasnika (22.11.2026):**

1. sovaai.rs je na Netlify-ju, DNS i mejl na SuperHosting-u (D-179).
2. Uvezene objave i metrike sa YouTube-a i Google-a najviše 30 dana; Inbox poruke dok je nalog povezan, najviše 12 meseci.
3. TikTok, LinkedIn i X ostaju u automatskom objavljivanju, uz napomene i ono što mreža traži od korisnika: za X potvrda da je na nalogu uključena oznaka „Automated”; za TikTok i LinkedIn, čija pravila traže da korisnik lično potvrdi svaku objavu, Autopilot priprema i zakazuje, a objava ide posle jednog klika „Odobri” (sa obaveštenjem). Facebook, Instagram, Google i YouTube objavljuju potpuno automatski.
4. Provera ljudi (D-154) ostaje samo na fotografijama koje je korisnik sam postavio; za Unsplash i Pexels izbor ide po upitu i ručnim izborom, bez AI obrade njihovih fotografija.
5. Inbox ide u drugu Meta prijavu.

## Izvori

- Meta:
  - https://developers.facebook.com/docs/app-review/submission-guide
  - https://developers.facebook.com/docs/graph-api/overview/access-levels
  - https://developers.facebook.com/docs/development/release/business-verification
  - https://developers.facebook.com/terms/dfc_platform_terms/
  - https://developers.facebook.com/devpolicy/
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
  - https://developers.facebook.com/blog/post/2026/10/09/retiring-access-verification-for-tech-provider-apps
- Google:
  - https://developers.google.com/terms/api-services-user-data-policy
  - https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
  - https://support.google.com/cloud/answer/13807376
  - https://support.google.com/cloud/answer/15549945
  - https://developers.google.com/youtube/terms/developer-policies
  - https://developers.google.com/youtube/terms/api-services-terms-of-service
  - https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
  - https://developers.google.com/my-business/content/policies
  - https://developers.google.com/identity/branding-guidelines
  - https://ai.google.dev/gemini-api/terms
- TikTok:
  - https://developers.tiktok.com/doc/app-review-guidelines
  - https://developers.tiktok.com/doc/content-sharing-guidelines
  - https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
  - https://developers.tiktok.com/doc/webhooks-events
  - https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en
- LinkedIn:
  - https://www.linkedin.com/legal/l/api-terms-of-use
  - https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
  - https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review
  - https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements
- Canva:
  - https://www.canva.dev/docs/connect/creating-integrations/
  - https://www.canva.dev/docs/connect/submission-checklist/
  - https://www.canva.dev/docs/apps/rest-apis/brand-guidelines/
  - https://www.canva.dev/docs/apps/restricted-uses/
- Figma:
  - https://developers.figma.com/docs/rest-api/oauth-apps/
  - https://www.figma.com/legal/developer-terms/
- Unsplash:
  - https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
  - https://unsplash.com/api-terms
- Pexels:
  - https://www.pexels.com/api/documentation/
  - https://www.pexels.com/terms-of-service/
- Pinterest:
  - https://developers.pinterest.com/docs/key-concepts/access-tiers/
  - https://policy.pinterest.com/en/developer-guidelines
- X:
  - https://docs.x.com/developer-terms/agreement
  - https://docs.x.com/developer-terms/policy
