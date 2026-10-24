# Sova — ivični slučajevi

Status: `plan` (opisano, bez koda), `kod` (implementirano), `test` (pokriveno automatskim testom). Faza u kojoj se rešava je u koloni. Lista se dopunjava u svakoj fazi; faza 11 prolazi kroz sve i zatvara rupe. Posle faze 11b status `plan` imaju samo slučajevi naplate (T4–T13, K6, faza 12) i YouTube kvota (N10, faza 8c).

## Auth i nalog

| #   | Slučaj                                              | Ponašanje                                                                                                                                                                                                    | Faza   | Status                 |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------- |
| A1  | Email već postoji                                   | Poruka bez otkrivanja da nalog postoji („Ako nalog postoji, poslali smo uputstvo”), link na login i reset                                                                                                    | 4      | kod                    |
| A2  | Nepotvrđen email pokušava da troši tokene           | 403 `EMAIL_NOT_VERIFIED`, dugme „Pošalji ponovo” sa rate limitom 3/h                                                                                                                                         | 4, 5   | kod (handler verified) |
| A3  | Istekao magic link ili reset link                   | Stranica sa objašnjenjem i dugmetom za nov link                                                                                                                                                              | 4      | kod                    |
| A4  | Sesija istekla usred rada                           | Nacrt composera se čuva u localStorage po brendu i objavi (600 ms posle izmene); posle osvežavanja, isteka sesije ili zatvaranja taba traka nudi „Vrati nacrt” ili „Odbaci”; briše se posle uspešnog čuvanja | 4, 11b | test (E2E)             |
| A5  | Korisnik banovan dok je ulogovan                    | `is_banned` proverava `getViewer()` na svakom zahtevu; RLS funkcije vraćaju false; proxy odjavljuje                                                                                                          | 4      | kod                    |
| A6  | Korisnik obrisan dok je ulogovan                    | Token ne prolazi (`/api/me` 401); tab na fokusu ide na prijavu, ostali tabovi kroz BroadcastChannel                                                                                                          | 4, 11a | test                   |
| A7  | Više tabova, odjava u jednom                        | Strana za prijavu posle odjave šalje poruku kroz BroadcastChannel `sova-auth`; ostali tabovi idu na prijavu                                                                                                  | 4, 11a | test (Chromium)        |
| A8  | Google prijava emailom koji već postoji sa lozinkom | Supabase povezuje identitete ako je email potvrđen; inače poruka                                                                                                                                             | 4      | kod                    |

## GDPR i nalog (faza 11a)

| #   | Slučaj                                          | Ponašanje                                                                                 | Faza | Status |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- | ------ |
| G1  | Izvoz podataka                                  | JSON odmah, bez tokena mreža i internih troškova; mediji kroz linkove na 7 dana; 3 na sat | 11a  | test   |
| G2  | Brisanje naloga vlasnika tima                   | 409 sa spiskom radnih prostora dok se vlasništvo ne prenese                               | 11a  | test   |
| G3  | Brisanje naloga bez lozinke (Google)            | Dozvoljeno 15 minuta posle prijave, inače poruka da se prijavi ponovo                     | 11a  | kod    |
| G4  | Objave korisnika u tuđem radnom prostoru        | Ostaju, bez autora (created_by NULL)                                                      | 11a  | test   |
| G5  | Veze sa mrežama obrisanog naloga                | Opoziv kod mreže (jednom po korisniku mreže) i brisanje tokena pre brisanja naloga        | 11a  | test   |
| G6  | Prenos vlasništva na nečlana ili od ne-vlasnika | 404 / 403, i RPC odbija direktan poziv                                                    | 11a  | test   |
| G7  | Izvoz ili brisanje tokom impersonacije          | 403 (servis i handler)                                                                    | 11a  | kod    |

## Tokeni i naplata

