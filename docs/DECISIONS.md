# Sova — odluke

Format: broj, datum, status (predlog / usvojeno / odbačeno / zamenjeno), odluka, alternative, razlog. Nove odluke idu na kraj. Status „predlog” znači da čeka tvoju potvrdu.

## D-001 · 23.10.2026 · usvojeno (odgovor vlasnika) · Provajder plaćanja: PaymentProvider interfejs, Stripe prva implementacija

Odluka: `PaymentProvider` interfejs (`createCheckout`, `createTopupCheckout`, `createPortalSession`, `handleWebhook`, `getSubscription`) od faze 3 (tabele su provajder-neutralne: `provider`, `provider_customer_id`, `provider_price_ids`). Prva implementacija: **Paddle** ako se naplaćuje kroz firmu u Srbiji, **Stripe** ako postoji pravno lice u podržanoj zemlji.
Alternative: Stripe (brif), Lemon Squeezy, Polar, Paddle.
Odgovor vlasnika 23.10.2026: Stripe nalog je u izradi kroz TangerineSEO LLC; plaćanje se preskače do faze 12. Prva implementacija ostaje Stripe iza PaymentProvider interfejsa.
Razlog za interfejs: Stripe-ova zvanična lista podržanih zemalja (stripe.com/global, 23.10.2026) nema Srbiju; prethodna verzija projekta to je već potvrdila u praksi. Paddle izričito podržava prodavce „bilo gde u svetu” osim sankcionisanih zemalja (Srbija nije na toj listi) i kao Merchant of Record rešava PDV u EU i UK. Lemon Squeezy ima Srbiju na listi isplata na račun, ali su mu tier-ovi i budućnost nejasniji. Paddle Billing ima Checkout, Customer Portal, webhook-e sa potpisom i sandbox, što pokriva sve iz brifa. Ako ostane Stripe: Stripe Checkout, Customer Portal, Stripe Tax kako je u brifu.

## D-002 · 23.10.2026 · usvojeno · Gemini modeli

Odluka: tekst `gemini-3.8-flash` (primarni) i `gemini-3.5-flash-lite` (fallback); slike `gemini-3.1-flash-image` (standard), `gemini-3-pro-image` (premium), `gemini-3.1-flash-lite-image` (fallback); embeddings `gemini-embedding-2` sa 1536 dimenzija. Svi nazivi samo u env-u.
Alternative: `gemini-3.6-flash` (ista cena do kraja 2026, starija generacija), `gemini-nano-banana-2.1` kao standardni model za slike ($0.0336 po 1K slici, upola jeftinije, bolja tipografija po Google-u).
Razlog: na stranici modela 23.10.2026 `gemini-3.5-flash` je deprecated (preusmerava na 3.6), 3.8 Flash je najnoviji stabilan, Flash-Lite je najjeftiniji stabilan tekstualni model. Za slike brif traži 3.1-flash-image; nano-banana-2.1 treba uporediti u fazi 5 na istim promptovima pre promene. 1536 dimenzija staje u pgvector `vector` tip sa HNSW indeksom (limit 2.000), 3072 bi tražilo `halfvec` i duplo mesta.

## D-003 · 23.10.2026 · usvojeno · Instagram kroz Facebook Login

Odluka: faza 8a implementira „Instagram API with Facebook Login” (graph.facebook.com, scope `instagram_content_publish`), jedan OAuth tok za Facebook stranicu i povezan Instagram Business/Creator nalog. „Instagram API with Instagram Login” (bez Facebook stranice) ide iza feature flaga `platform.instagram_login` u kasnijoj podfazi.
Alternative: samo Instagram Login; oba odmah.
Razlog: Sova ionako objavljuje na Facebook stranice; Page token nema fiksan istek (Instagram Login token traje 60 dana i mora da se osvežava); jedan App Review pokriva obe mreže. Mana: korisnik bez Facebook stranice ne može da poveže Instagram dok ne dođe druga varijanta.

## D-004 · 23.10.2026 · usvojeno · Inngest za sve što traje ili mora da preživi pad

Odluka: Inngest Cloud (free plan za DEV/STAGING, plaćeni za PROD po potrebi) sa funkcijama iz ARCHITECTURE sekcija 6. Vercel Cron se ne koristi.
Alternative: Vercel Cron + sopstveni red u Postgresu; Supabase Edge Functions + pg_cron; Trigger.dev; BullMQ na posebnom serveru.
Razlog: brif ga traži; `step.sleepUntil` + `cancelOn` rešavaju zakazivanje i pomeranje objava bez sopstvenog scheduler-a; koraci su idempotentni i vidljivi u dashboardu; nema infrastrukture za održavanje. Rizik: zavisnost od trećeg servisa — watchdog cron i `post_targets.scheduled_at` indeks omogućavaju ručni oporavak.

