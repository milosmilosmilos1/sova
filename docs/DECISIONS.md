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

## D-032 · 24.10.2026 · usvojeno · Prva analiza sajta besplatna, svaka sledeća 10 tokena; bez AI-ja nema naplate

Odluka: `brand_analyze_first = 0`, `brand_analyze_again = 10` (platform_settings). Tokeni se rezervišu pri zahtevu, potvrđuju u koraku `finish` samo ako je AI zaista sastavio profil; kad Gemini nije podešen ili padne, profil je heuristički, rezervacija se oslobađa i analiza završava kao `partial` sa napomenom.
Razlog: korisnik plaća samo AI rad (brif 11.1); heuristički profil je i dalje koristan (kontakt, mreže, usluge, boje) pa ga ne treba kriti.

## D-033 · 24.10.2026 · usvojeno · Profil brenda kao polja `{value, confidence, source_urls}` sa verzijama i `locked_fields`

Odluka: `brand_profiles.data` je Zod šema `brandProfileSchema` sa 38 putanja (`FIELD_PATHS`). Svaka analiza i svaka ručna izmena prave novu verziju (`next_brand_profile_version`, trigger gasi staru `is_current`). Ručno izmenjena polja ulaze u `locked_fields` i buduće analize ih ne menjaju; otključavanje je posebna radnja. Vraćanje starije verzije kopira tu verziju (i njena zaključana polja) kao novu, istorija ostaje linearna. Sistemska polja (logo, lista objava, ima blog) ne mogu ručno da se menjaju.
Razlog: brif 5.3 i 5.6 (pouzdanost po polju, zaključavanje); linearna istorija je jednostavnija za UI i audit od grananja.

## D-034 · 24.10.2026 · usvojeno · AI izlaz profila bez null vrednosti; heuristika kao osnova, AI prepisuje kad je siguran

Odluka: šema izlaza modela (`aiProfileOutputSchema`) koristi prazan string, prazan niz ili 0 za „nepoznato”, a `aiOutputToFields` pretvara u null. Konačan profil je `composeProfile`: heuristika → AI polja sa `confidence ≥ 0.3` ili kad heuristika nema vrednost → zaključana polja iz prethodne verzije; vizuali, mreže i spisak objava dolaze samo iz deterministične ekstrakcije. Zabranjene reči se dopunjuju, ne brišu.
Razlog: `nullable` u JSON šemi za strukturisan izlaz je najčešći izvor nevalidnog JSON-a; deterministični izvori (JSON-LD, linkovi, CSS) su pouzdaniji od modela za činjenice koje se mogu pročitati.

## D-035 · 24.10.2026 · usvojeno · Bez Firecrawl-a; SPA i Cloudflare sajtovi dobijaju poruku i ručni unos

Odluka: `FIRECRAWL_API_KEY` ostaje opcion i neiskorišćen. Crawler prepoznaje SPA ljusku (malo teksta + `#root`/`#__next` + skripte) i challenge stranice (403/503 sa Cloudflare markerima) i završava analizu kao `failed` sa porukom koja nudi ručni unos. `used_firecrawl` kolona ostaje za kasnije.
Razlog: dodatni plaćeni servis pre prvog korisnika nije opravdan; ciljni korisnici (mali biznisi u Srbiji) uglavnom imaju WordPress sajtove koje čitamo direktno. Odluka se preispituje kad se u `website_crawls.error_code` nakupe `SPA_SHELL`/`CHALLENGE` padovi.

## D-036 · 24.10.2026 · usvojeno · Crawler kao `step.run` koraci sa greškama kao podacima; deps zamenljivi u testovima

Odluka: `runAnalysisPipeline(job, run)` prima apstraktni `StepRunner`; Inngest prosleđuje `step.run`, testovi prosleđuju direktno izvršavanje. Deterministične greške (robots, HTTP 4xx, SPA, prazan sajt) vraćaju `{ ok: false, code, message }` i pipeline sam zatvara analizu; samo mrežne i serverske greške bacaju (Inngest ponavlja korak). `getCrawlDeps()` daje `fetch` (SSRF omotač) i testovi ga zamenjuju MSW fetch-om sa DNS stubom (`fixture-site.test`). Stanje između koraka ide kroz rezultate koraka i bazu (`website_pages`), ne kroz zatvaranja.
Razlog: Inngest pamti rezultate koraka pa zatvorene promenljive nisu pouzdane pri ponovnom izvršavanju; greške kao podaci sprečavaju uzaludne retry-eve i jasne su korisniku.