| #   | Slučaj                                      | Ponašanje                                                                                                                                                                           | Faza   | Status              |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| T1  | Tačno 0 tokena                              | 402 `INSUFFICIENT_TOKENS` sa linkom na kupovinu; UI unapred onemogućava dugme ako je stanje manje od cene                                                                           | 5      | test                |
| T2  | Tokeni potrošeni u drugom tabu              | Rezervacija pada → 402; stanje u Studiju se osvežava posle svake akcije, pri povratku na tab i na 60 s                                                                              | 5, 11b | kod                 |
| T3  | Istekla rezervacija (posao trajao > 15 min) | Cron oslobađa; ako posao ipak uspe, `confirm_reservation` vidi `expired` → pokušava novu rezervaciju; ako ne uspe, rezultat se čuva ali označava `unpaid` i admin dobija alarm      | 5      | kod (cron u fazi 9) |
| T4  | Pretplata istekla usred generisanja         | Rezervacija je već napravljena iz postojećih grantova; generisanje se završava; nova generisanja blokirana                                                                          | 5, 12  | plan                |
| T5  | Refundacija                                 | `charge.refunded` → grant `refund` negativan? Ne: oduzimanje kroz `admin_adjust_tokens` sa negativnim delta, balance može u minus → nova generisanja blokirana do pozitivnog stanja | 12     | plan                |
| T6  | Isti webhook dvaput                         | `payment_events (provider, event_id)` UNIQUE → drugi upis pada, ruta vraća 200                                                                                                      | 12     | plan                |
| T7  | Webhook pre povratka sa Checkout-a          | Checkout stranica ne dodeljuje ništa; sve radi webhook; povratna stranica samo prikazuje stanje                                                                                     | 12     | plan                |
| T8  | Webhook van redosleda                       | Za stanje pretplate uvek `getSubscription` od provajdera, ne payload                                                                                                                | 12     | plan                |
| T9  | Odbijena kartica pri obnovi                 | `past_due`, grace 7 dana, email podsetnici dan 1, 3, 6; dan 8 blokada generisanja, zakazane objave ostaju                                                                           | 12     | plan                |
| T10 | Otkazivanje pa obnova pre kraja perioda     | Provajder vraća `active`; nema novog granta dok ne stigne `invoice.paid`                                                                                                            | 12     | plan                |
| T11 | Promena plana usred perioda                 | Upgrade: proracija kod provajdera, grant razlike tokena odmah; downgrade: na kraju perioda                                                                                          | 12     | plan                |
| T12 | Chargeback                                  | `user_flags.chargeback`, workspace `past_due`, admin alarm                                                                                                                          | 12     | plan                |
| T13 | Godišnji plan: 500 tokena mesečno           | Inngest cron pravi grant mesečno sa `reference = subscription_id:YYYY-MM` (UNIQUE štiti)                                                                                            | 12     | plan                |

## AI

| #   | Slučaj                                 | Ponašanje                                                                                                                         | Faza  | Status |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| AI1 | Timeout                                | Retry do 3x, zatim fallback model, zatim poruka i oslobađanje tokena                                                              | 5     | test   |
| AI2 | 429 od provajdera                      | Backoff sa jitter-om; breaker posle 50 % grešaka u 2 min                                                                          | 5     | kod    |
| AI3 | Safety blokada                         | `AI_BLOCKED`, bez retry-a, bez naplate, poruka „Sadržaj nije prošao proveru, promeni opis”; brojač u `user_flags`                 | 5     | test   |
| AI4 | Prazan ili nevalidan JSON              | Jedan ponovni pokušaj sa porukom o grešci šeme u promptu; zatim fallback model                                                    | 5     | kod    |
| AI5 | Slika generisana, upload u Storage pao | Retry uploada 3x unutar istog koraka; ako padne, rezervacija se oslobađa, generacija `failed`                                     | 5     | kod    |
| AI6 | Model ugašen (404 za model)            | Trajna greška → odmah fallback model + alarm adminu + health crven                                                                | 5     | test   |
| AI7 | Odgovor na pogrešnom jeziku ili pismu  | Detekcija pisma (udeo ćiriličnih karaktera) i jezika; jedan ponovni pokušaj sa pojačanom instrukcijom; zatim upozorenje korisniku | 5, 6  | test   |
| AI8 | Prompt injection iz sadržaja sajta     | Delimiteri + instrukcija + Zod; činjenice se proveravaju naspram profila                                                          | 6     | test   |
| AI9 | Sličan tekst već objavljen u 90 dana   | Embedding sličnost > 0,92 → upozorenje i ponuda drugog ugla                                                                       | 6, 9a | test   |

