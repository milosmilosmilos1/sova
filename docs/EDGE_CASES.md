# Sova — ivični slučajevi

Status: `plan` (opisano, bez koda), `kod` (implementirano), `test` (pokriveno automatskim testom). Faza u kojoj se rešava je u koloni. Lista se dopunjava u svakoj fazi; faza 11 prolazi kroz sve i zatvara rupe.

## Auth i nalog

| #   | Slučaj                                              | Ponašanje                                                                                                 | Faza  | Status                 |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----- | ---------------------- |
| A1  | Email već postoji                                   | Poruka bez otkrivanja da nalog postoji („Ako nalog postoji, poslali smo uputstvo”), link na login i reset | 4     | kod                    |
| A2  | Nepotvrđen email pokušava da troši tokene           | 403 `EMAIL_NOT_VERIFIED`, dugme „Pošalji ponovo” sa rate limitom 3/h                                      | 4, 5  | kod (handler verified) |
| A3  | Istekao magic link ili reset link                   | Stranica sa objašnjenjem i dugmetom za nov link                                                           | 4     | kod                    |
| A4  | Sesija istekla usred rada                           | Nacrt composera čuva se u localStorage po brand_id; posle prijave ponuda „Vrati nacrt”                    | 4, 9a | plan                   |
| A5  | Korisnik banovan dok je ulogovan                    | `is_banned` proverava `getViewer()` na svakom zahtevu; RLS funkcije vraćaju false; proxy odjavljuje       | 4     | kod                    |
| A6  | Korisnik obrisan dok je ulogovan                    | isto kao A5                                                                                               | 4     | plan                   |
| A7  | Više tabova, odjava u jednom                        | Supabase `onAuthStateChange` sinhronizuje; ostali tabovi preusmeravaju na login                           | 4     | plan                   |
| A8  | Google prijava emailom koji već postoji sa lozinkom | Supabase povezuje identitete ako je email potvrđen; inače poruka                                          | 4     | kod                    |

## Tokeni i naplata

| #   | Slučaj                                      | Ponašanje                                                                                                                                                                           | Faza  | Status              |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------- |
| T1  | Tačno 0 tokena                              | 402 `INSUFFICIENT_TOKENS` sa linkom na kupovinu; UI unapred onemogućava dugme ako je stanje manje od cene                                                                           | 5     | test                |
| T2  | Tokeni potrošeni u drugom tabu              | Rezervacija pada → 402; stanje se osvežava kroz Realtime na `token_ledger`? Ne: kroz invalidaciju posle svake akcije i polling na 60 s                                              | 5     | plan                |
| T3  | Istekla rezervacija (posao trajao > 15 min) | Cron oslobađa; ako posao ipak uspe, `confirm_reservation` vidi `expired` → pokušava novu rezervaciju; ako ne uspe, rezultat se čuva ali označava `unpaid` i admin dobija alarm      | 5     | kod (cron u fazi 9) |
| T4  | Pretplata istekla usred generisanja         | Rezervacija je već napravljena iz postojećih grantova; generisanje se završava; nova generisanja blokirana                                                                          | 5, 12 | plan                |
| T5  | Refundacija                                 | `charge.refunded` → grant `refund` negativan? Ne: oduzimanje kroz `admin_adjust_tokens` sa negativnim delta, balance može u minus → nova generisanja blokirana do pozitivnog stanja | 12    | plan                |
| T6  | Isti webhook dvaput                         | `payment_events (provider, event_id)` UNIQUE → drugi upis pada, ruta vraća 200                                                                                                      | 12    | plan                |
| T7  | Webhook pre povratka sa Checkout-a          | Checkout stranica ne dodeljuje ništa; sve radi webhook; povratna stranica samo prikazuje stanje                                                                                     | 12    | plan                |
| T8  | Webhook van redosleda                       | Za stanje pretplate uvek `getSubscription` od provajdera, ne payload                                                                                                                | 12    | plan                |
| T9  | Odbijena kartica pri obnovi                 | `past_due`, grace 7 dana, email podsetnici dan 1, 3, 6; dan 8 blokada generisanja, zakazane objave ostaju                                                                           | 12    | plan                |
| T10 | Otkazivanje pa obnova pre kraja perioda     | Provajder vraća `active`; nema novog granta dok ne stigne `invoice.paid`                                                                                                            | 12    | plan                |
| T11 | Promena plana usred perioda                 | Upgrade: proracija kod provajdera, grant razlike tokena odmah; downgrade: na kraju perioda                                                                                          | 12    | plan                |
| T12 | Chargeback                                  | `user_flags.chargeback`, workspace `past_due`, admin alarm                                                                                                                          | 12    | plan                |
| T13 | Godišnji plan: 500 tokena mesečno           | Inngest cron pravi grant mesečno sa `reference = subscription_id:YYYY-MM` (UNIQUE štiti)                                                                                            | 12    | plan                |