## D-037 · 24.10.2026 · usvojeno · Nedeljna provera samo sitemap/RSS, predlozi bez AI-ja, bez dupliranja

Odluka: cron `brand-site-check` (ponedeljak 6 h, Europe/Belgrade) za aktivne brendove sa profilom: čita robots, sitemap i RSS, poredi hash sa `brands.sitemap_hash/feed_hash`, nove URL-ove (bez već poznatih stranica i bez onih iz prethodnih provera) pretvara u predloge: `new_blog_post` (source `blog`) po objavi i jedan `profile_update` (source `site_change`) kad ima novih stranica ponude. Ne preuzima stranice i ne troši tokene; `last_site_check_at` se pomera i kad sajt nema sitemap ni RSS.
Razlog: brif 5.6 traži „predlog, ne automatsku promenu”; jeftina provera bez AI-ja skalira na sve brendove.

## D-038 · 24.10.2026 · usvojeno · Šabloni kroz Satori + resvg sa ugrađenim Inter podskupom i Google fontom brenda

Odluka: vizuali iz šablona se renderuju Satori-jem (podskup HTML/CSS → SVG) i resvg-om (→ PNG), bez sistemskih fontova. Font brenda (iz profila, `mapped_headings/mapped_body`) se preuzima sa Google Fonts kao WOFF (CSS v1 API sa User-Agentom starog Chrome-a; IE6 UA daje EOT, moderan UA WOFF2 koji Satori ne čita) i proverava po magic bajtovima; uvek se dodaje ugrađeni Inter podskup (latinica, latin-ext, ćirilica; OFL) kao fallback za glifove. Slike i logo ulaze kao data URI.
Razlog: Vercel nema fontove ni librsvg sa fontconfig-om; Satori daje deterministički render sa web fontovima; podskup od 2 × 35 KB pokriva srpski u oba pisma bez velikih fajlova u repou.

## D-039 · 24.10.2026 · usvojeno · Unsplash: hotlink za preglede, kopija tek pri izboru, rangiranje kroz Gemini vision

Odluka: rezultati pretrage se prikazuju hotlinkom (`images.unsplash.com`, `ixid` zadržan, keš 1 h); tek izbor fotografije ili upotreba u šablonu poziva `download_location` i čuva kopiju (1600–2000 px) u `uploads` sa atribucijom i izvornim podacima, da objave i šabloni ne zavise od CDN-a. Za šablon se uzima 8 kandidata (orijentacija po formatu, `content_filter=high`) i Gemini vision ih rangira po relevantnosti, stilu brenda i mirnoj površini za tekst; bez ključa ili pri grešci ostaje Unsplash redosled i posao uspeva uz napomenu.
Razlog: smernice Unsplash API-ja (hotlink, download tracking, atribucija) i brif 6.2; kopija je potrebna za objavljivanje na mrežama koje traže fajl.

## D-040 · 24.10.2026 · usvojeno · Canva Connect bez Autofill-a kao primaran tok; veza po korisniku; tokeni AES-256-GCM

Odluka: tok je slika iz biblioteke → Canva asset → dizajn sa `edit_url` (korisnik dorađuje u Canvi) → export → kopija u biblioteci; Autofill se samo detektuje (`/brand-templates` 403) i ostaje za planove koji ga imaju. Veza je po (workspace, korisnik) jer Canva tokeni pripadaju Canva korisniku. Tokeni i PKCE verifier se šifruju AES-256-GCM sa verzijom ključa i AAD-om (`canva:<ws>:<user>`); refresh token se rotira pri svakom osvežavanju, `invalid_grant` prebacuje vezu u `needs_reauth`. Integracija je iza feature flaga `canva` i env ključeva; `GET /api/canva/return` (correlation state) nije ugrađen jer traži registrovan return URL u Canva portalu.
Razlog: vlasnik ima besplatan Canva plan (D-013); isti šifarski sloj služi mrežama u fazi 8.

## D-041 · 24.10.2026 · usvojeno · Vizual iz šablona je posao od 2 tokena bez obzira na izvor slike