## Upload i mediji

| #   | Slučaj                                     | Ponašanje                                                                                                                                                            | Faza   | Status            |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| U1  | Fajl od 0 bajtova                          | 400 pre uploada (klijent) i pri `complete` (server)                                                                                                                  | 7      | kod               |
| U2  | Pogrešna ekstenzija, pravi tip drugačiji   | Magic bytes odlučuju; ekstenzija se prepisuje                                                                                                                        | 7      | test              |
| U3  | HEIC                                       | Sharp konverzija u JPEG                                                                                                                                              | 7      | kod (odbija HEIC) |
| U4  | CMYK JPEG                                  | Sharp `toColorspace('srgb')`                                                                                                                                         | 7      | kod               |
| U5  | Ogromna rezolucija                         | `limitInputPixels` 50 MP → 400 sa porukom                                                                                                                            | 7      | kod               |
| U6  | Animirani GIF                              | 400 sa objašnjenjem: Sova slike šalje bez animacije, a Instagram i TikTok ionako primaju samo mirne slike; predlog da se sličica sačuva kao JPG ili PNG              | 7, 11b | test              |
| U7  | Prekinut upload                            | Upload ide kroz server (bez potpisanog URL-a); kad upis u bazu ne uspe, fajl se odmah briše iz skladišta (upload, AI slike, šabloni, snimci sajta), pa siročića nema | 7, 11b | test              |
| U8  | Isti fajl dva puta                         | `sha256` poklapanje → ponuda postojećeg asseta umesto duplikata; Unsplash po `photoId`                                                                               | 7      | test              |
| U9  | Brisanje medija koji je u zakazanoj objavi | `DELETE /api/media/[id]` → 409 (okidač `media_in_use_guard`); posle otkazivanja zakazivanja brisanje prolazi; dugme za zamenu medija stiže uz dizajn (14)            | 7, 11b | test              |

## Mreže

| #   | Slučaj                                          | Ponašanje                                                                                                                            | Faza  | Status |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------ |
| N1  | Token opozvan na strani mreže                   | `TOKEN_INVALID` → nalog `needs_reauth`, targeti `needs_reauth`, email + banner                                                       | 8a    | test   |
| N2  | Korisnik izgubio admin prava na stranici        | `PERMISSION_LOST` → isto kao N1 sa drugom porukom                                                                                    | 8a    | test   |
| N3  | Nalog promenjen iz poslovnog u lični            | `listAccounts` ga više ne vraća → `disabled` sa objašnjenjem i asistiranim fallbackom                                                | 8a    | test   |
| N4  | Promena verzije API-ja                          | Verzija u env-u (`META_GRAPH_VERSION`, `LINKEDIN_API_VERSION` = 202610; 202511 se gasi 16.11.2026); MSW testovi                      | 8     | kod    |
| N5  | Uspeh bez ID-ja objave                          | `findExistingPost` po idempotency ključu ili vremenu; ako nema, target `published` sa `external_post_id = null` i oznakom za proveru | 9b    | kod    |
| N6  | Objava uklonjena zbog pravila mreže             | Pri povlačenju metrika 404 → `deleted_externally`                                                                                    | 10b   | test   |
| N7  | Dnevni limit objava (IG 100, TikTok ~15)        | Provera pre zakazivanja i pre objave; `QUOTA_EXCEEDED` → pomeranje na sledeći slobodan termin uz obaveštenje                         | 9b    | test   |
| N8  | Neauditovan TikTok klijent                      | Greška `unaudited_client_…` → poruka da do audita idu samo privatni nalozi i „Samo ja”                                               | 8b    | test   |
| N9  | Pogrešan odnos stranica slike                   | Provera objave javlja odnos van opsega mreže pre zakazivanja; auto-crop uz pregled stiže uz dizajn (14)                              | 7, 9a | kod    |
| N10 | YouTube kvota potrošena                         | Dnevni brojač; `QUOTA_EXCEEDED` → sledeći dan ili asistirano                                                                         | 8c    | plan   |
| N11 | Instagram kontejner `EXPIRED`                   | Novi kontejner, jedan ponovni pokušaj                                                                                                | 8a    | test   |
| N12 | Mediji nedostupni mreži (potpisan URL istekao)  | URL se generiše neposredno pre objave sa 24 h važenja                                                                                | 9b    | kod    |
| N13 | LinkedIn veza ističe (60 dana, bez refresh-a)   | Obaveštenje vlasnicima 7 dana ranije (jednom), posle isteka `needs_reauth` i u publisheru                                            | 8b    | test   |
| N14 | LinkedIn link bez pregleda (API ne čita link)   | Naslov i opis sa stranice kroz SSRF-bezbedan fetch; ako ne uspe, naslov je domen                                                     | 8b    | test   |
| N15 | TikTok privatnost se promeni posle zakazivanja  | `creator_info` pri objavi; objava pada sa porukom da se privatnost izabere ponovo                                                    | 8b    | test   |
| N16 | TikTok ID tek posle moderacije                  | `external_post_id = publish:{id}`; povlačenje metrika ga zameni pravim ID-jem i linkom                                               | 8b    | test   |
| N17 | TikTok int64 ID u JSON-u                        | Brojevi od 16+ cifara se parsiraju kao stringovi (bez zaokruživanja)                                                                 | 8b    | test   |
| N18 | TikTok refresh token se promeni pri osvežavanju | Nov se čuva odmah; ako drugi proces upravo osvežava, koristi se stanje iz baze                                                       | 8b    | test   |
| N19 | WebP slika na LinkedIn                          | Pretvara se u JPEG pri uploadu                                                                                                       | 8b    | kod    |
| N20 | Javni link medija procuri                       | HMAC token za jedan medij, važi 2 h, bez listanja; obrisan medij 404                                                                 | 8b    | test   |