## D-005 · 23.10.2026 · usvojeno · Rezervacija tokena kroz RPC sa `FOR UPDATE`, ledger samo pri potvrdi

Odluka: `reserve_tokens` zaključava grantove workspace-a, alocira iz onih koji najranije ističu, piše `token_reservations`; `confirm_reservation` u istoj transakciji smanjuje grantove, piše ledger i označava generaciju uspešnom. Rezervacije ističu za 15 min.
Alternative: jedna `balance` kolona sa dekrementom (brzo, ali ne zna koji grant ističe); optimistički update bez locka; Redis brojač.
Razlog: brif traži da dva istovremena klika ne potroše iste tokene i da neuspelo generisanje ne košta; FOR UPDATE po workspace-u je dovoljno brz (desetine zahteva u sekundi po workspace-u je nerealno). Ledger ostaje čist audit trag bez „rezervisano pa vraćeno” šuma.

## D-006 · 23.10.2026 · usvojeno · Impersonacija: JWT za ciljnog korisnika + read-only u RLS-u

Odluka: server tokom impersonacije koristi Supabase klijent sa kratkotrajnim JWT-om za ciljnog korisnika koji nosi claim `imp: { sid, ro }`; politike za pisanje sadrže `not is_impersonation_readonly()`. Cookie sesije impersonacije je potpisan HMAC-om, 30 min, sve se loguje.
Alternative: aplikacijska impersonacija (service role + ručna provera); Supabase `generateLink` i prava prijava kao korisnik.
Razlog: read-only garantuje baza, ne kod; nema korisnikove lozinke ni prave sesije koja bi preživela admina. Uslov: HS256 JWT secret dostupan serveru. Ako projekat koristi samo asimetrične ključeve bez mogućnosti potpisivanja, pada se na aplikacijsku varijantu. Proverava se u fazi 13 pre koda.

## D-007 · 23.10.2026 · usvojeno · Dokumentacija podeljena: ARCHITECTURE + SCHEMA + INTEGRATIONS

Odluka: ERD, dijagrami, tokovi, rute, Inngest i rizici u ARCHITECTURE.md; puna šema sa DDL-om i RLS politikama u SCHEMA.md; činjenice o mrežama u INTEGRATIONS.md.
Alternative: sve u ARCHITECTURE.md kako brif navodi.
Razlog: šema je sama po sebi 700+ linija; u jednom fajlu bi arhitektura bila nečitljiva. ARCHITECTURE.md i dalje sadrži sve što brif traži, u sažetom obliku, sa linkovima.

## D-008 · 23.10.2026 · usvojeno · TikTok mediji kroz FILE_UPLOAD

Odluka: za TikTok publisher šalje video u chunkovima (`FILE_UPLOAD`) iz Inngest koraka; `PULL_FROM_URL` tek ako se uvede proxy ruta za medije na našem domenu i verifikuje URL property.
Alternative: javni Storage bucket na našem poddomenu (CNAME ka Supabase nije podržan za Storage bez Pro plana i custom domena).
Razlog: TikTok prihvata `PULL_FROM_URL` samo sa verifikovanog domena; potpisani Supabase URL-ovi su na `supabase.co`.

## D-009 · 23.10.2026 · usvojeno · Dodatne tabele van brifa

Odluka: `oauth_states`, `idempotency_keys`, `brand_site_checks`, `insights`, `reports`, `holidays`, `user_flags`, `account_deletion_requests`, `data_exports`.
Razlog: svaka pokriva zahtev iz brifa koji nema gde da živi (PKCE i state, Idempotency-Key header, nedeljna provera sajta, AI uvidi, PDF izveštaji, praznici kao predlozi kampanja, oznaka za admina pri zloupotrebi, Meta data deletion callback sa kodom potvrde, izvoz podataka).

## D-010 · 23.10.2026 · usvojeno · Realtime samo na tri tabele

Odluka: Supabase Realtime `postgres_changes` uključen samo za `ai_generations`, `website_crawls`, `post_targets` (status i progress) i `notifications`, sa filterom po `workspace_id` ili `user_id`.
Alternative: Realtime na svemu; polling.
Razlog: Realtime prolazi kroz RLS i ima limite po planu; ostatak UI-ja koristi TanStack Query sa invalidacijom.

## D-011 · 23.10.2026 · usvojeno · Port 3001 lokalno i Supabase CLI kroz Docker