Odluka: `visual_template` košta 2 tokena (cena pokriva do 8 Unsplash sličica kroz vision model i render); bez slike ili sa korisnikovom fotografijom cena je ista radi jednostavnosti. Trošak u USD se beleži samo za rangiranje. Rezultat je `media_assets` red sa `source: template`, `is_ai_generated = false` (tekst i kompozicija su deterministični), atribucijom Unsplash fotografije i spiskom kandidata sa ocenama.
Razlog: ARCHITECTURE 8.2 (≈ $0.01 troška po vizualu) i jednostavan cenovnik za korisnika.

## D-042 · 24.10.2026 · usvojeno · Jedan `SocialProvider` ugovor; Meta provider pokriva Facebook i Instagram kroz Facebook Login

Odluka: svaka mreža implementira `SocialProvider` (`src/integrations/social/types.ts`) sa metodama za auth, naloge, validaciju, objavu, status, idempotentnu proveru, istoriju, metrike i opoziv; greške su `ProviderError` sa zajedničkim kodovima. `registry.providerFor(platform)` vraća provider; ključ `meta` je zajednički OAuth tok za `facebook` i `instagram` (D-013: Instagram API with Facebook Login). Verzija Graph API-ja je u env-u (`META_GRAPH_VERSION`, 24.10.2026 v26.0), a `META_LOGIN_CONFIG_ID` prebacuje dialog na Facebook Login for Business konfiguraciju.
Razlog: brif 7.1 i INTEGRATIONS 1; publisher iz 9b i metrike iz 10b rade nad istim ugovorom za sve mreže.

## D-043 · 24.10.2026 · usvojeno · Nalozi „na čekanju” u `social_accounts` umesto posebne tabele; izbor naloga posle OAuth-a

Odluka: posle callback-a svi nalozi koje Facebook vrati upisuju se u `social_accounts` sa `status = disabled` i `metadata.pending = true` + `pendingState` (hash OAuth state-a), sa već šifrovanim tokenima. Korisnik na `/app/accounts` bira naloge: izabrani postaju `active` (+ uvoz istorije), ostali iz istog toka se brišu. Nalog koji je već bio aktivan samo dobija nove tokene. Token kolone: `access_token_enc` = Page token (bez isteka), `refresh_token_enc` = dugotrajan korisnički token, `refresh_token_expires_at` = njegov istek (60 dana); AAD `social:<brand>:<platform>:<external_id>`.
Razlog: ARCHITECTURE 3.4 traži ekran „izaberi naloge” bez dodatnih tabela; tokeni nikad ne prolaze kroz klijent, a `social_accounts_public` ih ne izlaže.

## D-044 · 24.10.2026 · usvojeno · `assisted_only` iz feature flagova mreže; publisher ga poštuje u 9b

Odluka: pri aktivaciji naloga `assisted_only = !flag('platform.<mreža>')`. Dok Meta App Review nije prošao (ili za mreže bez API objavljivanja), nalog je povezan, istorija i metrike se čitaju, a objave idu asistirano (Sova priprema tekst i medij, korisnik objavljuje ručno i potvrđuje). Oznaka se prikazuje na kartici naloga; prebacivanje flaga ne menja postojeće naloge dok se ne sinhronizuju (admin alat u 13a).
Razlog: brif 7 „asistirano objavljivanje kao fallback”; omogućava rad pre App Review-a bez lažnih obećanja korisniku.

## D-045 · 24.10.2026 · usvojeno · Meta callback-ovi i opoziv

Odluka: `POST /api/webhooks/meta` (deauthorize) i `POST /api/webhooks/meta/data-deletion` proveravaju `signed_request` HMAC-SHA256 sa app secret-om; deauthorize prebacuje sve naloge tog Meta korisnika (`metadata.metaUserId`) u `revoked`, data deletion uz to pravi `account_deletion_requests` (source `meta_callback`) i vraća `{ url: /data-deletion?code=…, confirmation_code }` kao čist JSON. Prekid veze iz aplikacije opoziva dozvole (`DELETE /{user}/permissions`) samo kad je to poslednji nalog tog korisničkog tokena u brendu. Dnevni `social-token-refresh` produžava korisnički token kad ističe za < 7 dana i obnavlja Page tokene; `invalid`/`190` → `needs_reauth`.
Razlog: obavezni callback-ovi za App Review (INTEGRATIONS 3) i N1/N2 iz EDGE_CASES.