## Kalendar i objave

| #   | Slučaj                                         | Ponašanje                                                                                                                                                                                                                              | Faza    | Status |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| K1  | Zakazano u prošlosti                           | 400 sa ponudom „Objavi sada”                                                                                                                                                                                                           | 9a      | test   |
| K2  | Prelaz na letnje i zimsko vreme                | UTC u bazi; jedna konverzija za server i editor (`src/lib/zoned-time.ts`): sat koji ne postoji ide unapred (29.3.2026 02:30 → 03:30), sat koji postoji dvaput uzima raniji trenutak (25.10.2026 02:30 → 00:30 UTC)                     | 9a, 11b | test   |
| K3  | Brisanje brenda sa zakazanim objavama          | Potvrda sa brojem objava; run-ovi i objave se otkazuju i iz Podešavanja i kroz `DELETE /api/brands/[id]`                                                                                                                               | 9b, 11b | test   |
| K4  | Dva člana menjaju istu objavu                  | `version` + 409 + prikaz razlika                                                                                                                                                                                                       | 9a      | test   |
| K5  | Izmena dok je `publishing`                     | Trigger `POST_LOCKED`; UI prikazuje zaključano                                                                                                                                                                                         | 9b      | kod    |
| K6  | Istekla pretplata                              | Zakazane ostaju; Autopilot i generisanje staju                                                                                                                                                                                         | 12      | plan   |
| K7  | Promena vremenske zone brenda                  | Podešavanja → zona brenda; podrazumevano zakazane objave i planirani termini zadržavaju isto lokalno vreme, run-ovi se zakazuju ponovo; nepoznata zona 400                                                                             | 9a, 11b | test   |
| K8  | Dve objave u istom minutu na istom nalogu      | Parcijalni UNIQUE indeks → 409 sa predlogom termina                                                                                                                                                                                    | 9a      | test   |
| K9  | Isti tekst ponovo na istom nalogu              | Za Facebook, LinkedIn i X provera objave javlja problem kad je isti tekst (bez razlike u velikim slovima i razmacima, bar 20 znakova) objavljen ili zakazan na istom nalogu u poslednjih 30 dana; Instagram i TikTok se ne proveravaju | 9a, 11b | test   |
| K10 | Objava pomerena dok Inngest spava              | `post/target.unscheduled` otkazuje stari run, novi događaj pravi nov                                                                                                                                                                   | 9b      | kod    |
| K11 | Watchdog nalazi target koji kasni              | Ponovno slanje događaja; alarm ako kasni > 15 min                                                                                                                                                                                      | 9b      | test   |
| K12 | Parcijalan uspeh (2 od 3 mreže)                | Objava `partially_published`, neuspeli targeti sa razlogom i retry dugmetom                                                                                                                                                            | 9b      | test   |
| K13 | Brisanje radnog prostora sa zakazanim objavama | Zakazane objave svih brendova se otkazuju pre nego što prostor nestane                                                                                                                                                                 | 11b     | test   |