## AI

| #   | Slučaj                                 | Ponašanje                                                                                                                         | Faza  | Status |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| AI1 | Timeout                                | Retry do 3x, zatim fallback model, zatim poruka i oslobađanje tokena                                                              | 5     | test   |
| AI2 | 429 od provajdera                      | Backoff sa jitter-om; breaker posle 50 % grešaka u 2 min                                                                          | 5     | kod    |
| AI3 | Safety blokada                         | `AI_BLOCKED`, bez retry-a, bez naplate, poruka „Sadržaj nije prošao proveru, promeni opis”; brojač u `user_flags`                 | 5     | test   |
| AI4 | Prazan ili nevalidan JSON              | Jedan ponovni pokušaj sa porukom o grešci šeme u promptu; zatim fallback model                                                    | 5     | kod    |
| AI5 | Slika generisana, upload u Storage pao | Retry uploada 3x unutar istog koraka; ako padne, rezervacija se oslobađa, generacija `failed`                                     | 5     | kod    |
| AI6 | Model ugašen (404 za model)            | Trajna greška → odmah fallback model + alarm adminu + health crven                                                                | 5     | test   |
| AI7 | Odgovor na pogrešnom jeziku ili pismu  | Detekcija pisma (udeo ćiriličnih karaktera) i jezika; jedan ponovni pokušaj sa pojačanom instrukcijom; zatim upozorenje korisniku | 5, 6  | plan   |
| AI8 | Prompt injection iz sadržaja sajta     | Delimiteri + instrukcija + Zod; činjenice se proveravaju naspram profila                                                          | 6     | test   |
| AI9 | Sličan tekst već objavljen u 90 dana   | Embedding sličnost > 0,92 → upozorenje i ponuda drugog ugla                                                                       | 6, 9a | plan   |

## Upload i mediji

| #   | Slučaj                                     | Ponašanje                                                                                               | Faza  | Status            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----- | ----------------- |
| U1  | Fajl od 0 bajtova                          | 400 pre uploada (klijent) i pri `complete` (server)                                                     | 7     | kod               |
| U2  | Pogrešna ekstenzija, pravi tip drugačiji   | Magic bytes odlučuju; ekstenzija se prepisuje                                                           | 7     | test              |
| U3  | HEIC                                       | Sharp konverzija u JPEG                                                                                 | 7     | kod (odbija HEIC) |
| U4  | CMYK JPEG                                  | Sharp `toColorspace('srgb')`                                                                            | 7     | kod               |
| U5  | Ogromna rezolucija                         | `limitInputPixels` 50 MP → 400 sa porukom                                                               | 7     | kod               |
| U6  | Animirani GIF                              | Prva sličica kao slika; upozorenje da mreže GIF ne prikazuju kao animaciju kroz API                     | 7     | plan              |
| U7  | Prekinut upload                            | Potpisan URL ističe za 1 h; `media_assets` red se pravi tek pri `complete`; cleanup cron briše siročiće | 7     | plan              |
| U8  | Isti fajl dva puta                         | `sha256` poklapanje → ponuda postojećeg asseta umesto duplikata                                         | 7     | kod               |
| U9  | Brisanje medija koji je u zakazanoj objavi | Trigger odbija; UI nudi zamenu                                                                          | 7, 9a | plan              |

## Mreže