## D-046 · 24.10.2026 · usvojeno · State machine objava u tri sloja; radnje po ulozi; admin zakazuje bez odobravanja

Odluka: TypeScript `src/lib/posts/state-machine.ts` (matrica + pravila uloga + `availableActions` za UI) → tabela `status_transitions` i trigger `posts_guard` → RPC `transition_post` sa `expected_version`. Radnje: editor piše, šalje na odobrenje, zakazuje tek odobrenu objavu; approver odlučuje; owner i admin zakazuju direktno iz nacrta (SCHEMA „draft → scheduled bez odobravanja”). Izmena sadržaja odobrene objave ili objave na odobravanju vraća je u nacrt (ponovno odobravanje). Brisanje je meko i samo za nacrt, odbijeno, otkazano ili neuspelo (admin).
Razlog: brif 8 i 9 traže odobravanje i jasne uloge; tri sloja daju jednu istinu u bazi a brze poruke u aplikaciji.

## D-047 · 24.10.2026 · usvojeno · `version` kao optimistic lock; svaki upis pravi `post_versions` snimak

Odluka: `PATCH /api/posts/[id]` i svaka radnja nose `version`; neslaganje daje 409 sa `currentVersion` (K4). Servis piše kroz service role posle eksplicitne provere uloge i `locked_at` (RLS ostaje druga odbrana), zatim `post_versions.upsert(version)`. Targeti se sinhronizuju sa izabranim nalozima (objavljeni i u toku se ne diraju), mediji se prepisuju po redosledu.
Razlog: dva člana istu objavu (K4) i istorija izmena bez posebnog audit sloja.

## D-048 · 24.10.2026 · usvojeno · Zakazivanje: validacija po mreži, isti minut 409, događaj po targetu, „Objavi sada” = sledeći pun minut

Odluka: `schedulePost` proverava vreme (prošlost → 400 sa hintom `publish_now`, najviše godinu dana), `validatePostContent` (dužina i hashtagovi iz `config/platforms.ts`, aktivan nalog, Meta `validatePost` za JPEG, odnos stranica, bar jedna slika na Instagramu), pa upisuje `scheduled_at` po targetu; UNIQUE indeks po minutu daje 409 sa predlogom pomeranja (K8) i vraća već zakazane targete u `pending`. Posle `transition_post` šalje `post/target.scheduled {targetId, scheduledAt, version}` po targetu; otkazivanje, pauza i uklanjanje šalju `post/target.unscheduled`. Publisher koji ih sluša stiže u 9b (do tada su događaji zabeleženi u Inngest-u bez funkcije).
Razlog: ARCHITECTURE 3.3; zakazivanje i izmena termina rade isto bez obzira na mrežu.

## D-049 · 24.10.2026 · usvojeno · Javni link za odobravanje: hash tokena, samo objave „na odobrenju”, odluka kroz isti RPC

Odluka: `approval_links` čuva SHA-256 tokena (32 bajta base64url), rok (1–30 dana), `max_uses`, opoziv; link se pravi samo za objave u `in_review`. Javne rute `/api/public/approvals/[token]` (30/min po IP-u) daju tekst, medije (potpisani URL-ovi 24 h), platforme, komentare i odluke; odluka ide kroz `decide_post` sa `approval_link_id` i verzijom (zastarela → 409), komentar klijenta u `post_comments` sa `author_name`; autor dobija obaveštenje i email. Strana `/approve/[token]` je u javnoj grupi bez indeksiranja.
Razlog: brif 8 (klijent bez naloga odobrava); ARCHITECTURE 5.2 (token samo kao hash).

## D-050 · 24.10.2026 · usvojeno · Pokušaji prema mreži su u samom run-u (3, pauze 1/5/15 min); Inngest `retries` samo za naše greške