## Admin

| #    | Slučaj                                                    | Ponašanje                                                                                          | Faza | Status |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- | ------ |
| AD1  | Uklanjanje poslednjeg admina platforme                    | Uloga se ne menja iz aplikacije (samo allowlist i seed); admin ne može da blokira ni obriše admina | 13a  | test   |
| AD2  | Impersonacija istekla usred akcije                        | Sledeći zahtev ide kao admin, sesija se zatvara (`expired`) i beleži, traka nestaje                | 13b  | test   |
| AD3  | Admin pokušava impersonaciju drugog admina ili sebe       | 403 za drugog admina, 400 za sopstveni nalog                                                       | 13b  | test   |
| AD4  | Admin bez MFA                                             | Stranice vode na Bezbednost sa objašnjenjem, API 403 sa porukom                                    | 13a  | test   |
| AD5  | Ukraden ili prepravljen `sova_imp` cookie                 | Bez admin sesije koja ga je napravila ili sa lažnim potpisom se ignoriše                           | 13b  | test   |
| AD6  | Upis zahteva u audit ne uspe tokom impersonacije          | Zahtev ide kao admin (fail closed)                                                                 | 13b  | kod    |
| AD15 | Brisanje korisnika čiju strategiju kaskada menja dva puta | Prolazi; FK provera ide na kraj transakcije (D-079)                                                | 8b   | test   |
| AD7  | Brisanje impersoniranog korisnika ili bivšeg admina       | Prolazi; audit zapisi ostaju nepromenjeni (D-075)                                                  | 13a  | test   |
| AD8  | Brisanje vlasnika tima sa drugim članovima                | 409 dok se vlasništvo ne prenese                                                                   | 13a  | test   |
| AD9  | Oduzimanje više tokena nego što radni prostor ima         | 400 sa stanjem, ništa se ne menja                                                                  | 13a  | test   |
| AD10 | Ponovni pokušaj objave koja nije neuspela                 | 409 sa razlogom; neaktivan nalog takođe 409 (korisnik ga ponovo povezuje)                          | 13a  | test   |
| AD11 | Dva admina menjaju isti flag ili cenu                     | Važi poslednja izmena; obe su u auditu sa stanjem pre i posle                                      | 13a  | kod    |
| AD12 | MFA panel tokom impersonacije                             | Isključen, jer browser nosi adminovu sesiju                                                        | 13b  | kod    |
| AD13 | Odjava tokom impersonacije                                | Završava samo impersonaciju; admin ostaje prijavljen i vraća se na detalj korisnika                | 13b  | kod    |
| AD14 | Nova impersonacija dok je stara aktivna                   | Stara se zatvara (`replaced`); admin ima najviše jednu aktivnu sesiju                              | 13b  | test   |

## Brand Brain (iz brifa 5.7)