| #   | Slučaj                                         | Ponašanje                                                                                                                            | Faza  | Status |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------ |
| N1  | Token opozvan na strani mreže                  | `TOKEN_INVALID` → nalog `needs_reauth`, targeti `needs_reauth`, email + banner                                                       | 8a    | plan   |
| N2  | Korisnik izgubio admin prava na stranici       | `PERMISSION_LOST` → isto kao N1 sa drugom porukom                                                                                    | 8a    | plan   |
| N3  | Nalog promenjen iz poslovnog u lični           | `listAccounts` ga više ne vraća → `disabled` sa objašnjenjem i asistiranim fallbackom                                                | 8a    | plan   |
| N4  | Promena verzije API-ja                         | Verzija u env-u; MSW testovi; deprecation header-i se loguju                                                                         | 8     | plan   |
| N5  | Uspeh bez ID-ja objave                         | `findExistingPost` po idempotency ključu ili vremenu; ako nema, target `published` sa `external_post_id = null` i oznakom za proveru | 9b    | plan   |
| N6  | Objava uklonjena zbog pravila mreže            | Pri povlačenju metrika 404 → `deleted_externally`                                                                                    | 10b   | plan   |
| N7  | Dnevni limit objava (IG 100, TikTok ~15)       | Provera pre zakazivanja i pre objave; `QUOTA_EXCEEDED` → pomeranje na sledeći slobodan termin uz obaveštenje                         | 9b    | plan   |
| N8  | Neauditovan TikTok klijent                     | Samo privatne objave; banner i objašnjenje u composer-u                                                                              | 8b    | plan   |
| N9  | Pogrešan odnos stranica slike                  | `validatePost` pre zakazivanja; Sharp auto-crop uz pregled                                                                           | 7, 9a | plan   |
| N10 | YouTube kvota potrošena                        | Dnevni brojač; `QUOTA_EXCEEDED` → sledeći dan ili asistirano                                                                         | 8c    | plan   |
| N11 | Instagram kontejner `EXPIRED`                  | Novi kontejner, jedan ponovni pokušaj                                                                                                | 8a    | plan   |
| N12 | Mediji nedostupni mreži (potpisan URL istekao) | URL se generiše neposredno pre objave sa 24 h važenja                                                                                | 9b    | plan   |

## Kalendar i objave

| #   | Slučaj                                    | Ponašanje                                                                                        | Faza | Status |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- | ------ |
| K1  | Zakazano u prošlosti                      | 400 sa ponudom „Objavi sada”                                                                     | 9a   | plan   |
| K2  | Prelaz na letnje i zimsko vreme           | UTC u bazi; test za 29.3.2026 02:30 (ne postoji) i 25.10.2026 02:30 (dva puta) u Europe/Belgrade | 9a   | plan   |
| K3  | Brisanje brenda sa zakazanim objavama     | Potvrda sa brojem objava; otkazivanje run-ova pre mekog brisanja                                 | 9b   | plan   |
| K4  | Dva člana menjaju istu objavu             | `version` + 409 + prikaz razlika                                                                 | 9a   | plan   |
| K5  | Izmena dok je `publishing`                | Trigger `POST_LOCKED`; UI prikazuje zaključano                                                   | 9b   | plan   |
| K6  | Istekla pretplata                         | Zakazane ostaju; Autopilot i generisanje staju                                                   | 12   | plan   |
| K7  | Promena vremenske zone brenda             | Ponuda da se svi budući termini pomere                                                           | 9a   | plan   |
| K8  | Dve objave u istom minutu na istom nalogu | Parcijalni UNIQUE indeks → 409 sa predlogom termina                                              | 9a   | plan   |
| K9  | Isti tekst ponovo na istom nalogu         | Upozorenje (mreže odbijaju duplikate)                                                            | 9a   | plan   |
| K10 | Objava pomerena dok Inngest spava         | `post/target.unscheduled` otkazuje stari run, novi događaj pravi nov                             | 9b   | plan   |
| K11 | Watchdog nalazi target koji kasni         | Ponovno slanje događaja; alarm ako kasni > 15 min                                                | 9b   | plan   |
| K12 | Parcijalan uspeh (2 od 3 mreže)           | Objava `partially_published`, neuspeli targeti sa razlogom i retry dugmetom                      | 9b   | plan   |

## Admin

| #   | Slučaj                                     | Ponašanje                                                        | Faza | Status |
| --- | ------------------------------------------ | ---------------------------------------------------------------- | ---- | ------ |
| AD1 | Uklanjanje poslednjeg admina platforme     | Seed skripta i ruta odbijaju                                     | 13a  | plan   |
| AD2 | Impersonacija istekla usred akcije         | Cookie nevažeći → 401 `IMPERSONATION_EXPIRED`, povratak na admin | 13b  | plan   |
| AD3 | Admin pokušava impersonaciju drugog admina | 403                                                              | 13b  | plan   |
| AD4 | Admin bez MFA                              | 403 sa uputstvom za uključenje                                   | 13a  | plan   |

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