Odluka: `runPublishTarget` sam vodi pokušaje: posle privremene greške target ide u `scheduled` sa porukom („novi pokušaj za 5 min”), `step.sleep`, pa novo zaključavanje; pre svakog ponovnog pokušaja `findExistingPost`. `retries: 3` Inngest-a pokriva pad baze ili mreže do Supabase-a, a `onFailure` otključava target (`failed`, kod `INTERNAL`). Orkestracija prima `StepRunner`, `sleep`, `sleepUntil` i `sendEvent` kao zavisnosti, pa se ceo tok testira bez Inngest-a.
Razlog: stanje u bazi je u svakom trenutku tačno i vidljivo korisniku (K5, UI); pauze su determinističke i testirane; `RetryAfterError` bi ostavio target u `publishing` bez poruke.

## D-051 · 24.10.2026 · usvojeno · Nov servisni prelaz objave `publishing → scheduled`

Odluka: kad svi targeti objave ponovo čekaju (privremena greška, kvota → +24 h, watchdog vratio zaglavljen target), objava se vraća u `scheduled` i otključava; red `('post','publishing','scheduled', true)` dodat u `status_transitions` (postojeća migracija izmenjena u mestu, `db:reset`) i u TS matricu.
Razlog: bez njega bi objava stajala zaključana u `publishing` i do 24 h; simetrično sa već postojećim `target: publishing → scheduled`.

## D-052 · 24.10.2026 · usvojeno · Token ili dozvole padnu pri objavi: target `failed` + nalog `needs_reauth`, nastavak klikom

Odluka: matrica nema `publishing → needs_reauth`, pa target ide u `failed` sa kodom `TOKEN_INVALID`/`PERMISSION_LOST` i uputstvom, a nalog u `needs_reauth`. Ako nalog nije aktivan već pre zaključavanja, target ide u `needs_reauth`. U oba slučaja korisnik posle ponovnog povezivanja klikće „Pokušaj ponovo” (`retry` prima `failed` i `needs_reauth`, odbija dok nalog nije aktivan).
Razlog: jedno mesto za ručni nastavak; nema tihog ponovnog slanja sa starim tokenom.

## D-053 · 24.10.2026 · usvojeno · Asistirano objavljivanje je status targeta, bez posebnog providera

Odluka: nalog sa `assisted_only` ili bez `capabilities.publish` u terminu prelazi u `assisted_pending` (+ email sa linkom na objavu); korisnik kopira tekst i preuzima medije (potpisani URL 24 h) pa označava `assisted_done` sa opcionim linkom objave; rollup ga računa kao uspeh. Objava do tada ostaje `scheduled` (ne zaključava se).
Razlog: brif traži fallback za mreže bez odobrenja; isti kalendar, statusi i obaveštenja kao za API objave; poseban `assisted` provider iz ARCHITECTURE 4 nije potreban.

## D-054 · 24.10.2026 · usvojeno · Obaveštenja: katalog tipova sa podrazumevanim emailom, preferencije po kanalu, zvono kroz polling

Odluka: `src/config/notifications.ts` nosi 11 tipova sa `emailDefault`; `notification_preferences` ima red samo kad korisnik promeni podrazumevano (isključen `in_app` preskače i red u `notifications`); zvono i strana `/app/notifications` osvežavaju na minut kroz `GET /api/notifications` (Realtime kanal se dodaje tek ako polling bude smetao).
Razlog: brif 9; bez novih tabela; jasno gde se dodaje nov tip (jedan objekat, tipizovan).

## D-055 · 24.10.2026 · usvojeno · `post-metrics` funkcija odložena za 10b

Odluka: događaj `post/target.published` se šalje od 9b, a funkcija sa `sleepUntil` +1 h/+24 h/+7 d/+30 d i upisom u `post_metrics_snapshots` stiže uz analitiku (10b) gde se određuju i izvedene metrike.
Razlog: 9b je publisher; snimci bez prikaza ne donose ništa korisniku, a provider metode (`fetchPostMetrics`) već postoje.

## D-056 · 24.10.2026 · usvojeno · Strategija: AI izlaz se normalizuje u kodu, najbolja vremena iz podataka računa kod

Odluka: model vraća strukturu (ciljevi, mix, stubovi, teme, hashtagovi, kampanje, pretpostavke), a `normalizeStrategyOutput` je svodi na tražene mreže, udele koji daju 100, tačno N nedelja, datume u periodu i hashtagove malim slovima. Vremena objavljivanja iz istorije (`bestTimesFromHistory`, prag 10 objava po mreži, lokalni sat kroz Intl) računa kod; model predlaže vremena samo za mreže bez podataka i to se obeležava `source: assumption` i `uses_assumptions`.
Razlog: deterministično i testirano bez modela; korisnik vidi šta je podatak, a šta pretpostavka (brif 7).