| #   | Slučaj                          | Ponašanje                                                                             | Faza | Status |
| --- | ------------------------------- | ------------------------------------------------------------------------------------- | ---- | ------ |
| B1  | Sajt ne postoji ili ne odgovara | `failed` sa porukom i ponudom ručnog unosa ili uvoza sa mreža                         | 6    | test   |
| B2  | robots.txt blokira              | Poštuje se; poruka korisniku sa predlogom da dozvoli `SovaBot` ili unese ručno        | 6    | test   |
| B3  | Cloudflare challenge ili 403    | Prepoznavanje challenge stranice i poruka sa ručnim unosom; Firecrawl odložen (D-035) | 6    | test   |
| B4  | SPA bez sadržaja                | Detekcija (malo teksta, `<div id="root">` prazan) → poruka i ručni unos (D-035)       | 6    | test   |
| B5  | Višejezičan sajt                | `hreflang` i `lang`; bira se jezik koji korisnik izabere, ostale verzije se preskaču  | 6    | kod    |
| B6  | Ogroman sajt                    | Limit 60 stranica po prioritetu; blog se uzima iz RSS-a bez fetch-a svake strane      | 6    | test   |
| B7  | Sajt bez bloga                  | Sekcija prazna, Autopilot ne zavisi od bloga                                          | 6    | test   |
| B8  | Logo samo kao tekst             | Profil `logo = null`, UI traži upload, šabloni koriste naziv u fontu brenda           | 6    | test   |
| B9  | Crno-bela paleta                | Neutralne se čuvaju posebno; akcent se predlaže uz jasnu oznaku „predlog”             | 6    | test   |
| B10 | Sajt na ćirilici                | `content_locale = sr-Cyrl`; generisanje na ćirilici; test sa pravim sajtom            | 6    | kod    |
| B11 | Biznis bez sajta                | Onboarding preko kratkog opisa + uvoz sa mreža; profil sa niskim confidence           | 6    | kod    |
| B12 | Sajt promenjen posle analize    | Nedeljna provera, predlog ažuriranja, `locked_fields` se ne diraju                    | 6    | test   |
| B13 | Analiza pokrenuta dvaput        | jedinstven indeks aktivne analize (409), concurrency 1 po brendu, rate limit 6/10 min | 6    | test   |

## Vizuali (faza 7)

| #   | Slučaj                                          | Ponašanje                                                                                                     | Faza | Status |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| V1  | Unsplash limit potrošen (403 Rate Limit)        | 429 korisniku sa predlogom da otpremi svoju fotografiju; keš pretrage 1 h smanjuje pozive                     | 7    | test   |
| V2  | Unsplash ključ nije podešen                     | Pretraga vraća `configured: false`, UI nudi upload ili šablon bez slike; zahtev sa Unsplash izvorom daje 400  | 7    | test   |
| V3  | Pretraga bez rezultata ili fotografija nestala  | Bez rezultata → šablon bez slike uz napomenu; nepostojeći `photoId` → posao `failed`, tokeni vraćeni          | 7    | test   |
| V4  | Vision rangiranje padne                         | Redosled Unsplash-a, posao uspeva, napomena u izlazu                                                          | 7    | test   |
| V5  | Google font brenda nedostupan ili nije WOFF/TTF | Fallback na ugrađeni Inter (latinica, latin-ext, ćirilica); `fontsUsed` u izlazu kaže šta je zaista korišćeno | 7    | test   |
| V6  | Logo SVG ne može da se rasterizuje              | Šablon ispisuje naziv brenda u fontu umesto logoa                                                             | 7    | kod    |
| V7  | Canva token istekao                             | Osvežavanje 2 min pre isteka; refresh token rotira i odmah se upisuje                                         | 7    | test   |
| V8  | Canva pristup opozvan                           | `invalid_grant` → `needs_reauth`, 403 korisniku bez naplate, podešavanja nude ponovno povezivanje             | 7    | test   |
| V9  | Canva export traži plaćeni plan                 | `license_required`/`approval_required` → jasna poruka, tokeni vraćeni                                         | 7    | kod    |
| V10 | OAuth state ponovljen ili istekao               | 400 „Povezivanje je isteklo ili je već iskorišćeno”; state važi 10 min i jednokratan je                       | 7    | test   |

## Strategija (faza 10a)