Odluka: `next dev -p 3001`; lokalni Supabase kroz `npx supabase start`; Inngest dev server na 8288.
Razlog: port 3000 drži drugi projekat na ovoj mašini; CLI daje identičnu bazu kao produkcija i `db reset` za testove.

## D-012 · 23.10.2026 · usvojeno · Više faza zaredom, bez zapitkivanja

Odluka: vlasnik je 23.10.2026 odobrio plan i rekao da se radi više faza zaredom bez potvrde po fazi („rokaj dokle god možeš, nemoj da zapitkuješ”). Izveštaj se piše na kraju serije faza; zastaje se samo kad nešto zaista zavisi od vlasnika (ključevi, nalozi, odobrenja).

## D-013 · 23.10.2026 · usvojeno · Odgovori vlasnika na pitanja faze 1

- Firma: **TangerineSEO LLC**. Domen aplikacije: **sovaai.rs**. Email vlasnika i platform admina: milos.milosevic.seo@gmail.com.
- Instagram: kroz Facebook Login u prvoj verziji (D-003), po proceni izvođača.
- Test sajt za Brand Brain: **tangerineseo.rs**.
- Obraćanje korisniku u interfejsu: **„vi” sa malim v** (persiranje, bez velikog slova).
- Vizuali: redosled izvora iz brifa ostaje (korisnikov materijal → Canva → Unsplash + šabloni → Gemini); Gemini modeli iz D-002 kad prethodni izvori ne daju rezultat.
- Supabase: vlasnikov nalog je na besplatnom planu (2 projekta). DEV je lokalni CLI; staging i prod su dva projekta na istom nalogu; Pro plan i PITR pre lansiranja ostaju stavka checkliste.
- X ulazi u prvu verziju; objava sa linkom košta **6 tokena**, bez linka 1.
- Canva: vlasnik ima besplatan plan i MCP konekciju; Autofill se proverava u runtime-u (nije dostupan na free planu), tok bez Autofill-a je primaran.
- Unsplash production prijavu podnosi vlasnik kad UI proradi; tekst prijave priprema izvođač.

## D-014 · 23.10.2026 · usvojeno · Opcione zavisnosti u DEV okruženju

Odluka: u `NODE_ENV=development` varijable za Upstash, Sentry, PostHog, Resend, Turnstile i sve OAuth aplikacije su opcione. Kad Upstash nedostaje, rate limiter koristi in-memory implementaciju i loguje upozorenje jednom pri startu; kad Resend nedostaje, emailovi idu u lokalni Mailpit Supabase CLI-ja (auth) ili u log (transakcioni). U `production` i `preview` su obavezne i aplikacija ne startuje bez njih.
Alternative: sve obavezno uvek (brif); .env sa lažnim vrednostima.
Razlog: vlasnik želi da se radi više faza zaredom bez čekanja na naloge; lažne vrednosti bi tiho prolazile u produkciju, a eksplicitna „dev fallback” grana se vidi u logu i testira se.

## D-015 · 23.10.2026 · usvojeno · shadcn/ui stil `base-nova` (Base UI umesto Radix)

Odluka: `npx shadcn init` je podrazumevano instalirao stil `base-nova` nad `@base-ui/react`. Zadržan je. Posledica: komponente nemaju `asChild`; za link-dugme se koristi `render={<Link href="..." />}`.
Alternative: ručno prebaciti na Radix stil (`new-york`).
Razlog: Base UI je trenutni podrazumevani stil shadcn-a i ima istu pristupačnost; nema razloga za borbu sa alatom.

## D-016 · 23.10.2026 · usvojeno · RLS bez FORCE i privilegije na nivou kolona

Odluka: RLS je uključen na svim tabelama (`enable`, bez `force`), jer `force` bi blokirao i vlasnika tabele (postgres) pri seed-u i migracijama; service_role zaobilazi RLS atributom `bypassrls`. Za kolone sa tokenima oduzet je SELECT na nivou tabele i vraćen samo na bezopasnim kolonama (`grant select (kolone)`), jer u Postgresu kolonsko `revoke` ne poništava tabelarno `grant`. Klijent čita kroz view sa `security_invoker = true`.
Razlog: provereno testom: `select *` nad `social_accounts` pada sa permission denied, view radi, RLS važi.

## D-017 · 23.10.2026 · usvojeno · `workspaces.owner_id` kaskadno brisanje

Odluka: brisanje korisnika iz `auth.users` briše i workspace-ove čiji je on vlasnik (kaskada), umesto `restrict`.
Razlog: GDPR brisanje naloga ne sme da pukne na nivou baze (test „brisanje korisnika” je padao sa `restrict`). Aplikacija pre brisanja traži prenos vlasništva kad workspace ima druge članove (stranica Brisanje podataka to i piše).