## D-057 · 24.10.2026 · usvojeno · Kalendar iz strategije pravi nacrte bez tokena; tekst stiže iz AI Studija ili Autopilota

Odluka: `generate-calendar` raspoređuje termine (`planCalendar`: rotacija najboljih vremena po nedeljama, neradni praznik +1 dan, bez duplog termina po mreži) i upisuje nacrte sa brifom kao tekstom, stubom, kampanjom, `strategy_id` i `scheduled_for`, plus targete za aktivne naloge mreže. Idempotentno po (mreža, minut) i preskače prošlost.
Razlog: 20 nacrta × 2 tokena bi trošilo tokene bez pregleda; ovako korisnik bira šta piše ručno, šta kroz AI Studio, a Autopilot (10c) puni tekst u okviru budžeta.

## D-058 · 24.10.2026 · usvojeno · Verzije strategije po `period_start`; jedna aktivna po brendu; stubovi se vezuju po imenu

Odluka: nova generacija za isti početak perioda dobija `version + 1`; `status: active` arhivira ostale aktivne strategije brenda i upisuje `approved_by/at`; stubovi iz AI izlaza sa istim imenom kao postojeći se vezuju za novu strategiju (udeo se osveži) umesto da se dupliraju, novi se dodaju sa bojom iz palete; kampanje se uvek vezuju za strategiju.
Razlog: stubovi su dugoročna osovina sadržaja (analitika po stubu u 10b), a strategija je periodična.

## D-059 · 24.10.2026 · usvojeno · `strategies.summary` i `assumptions` kao kolone

Odluka: dve kolone umesto guranja u `goals`/`network_mix` JSON; migracija izmenjena u mestu (pre lansiranja, RUNBOOK 3) uz `db:reset` i `db:types`.
Razlog: JSON polja imaju opisan oblik u SCHEMA.md i služe kalendaru; sažetak i pretpostavke su tekst za prikaz i izveštaj.

## D-060 · 24.10.2026 · usvojeno · Merodavan snimak metrika = najduži horizont; angažovanje = reakcije + komentari + deljenja + čuvanja

Odluka: pregled i uvidi koriste po targetu snimak najdužeg horizonta (30d > 7d > 24h > 1h > adhoc), a pri istom horizontu najsvežiji. Angažovanje se računa isto za sve mreže iz normalizovanih polja; stopa = angažovanje / doseg (null bez dosega). Obrisane objave (`deleted_externally`) ne ulaze u zbirove, ručno objavljene (`assisted_done`) ulaze kad imaju ID objave.
Razlog: brojevi se ne smeju menjati zbog ručnog osvežavanja; jedna formula za sve mreže omogućava poređenje po mreži i stubu.

## D-061 · 24.10.2026 · usvojeno · AI uvidi plaća platforma; dokazi se filtriraju na poznate objave; do 2 predloga po prolazu

Odluka: akcija `insights` košta 0 tokena (nedeljni cron za sve aktivne brendove, ručno 2 na sat po korisniku); generacija se ipak beleži u `ai_generations` zbog troška i praćenja. ID-jevi koje model navede kao dokaz, a ne postoje među objavama iz podataka, se odbacuju; pouzdanost se svodi na 0–1. Najviše 2 uvida postaju predlozi (rok 14 dana).
Razlog: uvidi su deo vrednosti plana, ne potrošna akcija; izmišljen dokaz bi rušio poverenje (R14); Inbox ne sme da se zatrpa.

## D-062 · 24.10.2026 · usvojeno · Analitika prvo kao brojevi i tabele, grafikoni uz dizajn

Odluka: `/app/analytics` prikazuje ključne brojeve kao pločice (vrednost + promena u odnosu na prethodni period, tekst u bojama teksta) i tabele po mreži, stubu i objavi; trend grafikoni (pratioci kroz vreme, doseg po danu) stižu u 14b zajedno sa sistemom boja i proverom palete.
Razlog: dataviz pravila traže validiranu paletu, dark mode i hover sloj; to je posao dizajn faze, a brojevi su tačni i dostupni odmah.