| #   | Slučaj                                           | Ponašanje                                                                                      | Faza | Status |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---- | ------ |
| S1  | Brend bez povezanih mreža                        | 400 sa porukom; korisnik može da pošalje `platforms` u zahtevu                                 | 10a  | kod    |
| S2  | AI vrati mrežu koja nije tražena ili udele ≠ 100 | Mreža se odbacuje, udeli se normalizuju na 100, nedostajuće nedelje se popunjavaju             | 10a  | test   |
| S3  | Neradni praznik na terminu iz kalendara          | Objava se pomera za dan (verski i komercijalni datumi ostaju)                                  | 10a  | test   |
| S4  | Ponovni „Napravi kalendar”                       | Isti (mreža, minut) se preskače; broj preskočenih (postoji, prošlost, bez naloga) u odgovoru   | 10a  | test   |
| S5  | Istorija prelazi letnje/zimsko vreme             | Sat se računa u zoni brenda po objavi (Intl), ne fiksnim pomakom                               | 10a  | kod    |
| S6  | Druga strategija za isti period                  | `version + 1`; aktiviranje arhivira prethodnu aktivnu                                          | 10a  | test   |
| S7  | Posao strategije padne (model, šema)             | `ai_generations.failed` sa porukom, rezervacija 20 tokena se oslobađa, UI nudi ponovni pokušaj | 10a  | kod    |

## Analitika (faza 10b)

| #   | Slučaj                                        | Ponašanje                                                                            | Faza | Status |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------ | ---- | ------ |
| A1  | Ručno osvežavanje posle horizonta             | Snimak `adhoc`; merodavan ostaje najduži horizont pa se brojevi ne menjaju nasumično | 10b  | test   |
| A2  | Mreža ne vrati insights (mala stranica, rano) | Snimak sa osnovnim brojevima (reakcije, komentari), doseg null; stopa null           | 10b  | kod    |
| A3  | Prethodni period bez objava                   | Promena „bez poređenja” umesto deljenja nulom                                        | 10b  | test   |
| A4  | Model navede nepostojeći dokaz                | ID se odbacuje; pouzdanost se svodi na 0–1                                           | 10b  | test   |
| A5  | Premalo podataka za uvide                     | Bez poziva modela, poruka sa brojem objava koji fali                                 | 10b  | test   |
| A6  | Nalog izgubi token između horizonata          | Nalog `needs_reauth`, snimak preskočen, run nastavlja na sledeći horizont            | 10b  | kod    |

## Autopilot (faza 10c)

| #    | Slučaj                                             | Ponašanje                                                                                             | Faza | Status |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---- | ------ |
| AP1  | Cron padne u 06:00 ponedeljkom                     | Prolaz važi od 06:00 do kraja ponedeljka; red u `autopilot_runs` sprečava dupli                       | 10c  | kod    |
| AP2  | Nema aktivne strategije za nedelju                 | Nivo 1: predlog u Inbox-u + obaveštenje; nivo 2–3: Autopilot pravi i aktivira strategiju za 4 nedelje | 10c  | test   |
| AP3  | Budžet se potroši usred prolaza                    | Provera pre svakog nacrta; prolaz „delimično”, obaveštenje jednom mesečno                             | 10c  | test   |
| AP4  | AI napiše zabranjenu reč ili izmišljenu cenu       | QA vraća nacrt korisniku sa razlogom, ne šalje se na odobrenje                                        | 10c  | test   |
| AP5  | Instagram nacrt bez vizuala                        | Vizual iz šablona; ako ne uspe, QA vraća nacrt                                                        | 10c  | test   |
| AP6  | Objava nije odobrena do roka                       | Nivo ≥ 2: preskoči ili objavi; nivo 1: podsetnik pa povratak u nacrt                                  | 10c  | test   |
| AP7  | Nivo 3 bez potvrde ili bez naloga                  | 400; flag isključen → 403; trigger u bazi odbija nivo 3 bez potvrde                                   | 10c  | test   |
| AP8  | „Pauziraj sve” dok Autopilot radi                  | Nacrti se ne prave za pauziran brend, publisher pauzira target; „Nastavi” vraća samo buduće termine   | 10c  | test   |
| AP9  | Strategija za sledeći mesec se preklapa sa tekućom | Aktiviranje arhivira samo preklapajuće aktivne strategije (D-064)                                     | 10c  | kod    |
| AP10 | Isti predlog dvaput prihvaćen                      | Uslovni UPDATE po statusu `new` → 409                                                                 | 10c  | test   |