## D-018 · 23.10.2026 · usvojeno · Jedinstvenost termina po minutu kroz `minute_bucket()`

Odluka: parcijalni unique indeks nad `(social_account_id, minute_bucket(scheduled_at))` koristi sopstvenu IMMUTABLE funkciju (epoha / 60), jer `date_trunc` nad `timestamptz` nije immutable.
Razlog: epoha ne zavisi od vremenske zone, pa je deklaracija IMMUTABLE tačna; Postgres ne dozvoljava stable funkcije u indeksu.

## D-019 · 23.10.2026 · usvojeno · Admin uloga kroz `platform_admin_allowlist`

Odluka: tabela `platform_admin_allowlist(email)` (samo service_role) koju seed puni emailom vlasnika; trigger na `auth.users` dodeljuje `platform_admin` pri registraciji, seed podiže ulogu ako je profil već postojao. UI i env poređenje emaila se ne koriste.
Razlog: brif traži dodelu „samo kroz bazu (seed skripta sa mojim emailom)”; ovo je idempotentno i radi i kad se admin registruje posle seed-a.

## D-020 · 23.10.2026 · usvojeno · Rezervacija tokena bez alokacija po grantu

Odluka: `reserve_tokens` proverava ukupno dostupno (grantovi minus aktivne rezervacije) pod lock-om workspace reda i upisuje samo iznos; `confirm_reservation` tek tada troši grantove redom po isteku i beleži alokacije.
Alternative: alokacija po grantu već pri rezervaciji.
Razlog: dve rezervacije bi inače mogle da „obeleže” isti grant; ovako je potrošnja tačna u trenutku potvrde, a testovi paralelnih rezervacija i idempotentne potvrde prolaze.

## D-021 · 23.10.2026 · usvojeno · Aplikacija pod prefiksom `/app`, admin pod `/admin`

Odluka: sve stranice za ulogovane su pod `/app/...` (početna `/app`, `/app/onboarding`, `/app/team`, `/app/settings`, `/app/settings/security`), admin panel pod `/admin`, javne stranice bez prefiksa.
Alternative: `/dashboard`, `/calendar` itd. na korenu.
Razlog: proxy štiti dva prefiksa jednim matcher-om, `x-robots-tag: noindex` važi za ceo prefiks, a javne i privatne putanje se ne mešaju.

## D-022 · 23.10.2026 · usvojeno · Forme kroz Server Actions, API rute za sve ostalo

Odluka: forme za prijavu, registraciju, onboarding, tim i podešavanja koriste Server Actions (`useActionState`) sa istim Zod šemama, rate limitom i porukama kao API. Mutacije koje klijentske aplikacije i testovi pozivaju idu kroz Route Handlers (`/api/...`) sa `createHandler`.
Razlog: Server Actions rade bez JavaScript-a, imaju ugrađenu Origin proveru i jednostavnije stanje forme; brif traži API rute, koje postoje za iste operacije (`/api/workspaces`, `/api/brands`, `/api/invitations`, `/api/me`). Servisi u `src/services/` su zajednički sloj, pa nema dupliranja logike.

## D-023 · 23.10.2026 · usvojeno · API prihvata i `Authorization: Bearer <access token>`

Odluka: `getViewerFromRequest` čita Supabase access token iz Bearer headera (bez next/headers), inače cookie sesiju. Integracioni testovi zovu Route Handlers u procesu sa Bearer tokenima nad lokalnim Supabase-om (`npm run test:integration`, 10 testova).
Razlog: isti kod služi budućim API klijentima i testovima bez dev servera; Origin provera ostaje za cookie mutacije.

## D-024 · 23.10.2026 · usvojeno · Email potvrda obavezna, Google OAuth iza konfiguracije

Odluka: lokalni Supabase ima `enable_confirmations = true` (potvrda emaila pre prve sesije), lozinka najmanje 10 karaktera, TOTP MFA uključen; Google prijava se prikazuje samo kad su `GOOGLE_CLIENT_ID/SECRET` podešeni. Registracija vraća isti ekran „proverite poštu” i za postojeći email (bez otkrivanja naloga).
Razlog: brif 15.3 (potvrđen email pre trošenja tokena) i 17.4 A1; Google ključevi još ne postoje.

## D-025 · 24.10.2026 · usvojeno · Admin 404 se odlučuje u proxy-ju, ne samo u layoutu