## D-063 · 24.10.2026 · usvojeno · Autopilot je niz koraka nad običnim objavama, ne zaseban tok

Odluka: nedeljni prolaz pravi obične nacrte (`source = 'autopilot'`, `strategy_id`, `scheduled_for` kao plan) i vodi ih kroz isti state machine kao ručne objave, preko `src/services/posts/system.ts` (`transition_post` sa `actor = null`, isti minut po nalogu, događaji publishera). Odobrena Autopilot objava se zakazuje cron-om rokova, neodobrena se obrađuje po nivou i podešavanju brenda.
Razlog: kalendar, odobravanje, publisher, analitika i istorija verzija rade bez posebnih grana; korisnik u svakom trenutku vidi i menja ono što je Autopilot napravio.

## D-064 · 24.10.2026 · usvojeno · Aktivna strategija po periodu, ne po brendu

Odluka: aktiviranje strategije (ručno ili Autopilot) arhivira samo aktivne strategije čiji se period preklapa sa novom; nedeljni prolaz traži aktivnu strategiju koja pokriva nedelju. Menja D-058 u delu „jedna aktivna po brendu”.
Razlog: mesečna strategija se pravi 25. za naredni mesec, a tekuća mora da ostane aktivna do kraja svog perioda.

## D-065 · 24.10.2026 · usvojeno · Kontrola kvaliteta je deterministička; sličnost kroz trojke reči umesto embeddinga

Odluka: QA je čista funkcija (`qaCheck`): dužina i hashtagovi po mreži, zabranjene reči, pismo, sličnost (Jaccard nad trojkama reči ≥ 0,6 sa objavama i uvezenom istorijom iz 90 dana), brojke koje nisu u činjenicama, uslugama, odlomcima sa sajta, temi ili ponudi kampanje, vizual za IG/Pinterest. Pad vraća nacrt korisniku sa izveštajem.
Razlog: bez dodatnih AI poziva i troška, objašnjivo korisniku, testirano; embedding sličnost (AI9 iz plana) ostaje kao poboljšanje kad bude dovoljno objava da se prag kalibriše.

## D-066 · 24.10.2026 · usvojeno · Budžet Autopilota = `tokens_charged` generacija označenih `input.autopilot`

Odluka: tekst, vizual i strategija koje Autopilot pravi idu kroz istu rezervaciju tokena kao ručne generacije (`user_id = null`, `input.autopilot = true`); potrošnja u UTC mesecu se računa iz `ai_generations.tokens_charged`. Provera ide pre svakog nacrta (cena teksta + vizuala), pa prolaz staje pre prekoračenja; 80 % i 100 % šalju obaveštenje jednom mesečno.
Razlog: jedan izvor istine za tokene (ledger), bez posebne tabele potrošnje; limit nikad ne prelazi zbog paralelnih koraka jer je jedan run po brendu.

## D-067 · 24.10.2026 · usvojeno · Pun autopilot po nalogu, uz flag i potvrdu imenom brenda

Odluka: nivo 3 traži uključen flag `autopilot_level3`, tačan naziv brenda u `confirm` i bar jedan aktivan nalog u `brands.settings.autopilot.level3AccountIds`; nacrt se zakazuje bez odobrenja samo ako su svi njegovi nalozi na listi, ostali idu na odobrenje. Bilo koji drugi nivo briše potvrdu i listu; trigger `brands_guard` i dalje odbija nivo 3 bez `autopilot_level3_confirmed_at`.
Razlog: brif 9.2 („izričito, po nalogu, uz dodatnu potvrdu, isključuje se jednim klikom”).

## D-068 · 24.10.2026 · usvojeno · Vizual Autopilota iz šablona bez fotografije

Odluka: za Instagram i Pinterest Autopilot pravi vizual iz šablona (boje, fontovi i logo iz profila brenda, naslov iz hook-a, JPEG 1:1, 2 tokena) bez Unsplash pretrage i vision rangiranja; AI slike i fotografije iz biblioteke korisnik dodaje ručno.
Razlog: deterministično, jeftino i bez spoljnog ključa; Instagram traži sliku pa bez vizuala QA vraća nacrt. Unsplash za Autopilot ostaje opcija u podešavanjima kad bude ključ.