Odluka: za `/admin/*` proxy čita `profiles.platform_role` korisnika i ne-adminu vraća rewrite na nepostojeću rutu (pravi HTTP 404). Admin layout i dalje proverava ulogu i MFA nivo (druga linija).
Razlog: korenski `loading.tsx` pravi Suspense granicu, pa Next pošalje shell sa statusom 200 pre nego što layout stigne do `notFound()`; sadržaj je bio 404, ali status 200. E2E test to je otkrio.

## D-026 · 24.10.2026 · usvojeno · Layout ne preusmerava po putanji; `x-pathname` samo informativno

Odluka: `AppLayout` ne radi redirect na `/app/onboarding` po `x-pathname` headeru; svaka stranica koja traži workspace sama preusmerava kad ga nema. Aktivni link u navigaciji i `next` za promenu workspace-a računa klijent (`usePathname`).
Razlog: proxy preskače prefetch zahteve (matcher `missing`), pa `x-pathname` nekad nije postavljen; layout je tada slao redirect na isti URL i router je ušao u beskonačnu RSC petlju (1.100 zahteva u minutu). CSP nonce se iz istog razloga prosleđuje `next-themes` provajderu iz root layouta.

## D-027 · 24.10.2026 · usvojeno · E2E kroz Mailpit API i nasumičan `x-forwarded-for`

Odluka: Playwright testovi čitaju auth emailove iz Mailpit API-ja lokalnog Supabase-a (`tests/e2e/mailpit.ts`) i svaki run šalje nasumičnu `x-forwarded-for` adresu da rate limit registracije (3/h po IP) ne obara ponovljene runove.
Razlog: potvrda emaila je obavezna, pa E2E mora da prođe kroz pravu poštu; u produkciji platforma prepisuje `x-forwarded-for`, pa header iz testa nema bezbednosni uticaj.

## D-028 · 24.10.2026 · usvojeno · Idempotency-Key kroz tabelu `idempotency_keys`, obavezan na rutama koje troše tokene

Odluka: rute `/api/ai/*` traže header `Idempotency-Key` (8–128 karaktera). Ključ se upisuje kao `in_progress` (UNIQUE po workspace+scope+key); drugi zahtev sa istim ključem vraća sačuvan odgovor (`idempotent-replayed: true`), zahtev u toku vraća 409, isti ključ sa drugim telom vraća 409 (hash tela). Neuspeh briše ključ da klijent može da ponovi.
Razlog: brif 14.1 korak 5; test potvrđuje da dupli klik ne troši tokene dvaput.

## D-029 · 24.10.2026 · usvojeno · Slike kao Inngest posao, status kroz polling `/api/ai/jobs/[id]`

Odluka: rute za slike rade korake 1–6 sinhrono i vraćaju 202 sa `generationId`; Inngest funkcija `ai-generate-image` (concurrency 2 po workspace-u) poziva `runImageGeneration`, koja je idempotentna po statusu posla. Studio strana trenutno osvežava status svake 2 s; Supabase Realtime pretplata na `ai_generations` dolazi kad UI bude finalizovan (faza 14), tabela je već u publikaciji.
Razlog: brif 6.4 (slike uvek u pozadini) i 14.1 (202 + ID posla); polling je dovoljan za test stranu i radi bez dodatnih zavisnosti.

## D-030 · 24.10.2026 · usvojeno · Strukturisan izlaz kroz `responseJsonSchema` iz Zod šeme

Odluka: Zod šema izlaza (`postTextOutputSchema`) se pretvara u JSON šemu (`z.toJSONSchema`, bez `$schema`) i šalje kao `responseJsonSchema` + `responseMimeType: application/json`; odgovor se ponovo validira istom Zod šemom. Prompt odvaja korisnički unos delimiterima `<<<PODACI>>>`.
Razlog: jedan izvor istine za oblik izlaza (brif 6.1, 17.3 prompt injection); nevalidan JSON je privremena greška (retry), a nepoklapanje sa šemom pada na fallback model.

## D-031 · 24.10.2026 · usvojeno · HEIC odložen, Gemini mock kroz MSW

Odluka: upload prihvata JPG, PNG i WebP po magic bytes-u; HEIC vraća jasnu poruku jer prebuilt `sharp` nema libheif (konverzija kroz WASM dekoder ide u fazu 7). Integracioni testovi mockuju Gemini API MSW-om (`tests/integration/gemini-mock.ts`) sa redom odgovora (uspeh, 503 pa uspeh, 404 modela, safety blokada, slika).
Razlog: brif 3 traži MSW za spoljne API-je; bez pravog ključa ceo tok (rezervacija → poziv → potvrda ili oslobađanje) je ipak testiran, uključujući retry, fallback i naplatu.
