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

## D-069 · 24.10.2026 · usvojeno · Demo nalog samo lokalno, lozinka se ne čuva

Odluka: `scripts/demo-seed.mjs` (`npm run demo:seed`) pravi demo korisnika i podatke direktno kroz service role samo kad je Supabase URL localhost; lozinka dolazi iz `DEMO_PASSWORD` ili se generiše i ispisuje u konzoli, nikad u repo ili dokumentaciju. Nalozi mreža su lažni sa `assisted_only = true`, pa publisher nikad ne zove prave mreže; generacije Autopilota u demou su upisane bez ledger-a samo da ekran budžeta ima šta da prikaže.
Razlog: vlasnik treba da vidi ekrane sa podacima pre nego što stignu Gemini i Meta ključevi; bezbednosna pravila iz brifa (bez tajni u kodu) važe i za alate.

## D-070 · 24.10.2026 · usvojeno · Impersonacija: potpisan JWT za ciljnog korisnika, admin zadržava svoju sesiju

Odluka (preferirana varijanta iz ARCHITECTURE 5.3, proverena uživo nad lokalnim Supabase-om pre pisanja koda: PostgREST prihvata HS256 JWT koji potpiše server, RLS vraća samo podatke ciljnog korisnika, upis u read-only režimu odbija sama baza, lažni potpis dobija 401):

- Start: admin bira korisnika, unosi razlog (najmanje 10 znakova) i režim. Read-only je podrazumevan. Pun režim traži dodatnu potvrdu kucanjem emaila korisnika i pravi poseban zapis u audit logu. Ne može se impersonirati drugi platform admin ni sopstveni nalog; jedan admin ima najviše jednu aktivnu sesiju (nova zatvara staru).
- Sesija: red u `impersonation_sessions` (najviše 30 minuta). Cookie `sova_imp` nosi samo `sessionId.hmac` (HMAC-SHA256 sa `IMPERSONATION_SECRET`), httpOnly, SameSite=Lax, Secure u produkciji, Max-Age do isteka. Bez korisnikove lozinke i bez korisnikove Supabase sesije.
- Svaki zahtev: server proverava potpis cookie-ja, red sesije (pripada tom adminu, nije završena, nije istekla) i da je stvarni korisnik i dalje platform admin sa AAL2 (TOTP). Tek tada pravi Supabase klijent sa JWT-om za ciljnog korisnika (`sub`, `role = authenticated`, `aud`, `exp` najviše do isteka sesije, claim `imp = {sid, ro, adm}`), potpisanim sa `SUPABASE_JWT_SECRET`. Istekla sesija se zatvara (`end_reason = expired`) i zahtev ide kao admin.
- Read-only u tri sloja: `createHandler` odbija POST/PUT/PATCH/DELETE, serverske akcije proveravaju režim, a RLS politike za pisanje (`can_edit`, `can_admin`, `profiles_update_own`) već gledaju `imp.ro`. Servisi koji pišu kroz service role zato moraju da prođu kroz prva dva sloja. `requireMembership` ne proverava režim, jer služi i čitanju (stara provera iz faze 4 je rušila svaku stranicu tokom read-only pregleda).
- Ni u punom režimu nisu dozvoljeni: lozinka, email i MFA, naplata, bilo koje brisanje (DELETE), povezivanje i odvajanje mreža i Canve, objavljivanje (zakazivanje, „objavi sada”, nastavak, retry i ručno objavljivanje targeta), promene Autopilota, tim i pozivnice, novi radni prostor.
- Audit: `impersonation.start`, `impersonation.full_mode` (poseban zapis), `impersonation.request` za svaki zahtev (metod, putanja), `impersonation.end`, `impersonation.expired`. Ako upis zahteva u audit ne uspe, zahtev ide kao admin (fail closed): nema impersonacije bez zapisa. Traka „Gledate kao <email> — Izađi” je na svakoj strani aplikacije i admin panela.
- Admin rute i stranice uvek rade sa stvarnim adminom (i tokom impersonacije). Ekrani koji koriste browser Supabase klijent (MFA) su tokom impersonacije isključeni, jer browser nosi adminovu sesiju.
- Preduslov za produkciju: Supabase projekat zadržava HS256 (legacy) JWT secret za proveru tokena. Ako pređe isključivo na asimetrične ključeve, rezerva je aplikacijska impersonacija iz ARCHITECTURE 5.3 (nije implementirana).

Razlog: brif 16 (razlog, 30 min, read-only podrazumevano, pun režim uz potvrdu, zabranjene radnje, traka, bez lozinke, potpisan httpOnly cookie, svaki zahtev u logu); RLS radi tačno kao za pravog korisnika, a read-only je garantovan i u bazi.

## D-071 · 24.10.2026 · usvojeno · Admin panel: čitanje u Server Components, izmene kroz `/api/admin/*`, sve u audit logu

Odluka: stranice `/admin/*` čitaju preko servisa u `src/services/admin/` sa service role klijentom (admin tabele nemaju RLS pristup); izmene idu kroz rute sa `auth: 'admin'` (platform admin + potvrđen email + AAL2, uvek stvarni korisnik). Svaka izmena i svako otvaranje detalja korisnika pišu `admin_audit_log` sa stanjem pre i posle, IP-om, user agentom i request id-jem. Liste (korisnici, audit) imaju pretragu, filtere, sortiranje i paginaciju na serveru; audit se izvozi u CSV.
Razlog: brif 16 (pristup na tri mesta, audit svake akcije, paginacija na serveru).

## D-072 · 24.10.2026 · usvojeno · Aktivni AI modeli iz podešavanja platforme, unutar dozvoljene liste

Odluka: `platform_settings.active_models` (tekst, rezervni tekst, slika, premium slika, rezervna slika, embedding) nadjačava env, ali samo modelom iz `allowed_models` za tu vrstu; nepoznat model se ignoriše uz upozorenje u logu. Funkcije lanaca modela su asinhrone i keširaju podešavanje 60 s.
Razlog: brif 16 („izbor modela iz dozvoljene liste”) i RUNBOOK (pad modela se rešava bez deploya); env ostaje izvor podrazumevanih naziva (brif 3).

## D-073 · 24.10.2026 · usvojeno · Aktivni korisnici iz `auth.sessions`, metrike naplate iz pretplata

Odluka: DAU i MAU broje različite korisnike čija je sesija osvežena u poslednjih 24 h i 30 dana (RPC `admin_activity_counts`, security definer, samo service role). MRR, ARR, churn i konverzija se računaju iz `subscriptions` i `plans` (godišnji plan deljen sa 12); do faze 12 su nula i stranica to kaže. Prinudna odjava briše sesije korisnika (RPC `admin_revoke_user_sessions`). Supabase Auth uz svaki token proverava i sesiju iz claim-a `session_id`, pa i već izdat access token odmah prestaje da važi (provereno integracionim testom).
Razlog: aplikacija nema sopstveni log aktivnosti, a osvežavanje sesije prati stvarno korišćenje; naplata još ne postoji.

## D-074 · 24.10.2026 · usvojeno · Marža: vrednost tokena po najnižoj ceni, besplatni tokeni bez prihoda

Odluka: prihod po tokenu je najniža cena po tokenu među plaćenim planovima i dopunama (sada godišnji plan, oko 0,033 USD). Prihod radnog prostora = naplaćeni tokeni × ta vrednost ako radni prostor ima plaćenu pretplatu ili dopunu, inače 0. Marža = prihod − trošak provajdera; negativna marža se ističe na strani AI troškova.
Razlog: konzervativna procena ne precenjuje zaradu; besplatni tokeni su trošak akvizicije, pa ih admin treba da vidi kao minus.

## D-075 · 24.10.2026 · usvojeno · Audit log je trajan zapis bez stranih ključeva

Odluka: `admin_audit_log` nema strane ključeve (migracija 019). `admin_id` i `impersonation_session_id` su obični UUID-ovi, a `admin_email` čuva email admina u trenutku radnje. Brisanje korisnika, admina ili sesije impersonacije ne menja zapise i ne blokira se zbog njih. `admin_adjust_tokens` upisuje jedan potpun zapis (IP, user agent, request id, stanje pre i posle) u istoj transakciji kao i promenu tokena; servis više ne piše svoj. Pretraga po adminu ide po snimljenom emailu, pa radi i za obrisane naloge.
Razlog: kaskada brisanja korisnika je tiho postavljala `impersonation_session_id` na NULL (append-only okidač propušta izmene unutar kaskade), RESTRICT na `admin_id` je sprečavao brisanje bivšeg admina, a promena tokena je pravila dva zapisa, od kojih je drugi mogao da padne posle uspele promene.

## D-076 · 24.10.2026 · usvojeno · LinkedIn: lični profil odmah, stranice i analitika kad ih LinkedIn odobri; veza na 60 dana

Odluka: scope-ovi zavise od odobrenih proizvoda. Uvek `openid profile email w_member_social` (self-serve „Share on LinkedIn” i „Sign In with LinkedIn using OpenID Connect”); `rw_organization_admin w_organization_social r_organization_social` tek uz `LINKEDIN_PAGES=true` (Community Management API), `r_member_postAnalytics` uz `LINKEDIN_MEMBER_ANALYTICS=true`. Skup je uvek isti, jer LinkedIn poništava ranije tokene kad se traži drugačiji skup. Autor objave je `urn:li:person:{sub}` iz `/v2/userinfo` ili `urn:li:organization:{id}` iz `organizationAcls` (uloge ADMINISTRATOR, CONTENT_ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER). Objava ide na `/rest/posts` (`Linkedin-Version: 202610`): tekst u `little` formatu sa escape-ovanim rezervisanim znakovima, jedna slika ili `multiImage` (2–20) kroz Images API (WebP se pretvara u JPEG), link bez slike kao `article` čiji naslov i opis Sova čita sa stranice (Posts API ne radi scraping). Pristupni token traje 60 dana; programski refresh imaju samo odabrani partneri, pa se bez refresh tokena vlasnici obaveštavaju 7 dana pre isteka, a posle isteka nalog prelazi u `needs_reauth`. Istorija ličnog profila se ne uvozi (`r_member_social` je ograničen), metrike ličnih objava samo uz odobrenu analitiku; stranice imaju istoriju i statistiku deljenja.
Razlog: dokumentacija pročitana 24.10.2026 (Posts, Images, MultiImage, little, 3-legged OAuth, OpenID, organizationAcls, share statistics, memberCreatorPostAnalytics); traženje scope-a koji aplikacija nema obara prijavu.

## D-077 · 24.10.2026 · usvojeno · TikTok: Direct Post, fotografije sa našeg domena, ID posle moderacije

Odluka: Login Kit za web bez PKCE-a (`code_verifier` traže samo mobilne i desktop aplikacije; beleška iz faze 1 je bila pogrešna). Foto objave idu samo kroz `PULL_FROM_URL`, pa Sova servira medij na sopstvenom domenu: `/api/media/public/{token}.jpg`, token `assetId.varijanta.istek.HMAC` (ključ HKDF iz `TOKEN_ENCRYPTION_KEY`), važi 2 h, bez preusmeravanja; varijanta `tiktok` je JPEG do 1080×1920. Baza URL-a je `PUBLIC_MEDIA_BASE_URL` (domen verifikovan u TikTok portalu). Video ide kroz `FILE_UPLOAD` u delovima (do 64 MB jedan deo, iznad toga 32 MB). Podešavanja iz editora (`post_targets.options.tiktok`: privatnost bez podrazumevane vrednosti, komentari/duet/stitch, komercijalni sadržaj, saglasnost) se proveravaju pri zakazivanju; pri objavi se ponovo čita `creator_info` i objava pada ako izabrana privatnost više nije dostupna. ID objave TikTok daje tek posle moderacije: do tada je `external_post_id = publish:{publish_id}`, a povlačenje metrika ga razreši. int64 ID-jevi se parsiraju kao stringovi (JSON.parse bi ih zaokružio).
Razlog: Content Posting API reference i UX smernice pročitane 24.10.2026; potpisan Supabase URL nije na verifikovanom domenu; bez tačnog ID-ja link i metrike bi pokazivali tuđu objavu.

## D-078 · 24.10.2026 · usvojeno · Važeći token pre svakog poziva mreže

Odluka: `accessTokenFor(row)` (`src/services/social/tokens.ts`) daje token za publisher, istoriju, metrike i sinhronizaciju: TikTok se osvežava kad ističe za manje od 10 minuta, LinkedIn posle isteka bez refresh tokena baca `TOKEN_INVALID` (→ `needs_reauth`). Nov TikTok refresh token se čuva odmah; ako paralelni proces upravo osvežava isti nalog, koristi se njegovo stanje iz baze. Oba tokena se šifruju istom verzijom ključa. Cron `social-token-refresh` ide na 6 h (Meta, TikTok, LinkedIn).
Razlog: TikTok token traje 24 h, pa dnevni cron nije dovoljan; refresh token koji se menja ne sme da se izgubi.

## D-079 · 24.10.2026 · usvojeno · Strani ključevi sa CASCADE i SET NULL proveravaju se na kraju transakcije

Odluka: svi strani ključevi u `public` sa `ON DELETE CASCADE` ili `SET NULL` su `DEFERRABLE INITIALLY DEFERRED` (migracija 020). Kaskadne radnje ostaju trenutne; odlaže se samo provera da roditelj postoji. Ključevi koji namerno blokiraju brisanje (`subscriptions.plan_id`) ostaju neodloženi. Test helper `deleteTestUser` sada pada kad brisanje ne uspe.
Razlog: kad kaskada dva puta menja isti red (npr. `strategies.created_by` i `strategies.ai_generation_id` na NULL), Postgres pri drugoj izmeni ponovo proverava sve ključeve tog reda, a roditelj je već obrisan. Brisanje naloga je zato padalo (i iz admin panela i za GDPR). Greška je od faze 10a ostala skrivena jer je čišćenje u testovima ignorisalo rezultat brisanja.

## D-080 · 24.10.2026 · usvojeno · Izvoz podataka, brisanje naloga i prenos vlasništva iz aplikacije

Odluka (brif 4, GDPR i Zakon o zaštiti podataka o ličnosti):

- **Izvoz** (`GET /api/account/export`): JSON fajl odmah, bez pozadinskog posla. Sadrži profil, način prijave, članstva, sve iz radnih prostora čiji je korisnik vlasnik (brendovi, profili brenda, nalozi mreža bez tokena, objave i targeti, mediji sa linkovima koji važe 7 dana, strategije, stubovi, kampanje, istorija, tokeni, generisanja bez internih troškova, predlozi, uvidi), njegove objave i komentare u tuđim radnim prostorima, obaveštenja i podešavanja. Najviše 3 izvoza na sat; nije dostupan tokom impersonacije.
- **Brisanje** (`POST /api/account/delete`): kucanje emaila plus lozinka; nalog bez lozinke (Google) mora biti prijavljen u poslednjih 15 minuta. Vlasnik radnog prostora sa drugim članovima prvo prenosi vlasništvo (409 sa spiskom). Radni prostori u kojima je korisnik sam brišu se kaskadno, veze sa mrežama se opozivaju kod mreže i tokeni brišu pre brisanja naloga, a objave u tuđim radnim prostorima ostaju bez autora (`created_by = NULL`). Platform admin se ne briše iz aplikacije. Brisanje je odmah, bez roka za predomišljanje. Isti plan brisanja koristi admin panel.
- **Prenos vlasništva** (`POST /api/workspaces/[id]/transfer`, RPC `transfer_workspace_ownership`): samo vlasnik, samo na postojećeg člana; novi vlasnik dobija ulogu owner i sve brendove, stari postaje admin, menja se `workspaces.owner_id`; novi vlasnik dobija obaveštenje. Nije dozvoljen tokom impersonacije (handler i RPC).
- **Odjava u svim tabovima**: posle odjave ili brisanja strana za prijavu šalje poruku kroz BroadcastChannel `sova-auth`, ostali tabovi idu na prijavu; pri povratku fokusa tab proverava `/api/me` (istekla sesija ili obrisan nalog).
  Razlog: izvoz, brisanje i stranice o privatnosti su uslov za app review kod Mete, TikTok-a i Google-a; vlasništvo mora moći da se prenese pre brisanja vlasnika tima.

## D-081 · 24.10.2026 · usvojeno · Ivični slučajevi faze 11b: meko brisanje, lokalno vreme, zona brenda, duplikati

Odluka:

- **Meko brisanje kroz service role.** SELECT politike skrivaju redove sa `deleted_at`, a Postgres pri UPDATE-u sa WHERE uslovom primenjuje SELECT politiku i na novi red. Zato je meko brisanje kroz korisnički klijent padalo sa 42501 (403): brisanje brenda iz Podešavanja nije radilo ništa (serverska akcija je grešku samo zapisivala u log), a isto je važilo za brisanje radnog prostora i medija. Sva tri servisa sada pišu kroz service role posle eksplicitne provere uloge, kao `deletePost` (D-047). Okidači i dalje rade (`media_in_use_guard` → 409), a DELETE je tokom impersonacije blokiran u handleru i serverskoj akciji. Brisanje brenda i radnog prostora kroz API otkazuje zakazane objave (K3, K13).
- **Lokalno vreme ↔ UTC na jednom mestu** (`src/lib/zoned-time.ts`): server (zakazivanje, red objava, Autopilot, strategija, promena zone) i editor objave koriste istu funkciju. Stara verzija je pomak zone računala jednom, u pogrešnom trenutku, pa je na dan prelaza sat u Beogradu između 01:00 i 02:00 (u Njujorku 01:00–06:00) završavao sat ranije ili kasnije. Pravilo je Temporal `compatible`: sat koji ne postoji ide unapred za veličinu skoka, sat koji postoji dvaput uzima raniji trenutak (K2).
- **Promena zone brenda** (K7): `PATCH /api/brands/[id]` sa `shiftSchedule: true` zadržava lokalno vreme zakazanih objava i planiranih termina; run-ovi se otkazuju i zakazuju ponovo, zauzet minut na istom nalogu pomera termin za minut (K8). Bez opcije objave ostaju u istom trenutku. Forma u Podešavanjima podrazumevano nudi zadržavanje lokalnog vremena.
- **Dupli tekst** (K9): brif traži upozorenje, ali editor proveru prikazuje tek kad radnja ne uspe, pa upozorenje nema gde da se vidi. Zato je to problem koji zaustavlja zakazivanje, i to samo za mreže koje identičan tekst odbijaju (Facebook #506, LinkedIn DUPLICATE_POST, X 187): isti normalizovan tekst (mala slova, razmaci, bar 20 znakova) objavljen ili zakazan na istom nalogu u poslednjih 30 dana. Instagram i TikTok isti opis uz drugu sliku primaju, pa se ne proveravaju.
- **Nacrt editora** (A4): forma se čuva u localStorage pod `sova:nacrt:{brandId}:{postId|nova}` 600 ms posle izmene; traka „Vrati nacrt / Odbaci” se pojavljuje kad sačuvan nacrt nije isti kao forma; posle uspešnog čuvanja nacrt se briše, a tajmer koji još čeka ga ne vraća. Nacrt ostaje samo u tom pregledaču (bez slanja na server).
- **GIF** (U6) se odbija sa objašnjenjem umesto opšte poruke o formatima; animirani GIF i video ostaju za kasnije faze.
  Razlog: faza 11 zatvara rupe iz EDGE_CASES; dve od njih (meko brisanje, konverzija vremena) su bile stvarne greške nađene tek testovima ovih slučajeva.

## D-082 · 24.10.2026 · usvojeno · Direktno otpremanje u skladište i video u biblioteci

Odluka:

- **Bajtovi ne idu kroz Next server.** Vercel funkcija ne prima telo veće od 4,5 MB, pa bi slika od 5–20 MB i svaki video pali na produkciji. Pregledač traži potpisan URL (`POST /api/media/upload-url`: brend, tip, veličina; provera uloge i limita), šalje fajl PUT-om pravo u Supabase skladište (`ws/{ws}/brand/{brand}/incoming/{uploadId}`, ID bira server), pa javlja `POST /api/media/complete`. Tek tada server preuzima fajl, proverava tip po sadržaju, sliku obrađuje kao do sada (EXIF, 4096 px, sRGB), a video čita iz MP4/MOV zaglavlja i premešta u `uploads/`. Privremeni fajl se briše u svakom ishodu; napuštene (zatvoren tab) briše dnevni posao `media-incoming-cleanup` preko RPC-a `stale_incoming_uploads` (samo service role). Stara ruta `POST /api/media/upload` ostaje za male slike iz skripti i testova.
- **Video bez ffmpeg-a.** Trajanje, prikazane dimenzije (rotacija iz matrice `tkhd`, jer telefon vertikalan snimak čuva kao položen sa rotacijom 90°) i kodeci se čitaju iz ISO BMFF kutija (`src/lib/media/mp4.ts`). Lokacija i ostali metapodaci snimka (`©xyz`, QuickTime `meta` ključevi) se brišu bez ponovnog kodiranja: kutija postaje `free` iste veličine sa nulama, pa fajl ostaje ispravan (kao EXIF kod slika). Sličica za pregled je `<video preload="metadata">` u pregledaču.
- **Limiti.** Slika do 20 MB; video MP4 ili MOV do `MEDIA_MAX_VIDEO_MB` (podrazumevano 50, koliko Supabase besplatan plan prima po fajlu), najmanje 1 s. Pravila po mreži (trajanje, odnos stranica) proverava provider pri proveri objave.
  Razlog: video je uslov za YouTube Shorts, TikTok video, Reels i Pinterest video; a otpremanje kroz server je na Vercel-u ograničeno na 4,5 MB.

## D-083 · 24.10.2026 · usvojeno · Nove mreže u zajedničkom toku: PKCE, osvežavanje, opoziv, metrike, naplata objave na X

Odluka:

- **PKCE u zajedničkom OAuth toku.** Provider sa `usesPkce` (X) dobija `code_challenge` (S256); verifier se čuva šifrovan u `oauth_states.code_verifier_enc` (AAD `social-pkce:{ključ}:{korisnik}`) i dešifruje u povratku. Google i Pinterest PKCE za poverljiv web klijent ne dokumentuju, pa ga ne koriste.
- **Osvežavanje tokena po mreži.** `accessTokenFor` osvežava svaki token sa refresh tokenom pre isteka (TikTok 10 min, X i Google 5 min, Pinterest dan ranije); bez refresh tokena istekao token daje TOKEN_INVALID. Cron na 6 h (`cronShouldRefresh`): TikTok kad ističe za manje od 6 h, Pinterest za manje od 3 dana (refresh token važi 60 dana od poslednjeg osvežavanja), X i Google samo da refresh token ne istekne dok nalog miruje (30 odnosno 60 dana posle isteka pristupnog). Nalozi koji miruju se biraju posebnim upitima, da ne istisnu TikTok i LinkedIn iz limita.
- **Opoziv po identitetu kroz sve brendove.** Pre opoziva kod mreže proverava se da li isti korisnik mreže (`providerUserId`) i dalje ima povezan nalog u bilo kom brendu, u grupi mreža koje dele opoziv (Facebook i Instagram; YouTube i Google poslovni profil, jer Google opoziv ukida sve dozvole projekta).
- **Metrike po mreži.** Objave: Facebook, Instagram, LinkedIn, TikTok, YouTube i X (X samo 24 h i 7 dana, jer se svako čitanje plaća); Google poslovni profil nema metrike objava kroz API, Pinterest zabranjuje čuvanje (D-085). Dnevne metrike naloga: bez X-a (pratioci pri sinhronizaciji); Google poslovni profil daje prikaze, klikove na sajt, pozive, putanje i poruke.
- **Naplata objave na X** (D-013): publisher pre slanja rezerviše 1 token, ili 6 kad objava ima link (X objavu sa URL-om naplaćuje $0.20); potvrda posle uspeha, i posle obrade videa; oslobađanje pri svakoj grešci; nedovoljno tokena → target pada sa porukom koliko treba. Rezervacija važi 60 min.
  Razlog: četiri nove mreže treba da prođu kroz isti tok kao Meta, LinkedIn i TikTok, uz pravila koja svaka mreža nameće.

## D-084 · 24.10.2026 · usvojeno · Google poslovni profil i YouTube kroz isti Google OAuth klijent

Odluka:

- Isti OAuth klijent kao Google prijava (`GOOGLE_CLIENT_ID/SECRET`), sa dva odvojena toka (`/api/integrations/google_business/…` i `/api/integrations/youtube/…`), da korisnik daje samo dozvole za ono što povezuje. `access_type=offline` i `prompt=consent` (refresh token samo pri prvom pristanku); identitet iz OpenID `userinfo` (`sub`); odobren `scope` se proverava jer granularni pristanak može da ga suzi.
- **Google poslovni profil**: svaka lokacija je nalog u Sovi (`external_id` = lokacija, `external_parent_id` = Google nalog, jer v4 putanja objava traži oba). Objave kroz `localPosts`: obična, događaj ili ponuda, dugme (Saznajte više, Rezervišite, Poručite, Kupite, Prijavite se, Pozovite), jedna fotografija (JPG ili PNG, bar 250 px i 10 KB; WebP ide kroz našu JPEG varijantu). Vreme događaja je lokalno vreme lokacije, bez pretvaranja u UTC. Odbijena objava (`state: REJECTED`) pada sa objašnjenjem. Lokacija sa `canOperateLocalPost = false` se povezuje, ali provera objave kaže zašto ne može. Metrike objava ne postoje (ukinuto 2023); metrike lokacije iz Performance API-ja.
- **YouTube Shorts**: kanal iz `channels.list?mine=true` (nalog bez kanala → poruka „napravite kanal”). Dozvole samo `youtube.upload` i `youtube.readonly`: brisanje traži širu `youtube.force-ssl`, a Sova ne briše objave na mrežama, pa video briše korisnik u YouTube Studiju. Video ide resumable uploadom (sesija sa metapodacima, pa bajtovi jednim PUT-om), zatim ručka `youtube_processing` dok YouTube ne javi `processed`; link `https://www.youtube.com/shorts/{id}`. Pravila pre zakazivanja: tačno jedan video, vertikalan ili kvadratan, do 3 minuta; naslov (podešavanje, naslov objave ili prvi red), opis do 5.000 bajtova bez `<` i `>`, privatnost i izjava „namenjen deci” bez podrazumevane vrednosti. AI sadržaj → `containsSyntheticMedia`. Metrike: pregledi, lajkovi i komentari iz `videos.list` (pregledi i kao `video_views`), pratioci kanala. Kvota je 100 uploada dnevno po Google projektu za sve korisnike: `quotaExceeded` pomera termin za 24 h, a povećanje traži YouTube audit.
  Razlog: oba proizvoda su Google, ali traže različite dozvole i različite provere (poslovni profil: odobrenje pristupa; YouTube: verifikacija i kvota).

## D-085 · 24.10.2026 · usvojeno · Pinterest po pravilima za programere

Odluka:

- **Pravila Pinterest-a menjaju proizvod.** (1) „Ako aplikacija dozvoljava zakazivanje pinova, korisnik mora sam da izabere svaki pin”: Autopilot ne pravi Pinterest nacrte i Pinterest ne može na nivo 3 (provera u podešavanjima Autopilota); pin pravi korisnik u editoru i za svaki bira tablu. (2) „Podaci iz API-ja se ne čuvaju” (osim kampanjske analitike): nema uvoza istorije pinova, metrika pinova ni dnevnih metrika naloga; table se čitaju uživo pri otvaranju editora, a u objavi ostaje samo izabrana tabla.
- **OAuth**: `https://www.pinterest.com/oauth/` (scope-ovi `user_accounts:read,boards:read,boards:write,pins:read,pins:write`), razmena koda sa Basic autentikacijom aplikacije; pristupni token 30 dana, „continuous” refresh token 60 dana i svako osvežavanje vraća nov (čuva se odmah). Cron ga osvežava kad pristupni ističe za manje od 3 dana, pa veza ne ističe dok je nalog povezan. Pinterest opoziv radi samo za sistemske korisnike, pa se veza prekida brisanjem tokena kod nas.
- **Pinovi**: slika (`image_url`; WebP kroz našu JPEG varijantu), karusel 2–5 slika (`multiple_image_urls`) ili video: registracija `POST /v5/media`, multipart upload na S3 sa svim poljima koja Pinterest vrati (bez Bearer tokena), ručka `pinterest_media` dok status ne bude `succeeded`, pa pin sa `video_id`. Naslovna slika videa je slika iz objave ako postoji, inače kadar iz videa (`cover_image_key_frame_time`; dokumentacija preporučuje sliku, pa ovo treba proveriti pri prvom pravom pinu). Naslov pina iz podešavanja, naslova objave ili prvog reda; opis je tekst (do 800); link je link objave sa UTM-om.
- **Trial pristup**: `PINTEREST_SANDBOX=true` šalje sve pozive na `api-sandbox.pinterest.com` (pinovi vidljivi samo autoru, bez analitike) dok Pinterest ne odobri Standard pristup.
  Razlog: Pinterest ukida pristup aplikacijama koje krše pravila za programere; bolje je da Sova to poštuje od prvog dana nego da posle mora da briše podatke i menja Autopilot.

## D-086 · 24.10.2026 · usvojeno · X: PKCE, mediji v2, štednja plaćenih čitanja

Odluka:

- **OAuth 2.0 sa PKCE** (prva mreža koja ga traži, zajednički tok iz D-083), poverljiv klijent sa Basic autentikacijom; scope-ovi `tweet.read tweet.write users.read offline.access media.write`. Pristupni token 2 h; refresh token je jednokratan (svako osvežavanje vraća nov, čuva se odmah). Opoziv `POST /2/oauth2/revoke` sa refresh tokenom.
- **Objava**: tekst (link objave ide na kraj teksta, jer X nema polje za link), do 4 slike ili jedan video. Slika ide jednim zahtevom (veća od 5 MB se smanjuje u JPEG), opis slike kroz `/2/media/metadata`; video kroz `initialize` → `append` (delovi od 4 MB) → `finalize`, pa ručka `x_media` dok obrada ne bude `succeeded`, i tek tada objava. Link `https://x.com/{korisnik}/status/{id}`.
- **Brojanje teksta** kao na X-u (`src/lib/x-text.ts`): NFC, link 23, emoji i CJK 2, i domen bez `https://` je link. Isto pravilo određuje cenu: objava sa linkom ili domenom troši 6 tokena (X je naplaćuje $0.20), bez njega 1; editor to prikazuje uz X nalog. Naplata je posle uspeha (D-083); duplikat ili potrošeni X krediti Sove ne troše tokene korisnika.
- **Štednja plaćenih čitanja**: metrike objava samo na 24 h i 7 dana (`public_metrics` i `non_public_metrics`, parser prima i stara i nova imena polja: `retweet_count`/`repost_count`), bez dnevnih metrika naloga (pratioci pri sinhronizaciji), uvoz istorije najviše 20 objava, provera „da li je objava ipak prošla” čita samo poslednjih 5.
- **Greške**: 402 (krediti Sove potrošeni) i `usage-capped` → QUOTA_EXCEEDED (termin +24 h, obaveštenje); 403 duplikat → DUPLICATE; odgovor ili citat bez pomena → PERMISSION_LOST sa objašnjenjem (self-serve pravila od 23.2.2026; Sova zato ne pravi odgovore ni citate).
  Razlog: na pay-per-use X-u svako čitanje košta platformu, a objava sa linkom košta 13 puta više od obične, pa korisnik mora da vidi cenu pre zakazivanja.

## D-087 · 24.10.2026 · usvojeno · LinkedIn: video i prvi komentar

Odluka:

- **Video** kroz Videos API: `initializeUpload` sa veličinom fajla, delovi na adrese koje LinkedIn vrati (PUT bez tokena, `application/octet-stream`), ETag svakog dela redom i bez navodnika, pa `finalizeUpload`. Objava se pravi tek kad video ima status `AVAILABLE` (ručka `linkedin_video`, isti polling kao kod ostalih mreža); `PROCESSING_FAILED` obara target sa porukom. Ograničenja: MP4, 3 s do 30 min, do 500 MB, jedan video po objavi, bez slika uz video.
- **Prvi komentar** `POST /rest/socialActions/{urn}/comments`, autor objave je `actor`. Dozvole `w_member_social_feed` i `w_organization_social_feed` dolaze samo sa Community Management API-jem, pa se traže uz `LINKEDIN_PAGES=true`, a komentar se šalje samo nalogu koji ih ima. Greška komentara se beleži i ne obara objavu, isto kao kod Mete. Kod videa komentar ide posle obrade, kad objava postoji.
  Razlog: video je bio jedini format koji LinkedIn nalog u Sovi nije mogao da objavi, a prvi komentar već postoji za Instagram i Facebook.

## D-088 · 24.10.2026 · usvojeno · Gemini ključ, model za tekst i istek roka

Odluka:

- Ključ (Google AI Studio, Gemini API na `generativelanguage.googleapis.com`) stoji samo u `.env.local`. Ograničen je na Gemini API (Vertex AI vraća 403), što je dobro. Za produkciju vlasnik unosi ključ u Vercel env, po mogućstvu poseban ključ za produkciju.
- Glavni tekstualni model je `gemini-3.6-flash`, a ne `gemini-3.8-flash` (menja deo D-002). Merenje 24.10.2026 na kratkom odgovoru: 3.8 21 do 70 s (jednom 504 posle 30 s), 3.7 35 s, 3.6 1,7 do 2,5 s, 3.5 2,7 s. Cena 3.6 i 3.8 je ista do kraja 2026. Model 3.8 ostaje u dozvoljenoj listi i admin ga uključuje bez deploya kad se ubrza.
- Gemini 504 `DEADLINE_EXCEEDED` je istek roka (`TIMEOUT`), ne greška servera. Istek roka se ne ponavlja na istom modelu dok u lancu ima sledećeg, nego odmah ide fallback.
- Integracioni testovi uvek dobijaju lažne ključeve spoljnih servisa, i kad `.env.local` ima prave, a opcioni servisi (Stripe, Resend, Upstash, Sentry, Inngest, Turnstile, PostHog, Firecrawl) su u testovima isključeni (`tests/integration/setup.ts`).
- `scripts/ai-smoke.ts` proverava pravi tekst, embedding i, uz `--image`, sliku.
- Živi testovi (`npm run test:live`, samo ručno, oko 0,2 USD): pravi API mora da prihvati svih šest JSON šema izlaza i odgovor mora da prođe Zod, plus Studio tekst, slika, Brand Brain nad pravim sajtom i strategija. Prvi prolaz 24.10.2026: sve šeme prolaze; profil tangerineseo.rs (30 strana) i strategija su tačni.
- Upit za tekst objave nosi datum objave, dan u nedelji i godišnje doba u zoni brenda (Studio: danas, Autopilot: planirani dan). Bez toga je model krajem oktobra pisao o letnjim vrućinama.
  Razlog: u Studiju korisnik čeka odgovor, a 3.8 bi uz rok od 30 s i tri pokušaja držao korisnika i do 90 s pre fallback-a.

## D-089 · 24.10.2026 · usvojeno · Meta: Reels i video, metrike posle gašenja starih, dozvola read_insights

Odluka:

- **Instagram**: jedan video ide kao Reel (`media_type=REELS`, `video_url` = potpisan link skladišta, `share_to_feed=true`), uvek kroz proveru statusa (obrada traje). Video u karuselu je dozvoljen i meša se sa slikama (`media_type=VIDEO`, `is_carousel_item`); karusel se pravi tek kad je svaki deo `FINISHED`, pa ručka `ig_carousel_items` prelazi u `ig_container` (provera statusa sada može da vrati sledeću fazu, `next`). Prvi komentar ide i posle odložene objave. Ograničenja: Reel 3 s do 15 min i do 300 MB, video u karuselu do 60 s i 100 MB (tekuća dokumentacija ga ne navodi, važe raniji limiti).
- **Facebook**: uspravan video 9:16, bar 540×960, od 3 do 90 s ide kao Reel (`video_reels`: start, bajtovi na `rupload.facebook.com` sa `offset` i `file_size`, finish sa `video_state=PUBLISHED`); ostalo kao običan video kroz `graph-video.facebook.com/{page}/videos` sa `file_url`. Objava je gotova kad `GET /{video}?fields=status` kaže `ready` i objavljeno; link Reela `facebook.com/reel/{id}`, običnog videa iz `permalink_url`. Jedan video po objavi, bez slika uz video, do 20 min i 1 GB.
- **Metrike**: Meta je ugasila `post_impressions*`, `page_impressions_unique`, `page_fans` i `post_engaged_users` (Page Insights, 15.6. i 15.11.2025), kao i IG `impressions` i `profile_views`. Sada: objava `post_media_view`, `post_total_media_view_unique`, `post_clicks`; stranica `page_total_media_view_unique`, `page_media_view`, `page_post_engagements`, `page_follows`; Facebook video i Reel iz `video_insights`; IG nalog `reach` (time_series) i `views`, `accounts_engaged`, `total_interactions` (total_value), pratioci iz `followers_count`; IG Reel puni i preglede videa.
- **Dozvola `read_insights`** je dodata: uvidi stranica i objava je traže uz `pages_read_engagement`. `publish_video` se ne traži (samo za live video).
  Razlog: video je najjači format na obe mreže, a stari nazivi metrika na v26 vraćaju grešku za ceo upit, pa Facebook uvidi ne bi stizali uopšte.

## D-090 · 24.10.2026 · usvojeno · Naplata kroz Stripe: Checkout, Portal, webhook, tokeni

Odluka:

- Stripe kroz TangerineSEO LLC (D-001) iza interfejsa `PaymentProvider` (`src/integrations/payments`); stripe-node 23.0.0 (zakucan), API verzija `2026-09-30.endive`, HTTP kroz fetch.
- Jedan Stripe kupac po radnom prostoru (`billing_customers`, migracija 023, idempotentan ključ `customer:{ws}`). Checkout uvek sa `customer`, `client_reference_id` i metadata `workspace_id` i `plan_code` (i na pretplati). Hosted Checkout i Customer Portal (kartica, fakture, otkaz na kraju perioda, prelaz mesečni ↔ godišnji). Plaća i menja samo vlasnik; istoriju tokena vide vlasnik i administrator.
- Webhook `POST /api/webhooks/payments` (i `/stripe`): sirovo telo, potpis sa tolerancijom 300 s, upis u `payment_events` (isti ID vraća 200 bez nove obrade), obrada u pozadini (`billing-process-event`). Stanje pretplate se uvek čita iz Stripe-a, ne iz payload-a, jer događaji stižu van redosleda.
- Tokeni: dopuna na plaćen Checkout (`payment_status = paid`, i kasniji `async_payment_succeeded`), bez isteka. Pretplata na `invoice.paid` (`subscription_create`, `subscription_cycle`; `subscription_update` samo ako tekući mesec još nema tokene): 500 do kraja plaćenog perioda. Godišnji plan po mesečnim delovima: prvi uz fakturu, ostali kroz `billing-daily`. Referenca `pretplata:datum početka dela` sprečava duplikate, a ID fakture u napomeni vezuje grant za povraćaj.
- Neuspelo plaćanje: `past_due` i rok 7 dana (`grace_until`), obaveštenje i podsetnici dan 1, 3 i 6 (`dunning_step`). Posle roka (ili kad je `unpaid`) nova generisanja vraćaju `PAYMENT_REQUIRED`, zakazane objave ostaju. Završena pretplata vraća besplatan plan, a preostali tokeni pretplate ističu sa periodom.
- Povraćaj i spor: tokeni se oduzimaju srazmerno vraćenom iznosu kroz `revoke_tokens_to` (do ukupnog iznosa za referencu, pa ponovljen ili delimičan događaj oduzima samo razliku). Potrošeni tokeni se ne vraćaju i stanje ne ide u minus (odstupanje od T5: grantovi ne mogu ispod nule). Spor još označava vlasnika (`user_flags.chargeback`) i ide u log grešaka; dobijen spor vraća tokene.
- Stripe Tax je isključen dok vlasnik ne izabere poreski model (`STRIPE_AUTOMATIC_TAX`): Stripe Tax sa sopstvenim registracijama (EU OSS, u Srbiji sa poreskim punomoćnikom) ili Stripe Managed Payments (Stripe je prodavac). Odluka ide uz računovođu.
- Dnevni posao `billing-daily` još oslobađa istekle rezervacije i grantove (T3; do sada ih nije zvao nijedan posao) i obrađuje događaje zaglavljene u stanju `received`.
  Razlog: webhook je jedini izvor istine za novac (povratak sa Checkout-a ništa ne dodeljuje, T7), a idempotentne reference u bazi štite od Stripe ponavljanja.

## D-091 · 25.10.2026 · usvojeno · Vizuelni sistem: plava tema, tamne javne strane, svetli radni ekrani

Odluka:

- Boje su tokeni u `src/app/globals.css` (oklch): primarna plava `oklch(0.55 0.2 262)` na svetloj temi (bele kartice na blago plavoj pozadini, bočna traka sa plavim aktivnim stanjem i trakom levo), a na tamnoj površina `oklch(0.16 0.028 265)`, svetlija plava sa tamnim tekstom na dugmetu (kao akcenat reference) i ivice `white / 9%`. Dodatni tokeni: `--brand`, `--brand-2` (gradijent i reč u naslovu), `--glow`, `--grid-line`, `--success`, `--warning`; klase `bg-grid`, `bg-grid-fade`, `bg-glow`, `text-brand-gradient`, `ring-brand-glow` su u `@layer components`, da ih utility klase nadjačaju.
- Javne strane (landing, prijava, registracija, pravne strane) su uvek tamne: omotač u `(public)/layout.tsx` ima klasu `.dark`, nezavisno od teme sistema. Aplikacija prati temu sistema (next-themes), sa istim akcentom u obe teme.
- Landing po referenci: segmentirana navigacija, naslov sa rečju u gradijentu, dijagram toka kao kosi čipovi sa aktivnim korakom, kartice mreža sa neutralnim ikonama (bez tuđih logotipa), funkcije, koraci, cene iz tabele `plans` i cene akcija iz `token_prices`, pitanja, završni poziv. Ušteda godišnjeg plana se računa iz cena, ne piše se ručno.
- Znak Sove (`src/components/brand/sova-logo.tsx`): oči sove u kvadratu sa plavim gradijentom, gradijent kroz CSS (bez SVG ID-jeva).
- Početna aplikacije postaje pregled: tokeni, zakazano za 7 dana, doseg za 7 dana sa promenom, Inbox, sledeće objave u zoni brenda i „Prvi koraci” (Brand Brain, mreže, strategija, prva objava); svaki izvor ima svoju rezervu, pa jedan pad ne obara stranu.
  Razlog: brif traži moderan izgled u plavoj boji po Dribbble referenci; tamna površina radi za prodaju i prvi utisak, a svetla je odmornija za višesatni rad u kalendaru i editoru.

## D-092 · 25.10.2026 · usvojeno · Grafikoni: sopstvene SVG komponente jedne serije

Odluka: `src/components/charts/` ima dve komponente bez spoljne biblioteke. `TrendChart` crta liniju od 2 px sa blagom površinom (pratioci po mreži kao male zasebne slike, osa ne kreće od nule). `ColumnChart` crta stubove do 24 px sa zaobljenim vrhom (dnevni zbir do 31 dana, preko toga nedeljni). Pravila za obe:

- jedna serija nema legendu, naslov kaže šta je nacrtano; nema dve ose u istom grafikonu;
- vrednost se piše samo na kraju linije ili na najvišem stubu, ostalo nose osa, oblačić (miš i strelice) i dugme „Tabela”;
- boja je `--chart-1`, proverena validatorom palete za svetlu i tamnu površinu (na tamnoj svetlina 0,64, jer 0,74 izlazi iz opsega);
- oznake ose su skraćene („1,2 hilj.”) tek kad je korak ose bar 1.000, da se ista oznaka ne ponavlja;
- prazan period ima rečenicu umesto praznog grafikona.

Doseg i angažovanje po danu objave računa `dailySeries` u zoni brenda, sa nulom za dane bez objava. Admin pregled i AI troškovi koriste iste komponente (registracije, trošak i generisanja po danu); serverske strane prosleđuju `unit`, ne funkciju za format.

Alternative: Recharts ili Chart.js (oko 100 KB i teže uklapanje u pravila i temu).
Razlog: tri vrste grafikona ne opravdavaju biblioteku, a sopstvene komponente prate temu kroz tokene i imaju tastaturu i tabelu bez dodatnog rada.

## D-093 · 25.10.2026 · usvojeno · Sečenje slike i zamena medija u zakazanoj objavi

Odluka:

- **Sečenje (EDGE_CASES N9).** Editor poredi odnos stranica svake izabrane slike sa opsegom izabranih mreža (YouTube se preskače jer prima samo video). Kad je slika van opsega, nudi sečenje na najbliži odnos iz preseka opsega (npr. 9:16 → 4:5 za Instagram), uz pregled celog kadra, zatamnjen deo koji otpada i klizač za položaj isečka. `POST /api/media/[id]/crop {aspect, position}` pravi novu sliku u biblioteci po istom pravougaoniku kao pregled (`src/lib/media/crop.ts`). Original ostaje jer može biti u drugim objavama; isečak nasleđuje izvor, atribuciju, opis i oznaku AI sadržaja, a `source_data.cropped_from` pamti original. Isti isečak se ne čuva dvaput (sha256).
- **Zamena (EDGE_CASES U9).** U zakazanoj ili pauziranoj objavi vlasnik ili administrator menja medij bez otkazivanja termina (`POST /api/posts/[id]/media/replace`). Nov medij pre upisa prolazi istu proveru po mreži kao zakazivanje, verzija raste („zamena medija” u istoriji), a stari medij posle toga može da se obriše iz biblioteke. Urednik dobija 403 jer bi tako zaobišao odobravanje: on otkazuje zakazivanje i menja objavu u editoru. Zaključana objava (objavljivanje je počelo) se ne menja; verzija i zaključavanje se proveravaju u istom upitu.
- **Dedup po brendu.** Isti fajl u drugom brendu istog prostora je sada poseban medij. Ranije je dedup vraćao medij drugog brenda, pa je čuvanje objave padalo sa „pripadaju drugom brendu”.

Alternative: kolona `post_media.crop` sa sečenjem pri objavi. Odbijeno: mreže preuzimaju fajl po URL-u, pa bi sečenje pri objavi ionako pravilo nov fajl, a pregled ne bi bio isti kao rezultat.
Razlog: provera objave je javljala pogrešan odnos, ali sliku je trebalo seći van Sove; brisanje medija iz zakazane objave tražilo je otkazivanje i ponovno zakazivanje.

## D-094 · 25.10.2026 · usvojeno · Mesečni PDF izveštaj: @react-pdf, mesec u zoni brenda, PDF klijentu u prilogu

Odluka:

- **Sadržaj.** Isti brojevi kao strana Analitika, za kalendarski mesec u zoni brenda (oktobar počinje u ponoć 1. oktobra po lokalnom vremenu) i uz poređenje sa celim prethodnim mesecom: pet pločica (objave, doseg, prikazi, angažovanje, stopa), doseg po danu objave, tabele po mreži i stubu, pet najboljih objava (tekst objave, ne interni naslov), pratioci po nalogu, AI uvidi iz tog meseca i napomene. Mesec bez objava dobija rečenicu umesto praznih grafikona.
- **Render.** `@react-pdf/renderer` 4.9.0 (zakucan), A4, Inter iz `src/lib/visuals/fonts` (latinica sa č, ć, đ i strelicama; znak minus U+2212 ne postoji u fontu, pa se koristi obična crta). Grafikon je od pravougaonika po pravilima iz D-092 (bez SVG-a). Next 16 sam drži paket van bundle-a; fontovi su izričito u trace-u API ruta (`outputFileTracingIncludes`), jer se čitaju sa diska.
- **Čuvanje.** Privatni bucket `exports`, `ws/{ws}/reports/{brand}/{YYYY-MM}-{nasumično}.pdf`; jedan red u `reports` po brendu i mesecu (jedinstven indeks), novo pravljenje istog meseca zamenjuje fajl i briše stari. Preuzimanje samo potpisanim linkom (1 h) sa imenom `izvestaj-{brend}-{YYYY-MM}.pdf`.
- **Na zahtev.** `POST /api/reports {brandId, month}` za tekući (u toku) ili do 11 meseci unazad; svaki član brenda, 10 u minuti.
- **Mesečno.** Inngest `reports-monthly` radi na sat 1. i 2. u mesecu (UTC) i šalje događaj brendovima kojima je po njihovoj zoni 1. od 06:00 (2. dan je rezerva), koji su u prethodnom mesecu imali bar jednu objavu i kojima izveštaj još nije poslat. `report-monthly-brand` (jedan po brendu u isto vreme, 2 ponovna pokušaja) pravi PDF, šalje ga emailom kao prilog na adrese iz `brands.report_emails` i obaveštava vlasnika i administratore (`report_ready`, link na Analitiku).
- **Jednom, ne dvaput.** Oznaka slanja (`sent_to`, prazan niz kad nema adresa) upisuje se pre emailova: posao koji padne posle slanja ne šalje klijentu isti izveštaj ponovo. Radije jedan propušten email (vlasnik ga ionako vidi u aplikaciji) nego duplikat.
- **Adrese klijenta.** Do 5 adresa po brendu, bez duplikata i malim slovima; menja ih vlasnik ili administrator, jer izveštaj tada izlazi van tima. Svaki primalac dobija zaseban email (ne vidi druge adrese), a poruka kaže kako da se prijem prekine.

Alternative: Satori i resvg pa slike u PDF-u (tekst se ne bi mogao označiti ni pretraživati); Chromium na serveru (pretežak za Vercel funkciju); link umesto priloga (klijent nema nalog, a potpisan link ističe).
Razlog: brif traži mesečni izveštaj klijentu; agencija ga danas pravi ručno iz više alata.

## D-095 · 25.10.2026 · usvojeno · SEO javnih strana i indeksiranje samo na pravom domenu

Odluka:

- **Početna**: naslov i opis iz prevoda (`landing.metaTitle`, `landing.metaDescription`), kanonski URL `/`, Open Graph i Twitter kartica. Slika za deljenje je `src/app/(public)/opengraph-image.tsx` (1200×630, tamna površina i plava sa landinga, Inter sa srpskim slovima), pravi se pri build-u i važi za sve javne strane.
- **Strukturirani podaci** (schema.org) na početnoj: `Organization` (vlasnik) i `SoftwareApplication` sa cenama iz tabele `plans` (besplatno, mesečno, godišnje). `<` u JSON-u se piše kao escape, da tekst iz baze ne može da zatvori `<script>`. FAQ oznake nisu dodate: Google ih od 2023. prikazuje samo za državne i zdravstvene sajtove.
- **robots.txt i sitemap.xml** (`src/app/robots.ts`, `sitemap.ts`, spiskovi u `src/lib/seo.ts`): javne strane da; `/app`, `/admin`, `/api/`, `/auth/`, linkovi za odobravanje i pozivnice ne; javni URL medija za mreže (`/api/media/public/`) ostaje dostupan. U mapi su početna, registracija, pravne strane i strana o botu.
- **Samo pravi domen**: indeksira se samo kad je `NEXT_PUBLIC_APP_URL` na `sovaai.rs` (ili `www.`). Pregledi na Vercel-u, staging i localhost dobijaju `Disallow: /`, praznu mapu i `noindex` na svim stranama, da kopija ne uđe u pretragu pre pravog sajta ili umesto njega.

Razlog: brif traži landing koji se nalazi u pretrazi i lepo izgleda kad se podeli; iskustvo sa ranijim sajtovima je da staging bez zabrane završi u indeksu.

## D-096 · 25.10.2026 · usvojeno · Testiranje: E2E glavnih tokova, pristupačnost kroz axe, E2E u CI-ju

Odluka:

- **E2E glavnih tokova** (`tests/e2e`): korisnik i radni prostor se prave kroz service role (`fixtures.ts`, odbija Supabase van localhost-a), sa lažnim Facebook i Instagram nalozima za asistirano objavljivanje. Pokriveno: nacrt → zakazivanje → kalendar; javni link → klijent bez naloga odobrava; slika 9:16 → upozorenje → isečak 4:5; mesečni PDF iz Analitike. Registracija sa potvrdom emaila ostaje u svom spec-u (Mailpit).
- **Pristupačnost**: `@axe-core/playwright` 4.13.0 (zakucan, stariji od dve nedelje), pravila WCAG 2.1 A i AA. Test pada na ozbiljne i kritične nalaze na javnim stranama, na 15 strana aplikacije u svetloj i tamnoj temi i na strani za odobravanje. Prvi prolaz je našao i ispravljeno je: crveni tekst na svetlocrvenoj pozadini (`--destructive` tamnija, 5,1:1), zeleni tekst (`--success` tamnija, `text-success` umesto `text-emerald-700`), boje statusa u kalendaru, dani van meseca (prozirnost), polja bez labele na strani za odobravanje, dugmad meseca bez imena. Jednokratni prolaz nad demo nalogom sa podacima: nula nalaza u obe teme.
- **E2E u CI-ju**: posao `e2e` diže lokalni Supabase (sa Mailpit-om), dev server i Inngest dev server (`inngest-cli` zakucan na 1.46.0; zakazivanje ide kroz Inngest), pa pušta ceo Playwright skup. Dev server, ne produkcijski build: build bi tražio produkcijske tajne (Resend, Upstash). Na grešci se čuvaju `test-results`, `dev.log` i `inngest.log`.
- **npm audit** (9 postojećih nalaza, nijedan od novih paketa): `zod` 3.x unutar `inngest` 4.26.0 (najnovija verzija, popravke nema; `/api/inngest` u produkciji prima samo potpisane zahteve), `fflate` kroz `satori` (fontovi su naši ili sa Google Fonts), `file-type` kroz `jimp`/`node-vibrant` (ulaz je uvek PNG koji je sharp ponovo kodirao iz proverenog tipa slike). Prihvaćen rizik; ažurirati kad paketi izdaju popravke.

Razlog: brif traži testove glavnih tokova pre deploya; pristupačnost je deo kvaliteta, a bez automatske provere kontrast i labele se kvare neprimetno.

## D-097 · 25.10.2026 · usvojeno · Priprema za produkciju: Frankfurt, migracije samo kroz odobren workflow

Odluka:

- **Region**: Vercel funkcije `fra1`, Supabase `eu-central-1`, Upstash Frankfurt. Najbliže korisnicima u Srbiji i regionu, podaci ostaju u EU.
- **Vercel Pro**: Hobby je samo za nekomercijalnu upotrebu. Teške rute imaju izričit `maxDuration` (Inngest 300 s, obrada videa 120 s, PDF, AI tekst, sečenje i javni URL medija 60 s), da ne zavise od podrazumevane granice platforme.
- **Migracije**: samo kroz ručni GitHub workflow „Migracije” uz odobrenje vlasnika (GitHub Environment sa obaveznim recenzentom). Podrazumevano je suvi prolaz; seed samo pri prvom deploy-u. CLI zakucan na verziju iz `package.json` (2.122.0). Nikad `db push` sa lokalne mašine.
- **Seed bez gaženja**: `platform_settings` (cene tokena, rate limit, održavanje, Autopilot) sada ide sa `on conflict do nothing`. Ranije bi ponovljen seed vratio vrednosti koje admin menja u aplikaciji; katalog planova se i dalje usklađuje sa seed-om.
- **Produkcijski build proveren lokalno**: prolazi; `robots.txt`, `sitemap.xml` i slika za deljenje se prave pri build-u, a Inter fontovi i `@react-pdf/renderer` su u trace-u ruta koje ih koriste.
- **Bez deploya**: nijedan nalog, baza ni domen nisu napravljeni. Koraci za vlasnika su u [DEPLOY.md](DEPLOY.md).

Razlog: brif traži pripremu za produkciju; promene na živom okruženju idu tek uz izričitu dozvolu vlasnika.

## D-098 · 25.10.2026 · usvojeno · Landing po dizajnu iz Claude Design-a

Odluka:

- **Izvor**: dizajn „Sova Landing” (Claude Design handoff) prenet je u komponente u `src/components/landing/`; prototip i njegov `support.js` se ne koriste. Zamenjuje izgled landinga iz D-091; svetla tema aplikacije ostaje, a klase `text-brand-gradient` i `ring-brand-glow` su uklonjene jer ih je koristio samo stari landing.
- **Tokeni i fontovi**: boje kao `--color-l-*` u `@theme` (pozadina #060A13, kartice #0B111E, akcenat #3DA9FC), animacije `--animate-l-*` uvek pod `motion-safe:`, pa uključeno smanjeno kretanje zaustavlja i demo. Onest i JetBrains Mono kroz `next/font/google` samo u `(public)/layout.tsx`; unapred se učitavaju latinica i latin-ext, ćirilica stiže kad je strana zatraži. Jedno odstupanje: najtamnija siva iz dizajna (#56647D) je #73819A, jer prva ne prolazi kontrast 4,5:1.
- **Ikone i logotipi mreža**: Font Awesome Free 6.7.2 (samo paketi ikona, CC BY 4.0), crtani kao inline SVG kroz komponentu `Fa`, bez fonta i spoljnog CSS-a; Google G je nacrtan u boji. Pre lansiranja logotipe proveriti prema brand kitovima mreža.
- **Fotografije**: 16 fotografija sa Unsplash-a lokalno u `public/landing/` (1,76 MB posle optimizacije) umesto hotlinka sa images.unsplash.com i Wikimedia-e: CSP, privatnost posetilaca, brzina. To su primeri dok ne postoje pravi.
- **Podaci umesto teksta iz dizajna**: cene, tokeni, limiti planova i dopune dolaze iz tabele `plans`, troškovi iz `token_prices`. Kalkulator i preporuka plana računaju se iz istih vrednosti (`pricing-math.ts`, najjeftinija kombinacija dopuna). Ako planova nema u bazi, sekcija cena kaže da cenovnik nije dostupan umesto da pokaže zastarele brojeve.
- **Ispravljene tvrdnje iz dizajna**: „objavljivanje ne troši tokene” sada ima izuzetak za X (1 token, sa linkom 6; D-013); podnaslov cena je „Tokeni se troše kad AI nešto napravi. Kalendar i analitika ne koštaju ništa.”; odgovor o podacima navodi obrađivače iz Politike privatnosti umesto „ne dele se sa trećim stranama”; pretplata se otkazuje sa stranice Naplata; limit za Pinterest je 800 znakova iz `config/platforms.ts`, ne 500.
- **Registracija prati flag `registration_open`**: kad je zatvorena, landing ima tekst iz dizajna („U izradi · Registracija stiže uskoro”) i dugmad vode na demo i cene; kad je otvorena, vode na `/register`.
- **Demo u hero sekciji**: šest koraka, sam prelazi na 4,5 s, staje na hover i fokus. Adresa iz forme se samo očisti i prikaže u demou; ne šalje se serveru.
- **Pristupačnost**: interaktivni delovi su dugmad sa `aria-pressed`, `role="switch"` ili `aria-expanded`; zatvoreni odgovori u pitanjima ostaju u HTML-u (`hidden`); linkovi u tekstu su podvučeni. Axe test javnih strana radi sa `reducedMotion: 'reduce'`, inače meri panel demoa usred prelaza.
- **Zaglavlje i podnožje** važe za sve javne strane (prijava, registracija, pravne strane). Ispod 768 px srednju navigaciju menja meni u zaglavlju (sekcije, a na najužim ekranima i Prijava). Nova strana `/kontakt` (podrška i privatnost) je u mapi sajta, a link Kontakt više nije `mailto:`.

Razlog: vlasnik je dobio lepši dizajn landinga iz Claude Design-a i traži da se primeni. Brojevi iz baze i ispravljene tvrdnje drže tekst tačnim kad se cene ili pravila promene.

## D-099 · 25.10.2026 · usvojeno · Cene u evrima, paketi sa 5 brendova i 2 člana, favicon

Odluka:

- **Cene** (odluka vlasnika): mesečni 47 € (bilo 39 US$), godišnji 277 € (bilo 199 US$). Dopune ostaju 12, 30 i 85, ali u evrima, kao i besplatni plan. Sve cene su u istoj valuti: Stripe kupcu ne dozvoljava pretplatu u jednoj, a dopunu u drugoj valuti, a cenovnik ne sme da meša valute.
- **Limiti mesečnog i godišnjeg plana**: 5 brendova, 10 mreža, 2 člana (bilo 3, 10 i 3). Dva brenda su obično isti brend na srpskom i engleskom, pa 3 nisu bila dovoljna.
- **Katalog** je u `supabase/seed.sql`; ponovljen seed sada usklađuje i valutu. Lokalna baza je ažurirana istim SQL-om kroz `docker exec`.
- **Stripe**: cene pretplata se prave u evrima (47 € mesečno, 277 € godišnje), ID-jevi idu u `STRIPE_PRICE_MONTHLY` i `STRIPE_PRICE_YEARLY`. Dopune šalje aplikacija kroz `price_data` sa iznosom i valutom iz tabele `plans`, pa su same u evrima.
- **Landing**: iznosi, ušteda godišnjeg plana (51 %) i iznos po mesecu (oko 23 €) računaju se iz baze. Cenovnik se ne prikazuje ako plaćeni planovi i dopune nisu u istoj valuti.
- **Admin statistika ostaje u USD**, jer je trošak AI-ja u USD: cene planova se za MRR, vrednost tokena i maržu preračunavaju po kursu iz `platform_settings.fx_usd_rates` (podrazumevano ECB referentni kurs od 23.10.2026: 1 EUR = 1,1193 USD), a kurs piše uz MRR i vrednost tokena. Plan u valuti bez kursa ne ulazi u zbirove.
- **Favicon**: znak Sove kao na landingu (plavi zaobljen kvadrat sa očima): `src/app/icon.svg`, `favicon.ico` (16, 32 i 48 px; 16 px ima posebnu verziju poravnatu na piksele, inače se oči spoje) i `apple-icon.png` (180 px, pun kvadrat). Sve pravi `scripts/make-icons.mjs`; pokrenuti ga ponovo kad stigne pravi logo.
- **Next oznaka „N” u uglu** (indikator razvojnog servera) je isključena kroz `devIndicators: false`. Vidi se samo lokalno; greške se i dalje prikazuju.

Razlog: odluka vlasnika o cenama i paketima; favicon i bez oznake razvojnog servera da lokalni pregled liči na pravi sajt.

## D-100 · 25.10.2026 · usvojeno · Prvi deploy: Netlify (besplatno) i postojeći Supabase projekat

Odluka:

- **Netlify umesto Vercel-a** (odluka vlasnika): sajt `sovaai` na timu „Projekat 1” (besplatan plan), adresa https://sovaai.netlify.app. Next.js ide kroz Netlify runtime; `netlify.toml` zadaje build, Node 22 i fontove za Satori i PDF. Ograničenja besplatnog plana: funkcija radi najviše 60 s (duži koraci, na primer obrada videa, mogu da puknu), zahtev je najviše 6 MB (slike veće od oko 4,5 MB ne prolaze kroz server), sve promenljive zajedno najviše oko 4 KB, funkcije rade u SAD dok je baza u Frankfurtu. Prelazak na Vercel (D-097) ostaje otvoren.
- **Baza**: postojeći prazan Supabase projekat vlasnika (Frankfurt, besplatan plan). Agent je uz dozvolu vlasnika pustio 25 migracija i seed kroz Supabase konektor, umesto workflow-a „Migracije” (D-097), jer GitHub Environment još nije podešen. Istorija migracija nosi verzije fajlova iz repoa, pa kasniji `db push` vidi da je sve primenjeno. Šema je proverena otiskom (kolone, ograničenja, indeksi, funkcije, politike, okidači, prava, bucket-i) i ista je kao lokalna; razlika u funkcijama je samo kraj reda (CRLF u lokalnoj bazi).
- **Migracija 019 bez `drop function`**: konektor odbija brisanje funkcije, pa je stara `admin_adjust_tokens(uuid, integer, text, uuid)` ostala. Aplikacija zove samo novu (pet parametara), pa ne smeta; vlasnik je briše jednom linijom u SQL editoru (DEPLOY.md 10). Popuna `admin_email` je izostavljena jer je audit log bio prazan.
- **Migracija 025**: Supabase savetnik je našao da neprijavljen korisnik može da pozove pomoćne SECURITY DEFINER funkcije. Revoke od `anon` u 009 nije bio dovoljan jer pravo dolazi preko uloge PUBLIC. Sada `revoke ... from public`; okidačke funkcije niko ne zove direktno. Test baze to proverava (31 test).
- **Tajne**: javne vrednosti (adresa aplikacije, Supabase URL i publishable ključ) agent je upisao u Netlify. Tri tajne aplikacije su generisane lokalno u `.env.netlify.local` (u .gitignore) i nisu prošle kroz razgovor; vlasnik dopunjuje ključeve servisa i ceo fajl uvozi u Netlify.
- **Otpremanje koda** ide iz čiste kopije repoa (`git worktree`), da `.env.local` ne ode na Netlify.

Razlog: vlasnik želi aplikaciju na internetu odmah i bez troška hostinga; nalozi servisa su njegovi i ključeve unosi sam.

## D-101 · 25.10.2026 · usvojeno · Režim pregleda: produkcija radi dok ključevi servisa ne stignu

Odluka:

- **`SOVA_PREVIEW=true`** (samo uz `NODE_ENV=production`) daje env režim `preview`. Ključevi spoljnih servisa (Gemini, Unsplash, Canva, Inngest, Upstash, Resend, Turnstile) su tada opcioni kao u DEV-u (D-014). Osnovne tajne i Supabase ostaju obavezne: `NEXT_PUBLIC_APP_URL`, Supabase URL i ključevi, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `IMPERSONATION_SECRET`.
- **Ponašanje bez ključa u pregledu**: CAPTCHA se preskače uz upozorenje u logu, rate limit radi u memoriji instance, emailovi se umesto slanja beleže u log sa linkovima, AI i pozadinski poslovi vraćaju poruku da nisu podešeni. Prijavljen korisnik vidi napomenu šta se još uključuje.
- **Prazna vrednost** (`KLJUC=` iz uvezenog .env fajla) znači da promenljiva nije podešena, u svim režimima.
- **Prava produkcija** ostaje stroga: bez `SOVA_PREVIEW` server ne startuje dok ne dobije sve ključeve. Režim se gasi brisanjem te promenljive kad svi ključevi budu uneti.

Razlog: vlasnik želi da sajt i aplikacija rade odmah na sovaai.netlify.app, a naloge servisa otvara postepeno. Pregled je izričito uključen jednom promenljivom, pa ne može slučajno da ostane na pravom domenu.

## D-102 · 29.10.2026 · usvojeno · Interni plan „Vlasnik” za radni prostor vlasnika platforme

Odluka:

- **Plan `vlasnik`** u katalogu (`supabase/seed.sql`): 100 brendova, 100 mreža, 10 članova, 60 strana za Brand Brain, cena 0, bez tokena po periodu. `is_active = false`: nije u cenovniku, RLS ga ne pokazuje, a checkout ga odbija.
- **Dodela** (RUNBOOK 8): pretplata sa `provider = 'internal'`, bez Stripe kupca i bez kraja perioda, plus jednokratnih 1.000.000 tokena kroz `admin_adjust_tokens`. Tokeni koje dodeli admin nemaju rok trajanja, a dodela ostaje u audit logu.
- **Statistika**: interna pretplata nije prihod. Migracija 026 je ne broji u plaćenim radnim prostorima, u pretplatama po planu (MRR) ni u oznaci „plaća” kod AI troškova. Dodeljeni tokeni ostaju u napomeni „dodeljeno” na pločici tokena, jer su stvarno dodeljeni.
- Radni prostor sa ovim planom ne kupuje drugu pretplatu (jedna aktivna po radnom prostoru, jedinstven indeks); dopune tokena rade normalno.
- **`/api/health`** u produkciji javno vraća samo `status` i vreme; detalje po servisu vidi admin platforme sa potvrđenim TOTP-om (kako i piše u ARCHITECTURE), a lokalno ih vide svi. Na hostingu se ne proba lokalni Inngest dev server.

Razlog: vlasnik objavljuje za svoje biznise iz iste aplikacije koju prodaje. Plan u bazi umesto posebnog koda znači da limiti, prikaz u Naplati i trošenje tokena idu istim putem kao kod kupaca.

## D-103 · 29.10.2026 · usvojeno · Provera env-a pre build-a na Netlify-ju

Odluka:

- Netlify build pokreće `npm run check:env && npm run build`. `scripts/check-env.mjs` uvozi `src/lib/env.schema.ts` (Node type stripping, radi i na Node 22) i validira promenljive kao server pri startu: režim `preview` uz `SOVA_PREVIEW=true`, inače `prod`.
- Kad fali obavezna promenljiva, build pada i živi sajt ostaje na prethodnom deploy-u. Bez provere bi deploy prošao, a server bi pao na svakoj strani.
- Ispis sadrži samo imena: koja promenljiva fali i koji servisi su podešeni. Deploy preview i branch deploy se preskaču jer nemaju produkcijske tajne.
- Šema u `build` režimu i dalje ne traži ništa, pa CI i lokalni `next build` rade bez tajni.

Razlog: tajne unosi vlasnik u Netlify UI, a agent ne lista promenljive (konektor vraća vrednosti koje nisu označene kao tajne). Provera u build-u je jedini pouzdan znak da je uvoz prošao, a da se vrednosti ne pokažu.

## D-104 · 29.10.2026 · usvojeno · Slike i video bez Gemini-ja: Unsplash, Canva i šabloni; AI slike iza prekidača

Odluka:

- AI slike (Studio: „Slika iz fotografije” i „Slika iz prompta”) su iza feature flaga `ai_images`, podrazumevano isključenog. Server odbija zahtev sa 403 pre rezervacije tokena, a Studio te kartice ne prikazuje. Admin ih uključuje u admin panelu, bez deploya.
- Slike za objave dolaze iz tri izvora bez AI slika. Prvi je vizual iz šablona (Satori). Drugi je fotografija sa Unsplash-a: nova kartica u Studiju, kopija u biblioteci sa atribucijom, bez tokena. Treći je gotov dizajn iz Canve: nova kartica „Iz Canve” sa listom dizajna korisnika (`GET /api/canva/designs`) i uvozom kao PNG, za 2 tokena.
- Video: Unsplash API nema video, a Canva API ne daje pristup Canvinoj biblioteci, nego samo dizajnima korisnika. Video zato dolazi iz korisnikove Canve, kao MP4 export u pozadinskom poslu `canva-export-video` (Inngest, događaj `canva/video.export.requested`). Canva video pravi i po nekoliko minuta, a Netlify funkcija traje najviše 60 s.
- Posao proverava Canvu na 5 s, posle pola minuta na 15 s, ukupno do oko 9 minuta. Gotov video preuzima i čuva u istom koraku, da link za preuzimanje ne izađe sa servera. Prvo pokušava 1080p. Ako fajl prelazi limit skladišta (`MEDIA_MAX_VIDEO_MB`, 50 MB na besplatnom Supabase-u), ponavlja export u 720p. Orijentaciju (`vertical_*` ili `horizontal_*`) bira po sličici dizajna, jer izlaz uvek prati odnos stranica dizajna. Cena je ista kao za uvoz slike, 2 tokena (`canva_export`).
- Slike se iz Canve izvoze bez širine, u veličini dizajna. Na besplatnom Canva planu export ne sme da uveća dizajn fiksnih dimenzija više od 1,125 puta, pa je raniji zahtev od 2048 px padao na dizajnu od 1080 px. Čekanje na Canva posao u istom zahtevu je skraćeno na 45 s, ispod Netlify limita.
- Dok su AI slike isključene, landing računa sliku objave po ceni vizuala iz šablona, 2 tokena.

Razlog: jedna AI slika košta od 0,067 USD (standard) do 0,134 USD (premium), koliko dvadesetak tekstova (tekst objave košta oko 0,003 USD). Vlasnik je tražio da Gemini ne pravi slike, nego da slike i video dolaze iz Canve i sa Unsplash-a. Gemini ostaje za tekst, analizu brenda i strategiju. Ostaje i za rangiranje Unsplash kandidata u šablonu, oko 0,001 USD po vizualu, i to samo kad korisnik sam ne izabere fotografiju.

## D-105 · 29.10.2026 · usvojeno · Godišnji plan 297 €

Odluka (vlasnik): godišnji plan ide sa 277 € na 297 €. Mesečni ostaje 47 €, a tokeni i dopune se ne menjaju (500 tokena mesečno kroz 12 meseci).

- Katalog (`supabase/seed.sql`) i tabela `plans`, lokalno i u produkciji, imaju `price_cents` 29700. Landing čita cene iz baze pri svakom učitavanju, pa promena nije tražila deploy. Godišnji po mesecu je sada oko 25 € (bilo oko 23 €), a ušteda prema 12 mesečnih 47 % (bilo 51 %).
- Stripe još nije podešen. Kad bude, godišnja cena se pravi kao 297 € (`STRIPE_PRICE_YEARLY`). Cena u Stripe-u se posle ne menja, nego se pravi nova sa novim ID-jem.

Razlog: odluka vlasnika.

## D-106 · 29.10.2026 · usvojeno · Uvodne cene: redovna 90 € i 500 €, precrtana pored 47 € i 297 €

Odluka (vlasnik):

- Plan ima redovnu cenu u novoj koloni `plans.regular_price_cents` (migracija 027). Mesečni plan ima redovnu cenu 90 €, a godišnji 500 €. Naplaćuje se i dalje `price_cents`, odnosno 47 € i 297 €.
- Landing pored cene plana prikazuje precrtanu redovnu cenu i natpis „Uvodna cena, 48 % popusta” (godišnji 41 %). Naplata u aplikaciji takođe prikazuje precrtanu redovnu cenu. Redovna cena se prikazuje samo kad je veća od cene koja se naplaćuje, a prazna kolona znači da plan nema uvodnu cenu.
- Natpis glasi „Uvodna cena”, a ne „sniženje”. Kod sniženja pravila EU traže da precrtana cena bude najniža cena iz prethodnih 30 dana, a ovi planovi se po 90 € i 500 € nikad nisu prodavali. Uvodna cena je u redu ako redovna cena posle uvodnog perioda zaista važi. Inače je to obmanjujuće isticanje cene, koje zabranjuje i Zakon o zaštiti potrošača.
- Strukturisani podaci za pretragu (`offers`) i Stripe nose samo cenu koja se naplaćuje.

Razlog: odluka vlasnika da cene izgledaju kao popust.

## D-107 · 29.10.2026 · usvojeno · Vrste objava, jezik i mešanje vrsta; video sa Pexels-a; priče na Instagramu i Facebook-u

Odluka:

- Postoji šest vrsta objave: samo tekst, slika, karusel, video (Reels), priča (Story) i link (`src/config/post-formats.ts`). Svaka mreža prima samo neke (`PLATFORM_FORMATS`). Instagram ne prima objavu bez slike, YouTube prima samo video, a TikTok video i karusel. Uz vrste postoji i „AI bira”: Gemini bira vrstu među onima koje primaju sve izabrane mreže i upisuje je u polje `format`.
- Studio ima novu prvu karticu „Nova objava” (`POST /api/ai/compose`). Korisnik bira mreže, temu, jezik (srpski latinicom, srpski ćirilicom, engleski), vrstu i izvor vizuala (automatski, Unsplash, Pexels ili šablon). Jedan zahtev piše tekst sa heštegovima, bira vizual i pravi nacrt sa targetima za povezane naloge. Nacrt se pregleda u editoru i zakazuje kao svaki drugi. Gemini uz tekst vraća i `visual_query`, 2 do 5 reči na engleskom za pretragu fotografija i snimaka.
- Vizual zavisi od vrste. Slika i karusel dobijaju fotografiju sa Unsplash-a, kvadrat od 1600 px (karusel tri). Priča dobija uspravnu fotografiju 1080×1920. Kad Unsplash nema rezultat, fotografija dolazi sa Pexels-a. Video je uspravan snimak sa Pexels-a od 3 do 60 sekundi: najbolji MP4 do 1080 px po kraćoj strani koji staje u limit skladišta. Šablon je po izboru. Unsplash i Pexels ne troše tokene, šablon troši 2, a tekst 2 kao i do sada. Canva ostaje u svojoj kartici, jer Canva API daje samo dizajne korisnika.
- Pexels je nova integracija (`PEXELS_API_KEY`). API je besplatan, 200 zahteva na sat i 20.000 mesečno. Rezultati pretrage se čuvaju u kešu sat vremena. Snimak ili fotografija se kopira u biblioteku tek kad se izabere, sa imenom autora (`Video by … on Pexels`), a isti snimak se u istom brendu ne čuva dvaput. Studio ima i karticu „Pexels video i fotografije” za ručni izbor, sa linkom ka Pexels-u koji njihova pravila traže. Izvor medija `pexels` dodaje migracija 028.
- Autopilot ima novu karticu „Sadržaj”: jezik objava, vrste koje sme da pravi i „AI meša vrste”. Podrazumevano su jezik brenda, sve vrste i uključeno mešanje. Kad meša, vrsta se bira po objavi među dozvoljenim za tu mrežu, a slika i karusel dolaze dvaput češće od ostalih. Bez mešanja ide prva dozvoljena vrsta koju mreža prima. Vizual nacrta je sa Unsplash-a ili Pexels-a, bez tokena. Vizual iz šablona (2 tokena, D-068) ostaje rezerva kad izvori nemaju rezultat. Kad nema snimka, video postaje slika, uz napomenu na nacrtu.
- Priče idu na Instagram i Facebook stranicu. Target nosi `options.format = 'story'`, a editor ima kvačicu „Objavi kao priču (Story)”. Na Instagramu se pravi kontejner `media_type: STORIES` pa se objavljuje. Na Facebook-u se fotografija otpremi neobjavljena pa ide u `photo_stories`, a video kroz `video_stories` (start, bajtovi na rupload, finish). Priča nema opis ni prvi komentar. Tekst ostaje uz nacrt, a provera pre objave ne gleda njegovu dužinu ni da li se ponavlja. Priča ima tačno jedan medij, a video u priči traje od 3 do 60 sekundi.

Razlog: vlasnik je tražio da bira jezik i vrstu objave, da ima sve vrste koje postoje i da AI može da ih meša. Tekst sa heštegovima i dalje piše Gemini, a slike i video se ne prave AI-jem (D-104). Pexels je dodat jer Unsplash API nema video, a Canva API ne daje pristup Canvinoj biblioteci.

## D-108 · 30.10.2026 · usvojeno · Funkcije po uzoru na Moonya u fazama; bez AI fotografija; cene ostaju; interfejs i objave na tri jezika

Odluka (vlasnik): vlasnik je poslao snimke ekrana aplikacije Moonya i jedne svoje ranije aplikacije i tražio da Sova dobije sve te opcije. Na tri pitanja je odgovorio ovako:

- AI fotografija nema. Slike u objavama su samo besplatne: Unsplash, Pexels i galerija korisnika. D-104 i dalje važi.
- Cene ostaju 47 € i 297 € (D-099, D-105, D-106), bez probe od 7 dana.
- Interfejs je na srpskom, engleskom i ukrajinskom, sa izborom jezika aplikacije. Objave se pišu na srpskom (latinica i ćirilica), engleskom i ukrajinskom.

Plan po fazama. Svaka faza ima testove, commit i zapis u PROGRESS:

1. Jezici: interfejs sr, en i uk sa izborom jezika, ukrajinski kao jezik objava.
2. Stilovi objava: 22 stila za objavu, karusel i priču, boje brenda, pregled uživo. Gemini piše slajdove.
3. Tokovi („Automatizuj objave”): tema, format i stil, raspored po danima. Nacrti idu na odobravanje. „Generiši odmah” prikazuje napredak. Instagram saradnici.
4. Odobravanje: pregled nacrta sa slajdovima, izmena opisa i heštegova, sačuvaj i zakaži, objavi odmah, generiši ponovo, preskoči, preuzmi.
5. Uvod u sedam koraka: jezik, mreže, analiza sajta, PDF-a i Instagrama, glas brenda i teme, boje, stil. Teme postaju tokovi.
6. Brend i nalog u karticama i strana Brain: šta zna, izvori, playbook.
7. Galerija sa kategorijama i opisima, izbor slike iz galerije u tokovima.
8. Početna, kalendar sa pločicama, vodič i podrška, tabla za predloge funkcija.
9. Studio kao razgovor.
10. Inbox poruka, komentara i recenzija i DM automatizacija, iza prekidača dok Meta ne odobri dozvole za poruke i komentare.
11. Karusel u video, instalacija na telefon i obaveštenja za odobravanje.
12. Prevod postojećih ekrana na engleski i ukrajinski.

Novi ekrani se odmah pišu na sva tri jezika (next-intl), a postojeći se prevode u fazi 12. Do tada je izbor jezika u meniju iza prekidača `ui_languages`, da korisnik ne dobije pola ekrana na jednom jeziku, a pola na drugom. Izgled prati Sovin dizajn (D-091) i ne kopira Moonyu: preuzimaju se funkcije, ne izgled ni tekstovi.

Razlog: zahtev vlasnika. AI fotografije ne, zbog troška (D-104).

## D-109 · 30.10.2026 · usvojeno · Stilovi objava: 22 stila, slajdovi iz jednog poziva, dizajn brenda

Odluka (faza 2 iz D-108):

- Postoje 22 stila objave (`src/lib/visuals/design`): 12 tipografskih (naslov i podnaslov, snažna poruka, citat, statistika, lista, minimal mono, kartice, lan, prizma, pop kartica, beleška, pamflet) i 10 sa fotografijom (poster, uredništvo, naslovnica, duoton, uramljeno, događaj, društvena kartica, snimak, mim, film). Spisak su vlasnikovi primeri iz njegove ranije aplikacije i iz Moonye. Izgled je naš, pisan od nule u Satori-ju.
- Isti stil crta tri vrste slajda (naslovni, sadržaj, poziv na akciju) u tri formata: uspravno 4:5 (1080×1350), kvadrat 1:1 i priča 9:16. Svaki stil sa fotografijom ima izgled i bez nje (preliv u bojama brenda), da objava ne padne kad pretraga ništa ne nađe.
- Fotografije za slajdove su samo besplatne: Unsplash pa Pexels, ili galerija brenda. AI fotografija nema (D-108). Stil kaže gde mu treba fotografija (nigde, samo naslovni slajd, svi slajdovi), pa se ne preuzima više nego što treba: najviše četiri fotografije po karuselu, koje se ponavljaju redom.
- Dizajn brenda je nova kolona `brands.design` (migracija 030): stil, format, izvor fotografija, broj slajdova (3 do 10, podrazumevano 5), pet boja i nalog na slajdovima. Čuva se samo ono što je korisnik izabrao. Ostalo dolazi iz profila brenda (paleta i fontovi sa sajta) i sa povezanog naloga (Instagram, pa TikTok, X i Facebook). Boja teksta na slajdu se sama menja kad nije čitljiva na pozadini (kontrast 4,5:1).
- Tekst slajdova piše Gemini u jednom pozivu, zajedno sa opisom objave, kratkim opisom za X, heštegovima i pojmovima za pretragu fotografija. Naplata je ista kao za tekst objave, 2 tokena. Slajdovi i fotografije su besplatni. Kad korisnik izabere „AI bira”, model sam odlučuje da li tema traži jednu objavu ili karusel.
- „Nova objava” u Studiju podrazumevano pravi dizajn u stilu brenda za objavu, karusel i priču. „Samo fotografija” radi kao do sada (D-107). Kartica „Dizajn objava” je na strani brenda, sa biračem stilova i pregledom uživo (`GET /api/visuals/preview`, JPEG u bojama koje korisnik upravo menja).
- Priča može imati više slika: Instagram i Facebook ih objavljuju redom, kao niz priča. Video u priči ide sam.

Razlog: zahtev vlasnika (D-108). Jedan poziv za sve tekstove drži trošak na jednom tekstu po objavi, a stil crta Sova bez troška.

## D-110 · 30.10.2026 · usvojeno · Tokovi automatizacije: tema, stil i dani pripreme; nacrt uvek na odobravanje

Odluka (faza 3 iz D-108):

- Tok je jedna tema sa formatom (karusel, objava ili priča), stilom, brojem slajdova, izvorom fotografija, jezikom i rasporedom pripreme: dani u nedelji i vreme u zoni brenda. Prazna polja znače „kao u dizajnu brenda” (D-109), pa promena dizajna važi za sve tokove koji nemaju svoj izbor. Brend ima najviše 50 tokova.
- Vreme u rasporedu je vreme pripreme, ne objave. Tada Sova piše tekst (2 tokena), crta slajdove (bez troška) i šalje nacrt na odobravanje. Nacrt iz toka uvek ide na odobravanje, a vreme objave bira korisnik pri odobravanju. Kontrola kvaliteta Autopilota (D-065) samo se beleži uz nacrt i ne zaustavlja ga.
- „Sova bira vreme” daje svakom toku stalan termin između 07:00 i 21:45 na četvrt sata, izveden iz ID-ja toka, da tokovi istog brenda ne kreću u isti minut.
- Mreže: „automatski uključi povezane mreže” znači sve aktivne naloge koji primaju format, i one povezane kasnije. Inače idu izabrani nalozi. Nalog čija mreža ne prima format (npr. priča na LinkedIn-u) se preskače. Bez ijednog takvog naloga prolaz pada, uz obaveštenje `flow_failed`.
- Instagram saradnici (do tri naloga) idu u `post_targets.options.collaborators`. Provider ih šalje kao `collaborators` na kontejneru objave, Reela i karusela, a priča ih nema.
- Migracija 031: `content_flows` (tokovi), `content_flow_runs` (prolazi, jedan po toku i terminu, `unique (flow_id, slot_at)`) i `posts.flow_id`. Čita se kroz RLS (pristup brendu), a upisuje kroz service role posle provere uloge.
- Inngest: `flows-tick` (cron na 15 min) upisuje prolaze tokova kojima je došao termin i računa sledeći termin od sada. Posle zastoja ne kreće zaostatak. `flow-run` radi jedan prolaz u tri koraka (tekst, slajdovi, nacrt), najviše dva u isto vreme po radnom prostoru. „Generiši odmah” pravi ručni prolaz. Ako za isti tok već postoji prolaz na čekanju ili u toku, vraća se taj, da dvostruki klik ne potroši tokene dvaput. Prozor napretka čita korak prolaza (`step`) na dve sekunde.
- Poziv na akciju „DM automatizacija” je u šemi (`cta_mode`), ali je u izgledu isključen dok ne bude faze 10 (Meta dozvole za poruke).
- Postojeći Autopilot (nedeljni nacrti iz strategije, nivoi, budžet) ostaje kakav jeste. Tokovi su poseban, jednostavniji put. Spajanje dve stvari je pitanje za kasnije, kad vlasnik vidi kako se koriste.

Razlog: zahtev vlasnika (D-108). Vreme pripreme umesto vremena objave čuva odobravanje kao jedino mesto gde se objava pušta u svet.

## D-111 · 30.10.2026 · usvojeno · Odobravanje: pregled slajdova i odluka u jednom potezu

Odluka (faza 4 iz D-108):

- Nova strana „Odobravanje” (`/app/approvals`) sa karticama: čekaju (`in_review`), odobreni (odobreno, zakazano, pauzirano), objavljeni, preskočeni (otkazano i odbijeno) i svi. Ima pretragu, filter po formatu (karusel, objava, priča, video, tekst) i redosled. Meni pokazuje broj nacrta koji čekaju odluku.
- Srednji deo prikazuje slajdove jedan po jedan, sa strelicama i sličicama. Desni panel ima opis po mreži (osnovni i poseban za svaku mrežu, sa brojačem prema granici mreže), prvi komentar i termin objave u zoni brenda. Termin je predlog: sledeći slobodan termin iz reda objava, inače sutra u 10:00.
- Odluke idu kroz postojeći state machine i prava (`workflow.ts`). „Sačuvaj i zakaži” radi izmene, odobrenje (ako nacrt čeka) i zakazivanje u jednom zahtevu. „Objavi odmah” isto, sa objavom odmah. Urednik bez prava odobravanja vidi „Sačuvaj izmene” i napomenu ko odobrava. „Preskoči” nacrt koji čeka odobrenje prvo vraća u nacrte, pa ga otkazuje, jer state machine ne otkazuje iz odobravanja. Vraća se iz editora objave.
- „Generiši ponovo” piše nov tekst (2 tokena) i crta nove slajdove istim stilom, formatom i izvorom fotografija. Kontekst za to je nova kolona `posts.design` (migracija 032), koju upisuju „Nova objava” i tokovi. Objave bez tog konteksta (ručne i stare) nemaju ovo dugme. Verzija objave štiti od dvostrukog klika: drugi zahtev sa starom verzijom dobija 409 i ne troši tokene. Stari slajdovi ostaju u biblioteci.
- „Preuzmi” daje slajdove kao ZIP (01.jpg, 02.jpg …). ZIP pravi sopstvena mala funkcija bez kompresije (`src/lib/zip.ts`), jer su slajdovi već JPEG.
- „Napravi video” iz karusela dolazi u fazi 11.

Razlog: zahtev vlasnika (D-108). Jedan potez za čestu odluku (izmeni, odobri, zakaži) skraćuje odobravanje, a sve ostaje u istim pravilima kao editor.

## D-112 · 30.10.2026 · usvojeno · Uvod u sedam koraka, glas brenda i PDF o brendu

Odluka (faza 5 iz D-108):

- Novi radni prostor posle prvog formulara ide na uvod (`/app/setup`) u sedam koraka: jezik objava (i jezik aplikacije kad se uključi `ui_languages`), mreže, analiza (sajt, PDF, ranije objave), brend (glas i teme), boje, stil i kraj. Svaki korak čuva svoje kroz postojeće rute, a korak je u adresi, pa povratak sa Facebook-a (`?pending=`) otvara korak Mreže sa izborom naloga. Uvod može da se preskoči ili prođe ponovo. Početna pokazuje traku „Završite podešavanje” dok `brands.setup_completed_at` nije upisan.
- Glas brenda (`brands.voice`, migracija 033): šta nudi, kome se obraća, kako zvuči, po čemu je drugačiji, šta nikad ne piše, uobičajen poziv na akciju i do osam glavnih tema. To su reči vlasnika i imaju prednost: prompt ih ispisuje posebnim blokom „GLAS BRENDA” ispred odlomaka sa sajta, u svakom generisanju koje koristi kontekst brenda (tekst objave, karusel, tokovi, strategija, uvidi). Dok vlasnik ne sačuva svoj, ekran nudi predlog iz profila sa sajta, bez AI poziva.
- „Predloži iz izvora” (2 tokena, kao tekst objave): jedan Gemini poziv čita profil sa sajta, odlomke iz PDF-a i do 15 ranijih objava sa mreža i vraća sva polja i šest tema. Predlog popunjava samo prazna polja i dodaje teme; ništa se ne čuva dok vlasnik ne klikne „Sačuvaj”. Bez ijednog izvora poziv se odbija pre rezervacije tokena.
- PDF o brendu (`brand_documents`): do 10 MB i deset dokumenata po brendu. Fajl ide pravo u skladište `brand-assets` preko potpisanog URL-a (isti put kao D-082; bucket sada prima `application/pdf`), server proverava zaglavlje `%PDF-` i upisuje red „processing”, a Inngest `brand-document-index` čita tekst (`unpdf`, pdf.js 6, najviše 150 strana i 200.000 znakova), deli ga i pamti u bazi znanja kao `knowledge_chunks` sa `source_type 'manual'`. Odatle ga koriste RAG i predlog glasa. Skeniran PDF bez teksta, zaključan ili oštećen završava kao „Nije pročitano” sa razlogom. Ponovna analiza sajta ne briše odlomke iz PDF-a. Brisanje dokumenta briše fajl, odlomke i red.
- Kraj uvoda: svaka izabrana tema postaje tok (karusel u stilu brenda, sve povezane mreže, dva dana nedeljno pomereno po toku, vreme bira Sova, poziv na akciju iz glasa). Prve dve teme su uključene, ostale pauzirane. Ekran pre klika pokazuje cenu (2 tokena po nacrtu) i broj nacrta nedeljno. Bez povezane mreže tokovi nastaju pauzirani, jer prolaz bez naloga ne može da napravi nacrt. Tema koju brend već ima kao tok se preskače, pa ponovljen kraj ne pravi duplikate.
- Uputstvo modelu za srpsku latinicu (`WRITE_IN`) sada traži č, ć, ž, š i đ i kad ih izvori nemaju. Provera predloga uživo pokazala je da model inače prepisuje tekst bez kvačica iz PDF-a; isto važi za karusele.

Razlog: zahtev vlasnika (D-108). Uvod vodi novog korisnika do prvih nacrta u jednom prolazu, a glas brenda daje vlasniku kontrolu nad onim što je analiza pogrešno ili nepotpuno zaključila.

## D-113 · 30.10.2026 · usvojeno · Brain i „Brend i nalog”; playbook iz rezultata u istom pozivu kao uvidi

Odluka (faza 6 iz D-108):

- Nova strana „Brain” (`/app/brain`, u meniju umesto „Brand Brain”): šta Sova zna o brendu (naziv, ponuda, publika, ton, iz glasa vlasnika ili iz profila sa sajta, sa brojem popunjenih), odakle uči (mreže i uvezene objave, sajt i datum analize, pročitani PDF-ovi, objave sa metrikama u 30 dana, ručne beleške) i playbook. Ispod je postojeća analiza sajta sa celim profilom (sidro `#sajt`), pa „Osveži analizu” vodi tamo.
- Playbook (`brands.playbook`, migracija 034): zaključak za sledeći nacrt, do šest pravila „šta radi” i do četiri „šta izbegavati”. Piše ga nedeljni poziv za uvide, u istom pozivu (šema dobija polje `playbook`), pa nema dodatnog AI troška; „Osveži sada” na strani Brain pokreće uvide za 30 dana kad postoje bar tri objave sa metrikama. Novo pravilo ide na vrh, staro ostaje dok ima mesta, a pravilo koje nova analiza prebaci na suprotnu stranu se briše. Prompt svakog nacrta ima blok „PLAYBOOK” posle glasa brenda, ispred odlomaka sa sajta. Ne uređuje se ručno.
- Beleška (`brand_documents.kind = 'note'`, do 5.000 znakova, najviše 20 po brendu): ručni izvor bez fajla („Dodaj izvor”), ide u bazu znanja istim pozadinskim poslom kao PDF; kratka beleška je jedan odlomak.
- „Brend i nalog” (u meniju umesto „Naplata” i „Podešavanja”): zajedničko zaglavlje sa karticama Glas brenda (`/app/brand`: glas, PDF-ovi, veza ka Brain-u i analizi sajta), Vizuelni identitet (`/app/brand/visual`: boje, logo, fotografije, format, nalog na slajdovima, pregled uživo), Stilovi (`/app/brand/styles`), Pretplata (`/app/billing`) i Nalog (`/app/settings`). Kartice su posebne strane, pa stari linkovi i dalje rade.
- Sopstveni logo na slajdovima (`brands.design.logoAssetId`): slika iz biblioteke tog brenda ima prednost nad logoom sa sajta; „Vrati logo sa sajta” ga briše. Server proverava da je slika iz istog radnog prostora i brenda.

Razlog: zahtev vlasnika (D-108). Playbook u istom pozivu kao uvidi uči iz rezultata bez novog troška, a zajedničko zaglavlje drži podešavanja brenda i naloga na jednom mestu bez selidbe postojećih strana.

## D-114 · 30.10.2026 · usvojeno · Galerija: kategorije, opisi, automatski opis i izbor fotografije za temu

Odluka (faza 7 iz D-108):

- Nova strana „Galerija” (`/app/gallery`, meni Sadržaj): fotografije koje je brend sam dodao (otpremljene i iz Canve; bez slajdova, stoka i AI slika), brojači (ukupno, kategorije, sa opisom, bez opisa), kategorije kao filter (sa „Bez kategorije”), dodavanje više fotografija odjednom u otvorenu kategoriju, opis i kategorija na svakoj kartici i „Sačuvaj izmene” za sve odjednom. Klik otvara veliki pregled.
- Kategorije (`gallery_categories`, migracija 035): do 30 po brendu, naziv jedinstven bez obzira na velika slova. Brisanje kategorije ostavlja fotografije u galeriji, bez kategorije.
- Opis (`media_assets.description`, do 500 znakova) i „Opiši automatski”: Gemini čita umanjenu fotografiju (najviše 768 px) i vraća rečenicu šta se vidi i pojmove na jeziku brenda i na engleskom, jer je upit za vizual iz teksta objave na engleskom. Košta 1 token po fotografiji (nova cena `photo_describe`); do šest u zahtevu, tri istovremeno; slika koja ne uspe ne troši token.
- Izbor fotografije za objavu: reči iz teme, naslova slajdova i upita za vizual porede se sa opisom, kategorijom i tagovima (tačna reč vredi više od istog korena). Među jednako dobrim prednost ima fotografija koja najduže nije korišćena (`media_assets.last_used_at`), pa se iste ne ponavljaju.
- Tok sa izvorom „Moja galerija” može da uzima samo jednu kategoriju (`content_flows.gallery_category_id`); kad je ona prazna, uzima celu galeriju.
- Migracija 035 ponavlja D-079 za tabele iz 031, 033 i 035: strani ključevi sa CASCADE ili SET NULL su DEFERRABLE, inače brisanje naloga pada kad kaskada dva puta dira isti red.

Razlog: zahtev vlasnika (D-108). Fotografije brenda su vrednije od stoka, a opis i kategorija su ono što Sovi treba da ih koristi na pravom mestu.

## D-115 · 30.10.2026 · usvojeno · Početna, kalendar sa pločicama, vodič i podrška, tabla predloga

Odluka (faza 8 iz D-108):

- Početna je prepisana na tri jezika: pozdrav po dobu dana u zoni brenda i stanje (problem sa nalogom ili tokom pali žutu tačku), četiri ključna koraka (mreža, glas brenda, prvi tok, prva odluka o nacrtu) sa preporučenim sledećim, rezultati za 30 dana (pratioci, doseg, angažovanje sa promenom), nacrti koji čekaju odluku sa sličicama, ova nedelja po danima, Brain (zaključak iz playbook-a ili šta nedostaje), tokovi sa sledećim nacrtom, jedan preporučen potez (ponovno povezivanje, odobravanje, sledeći korak, tokeni, Studio), tokeni i Inbox, najjače objave. Traka „Dodaj logo” se vidi dok slajdovi nemaju logo.
- Kalendar je prepisan na tri jezika: mesec ili nedelja, pločice dana sa sličicom prve slike objave, vremenom i statusom, legenda, brojači (danas, zakazano za 14 dana, objavljeno u mesecu, sledeći slobodan dan), sledeća objava, sledećih sedam dana i spisak objava u mesecu. Sličice daje `listCalendar` (potpisani URL-ovi u jednom pozivu po bucket-u).
- „Vodič i podrška”: plutajuće dugme u celoj aplikaciji (osim uvoda) sa sledećim ključnim korakom i brojem urađenih; prozor ima sve korake, uvod, tablu predloga, prijavu problema i email podrške. Koraci su isti kao na početnoj (`getGuide`, `GET /api/guide`).
- Tabla predloga (`/app/ideas`, migracija 036): ideje vide i za njih glasaju svi korisnici (jedan glas po korisniku, bez imena autora), prijavu problema vide samo autor i administratori platforme. Glas uključuje i isključuje jedna `security definer` funkcija (`toggle_feature_vote`, samo za service role), pa je broj tačan i kad dva korisnika kliknu istovremeno. Glas je red sa poljem `active` koji se prebacuje, bez brisanja reda (Supabase MCP odbija migraciju čija funkcija sadrži DELETE). Status (ideja, planirano, u izradi, gotovo, odbijeno) menja samo administrator platforme.
- Meni: „Predlozi i podrška” u grupi Podešavanja.

Razlog: zahtev vlasnika (D-108). Početna i vodič vode novog korisnika do prvog nacrta, a tabla predloga daje korisnicima glas bez dodatnog alata.

## D-116 · 30.10.2026 · usvojeno · Studio kao razgovor

Odluka (faza 9 iz D-108):

- Studio (`/app/studio`) je razgovor sa Sovom: levo poruke, desno objava koju je razgovor napravio ili izmenio, sa istim pregledom i odlukama kao u Odobravanju (opis po mrežama, prvi komentar, termin, sačuvaj i zakaži, objavi odmah, generiši ponovo, preskoči, preuzmi). Dosadašnja forma „Nova objava” i alati (Unsplash, Pexels, Canva, šablon) su na `/app/studio/tools`.
- Svaka poruka je jedan poziv Gemini-ja. Model vidi glas brenda, playbook, odlomke iz baze znanja, poslednjih 12 poruka, objavu otvorenu desno, priložene fotografije i stranicu sa linka iz poruke. Bira jednu radnju: odgovor, nova objava (brif ide u „Novu objavu” sa slajdovima u stilu brenda) ili izmena otvorene objave (opis, prvi komentar, tekst pojedinih slajdova).
- Cena: poruka 1 token (`studio_chat`, menja se u podešavanjima platforme). Poruka koja napravi objavu se ne naplaćuje, plaća se tekst objave (2 tokena), kao u formi. Kad model ne odgovori, poruka se ne upisuje i ne naplaćuje. Objava koja ne uspe ostaje u razgovoru kao neuspela, sa razlogom i bez naplate.
- Slajdovi se menjaju iz razgovora: `posts.design.copy` čuva tekst slajdova i fotografije iz njih, pa izmena crta slajdove ponovo sa istim fotografijama. Važi za objave iz Studija, forme i tokova od ove faze; starijim objavama se menja samo opis.
- Fotografije uz poruku (otpremljene, iz galerije, prevučene ili nalepljene, najviše četiri) model vidi. Idu u slajdove u stilu brenda (tipografski stil bez fotografije tada prelazi na „Poster”) ili u objavu kakve jesu, kad korisnik tako traži. „Generiši ponovo” zadržava fotografije koje je dao korisnik (`posts.design.ownPhotos`).
- Link iz poruke Sova otvara kroz crawler (SSRF zaštita, 8 s, 2 MB) i uzima naslov, opis, cenu proizvoda iz JSON-LD-a i početak teksta. Stranica koja se ne otvori ne obara poruku.
- Temu objave bira korisnik. Sova ne odbija temu koja nije u opisu brenda, ali ne izmišlja činjenice o brendu. Isto pravilo je dodato u upite za tekst i slajdove, gde je tema dobila oznaku „TEMA OBJAVE”: bez nje je model za temu van opisa brenda pisao o uslugama brenda.
- Razgovor se čuva po korisniku i brendu (`studio_messages`, migracija 037), najviše 200 poruka. „Obriši razgovor” briše poruke, a objave ostaju.

Razlog: zahtev vlasnika (D-108). Razgovor skraćuje put od ideje do nacrta, a ispravke se traže rečima umesto kroz formu sa deset polja.

## D-117 · 30.10.2026 · usvojeno · Inbox i DM automatizacija iza prekidača `inbox`

Odluka (faza 10 iz D-108):

- Inbox (`/app/inbox`) ima kartice Poruke, Komentari, Recenzije i Predlozi. Predlozi su dosadašnji „Inbox predloga”, pa stari linkovi rade. Poruke su Instagram i Messenger razgovori kroz stranicu, komentari su sa poslednjih objava Instagram naloga i stranice, a recenzije su preporuke stranice i recenzije Google poslovnog profila.
- Sinhronizacija je pozadinski posao na 10 minuta (`inbox-sync`) i dugme „Osveži Inbox”. Razgovor se prepoznaje po nalogu, vrsti i ID-ju sa mreže, a poruka po ID-ju, pa nema duplikata. Nova dolazna poruka otvara razgovor i označava ga kao nepročitan. Komentar samog naloga (npr. prvi komentar objave) ne ulazi u Inbox. Webhook za sada nije potreban.
- Odgovor ide kroz mrežu: javni odgovor na komentar, poruka u razgovoru (Meta prima poruku samo 24 h posle poslednje poruke osobe, i to se kaže korisniku), komentar na preporuku stranice i odgovor vlasnika na Google recenziju. Sova predlaže odgovor u glasu brenda za 1 token (`inbox_reply`); korisnik ga menja i šalje sam.
- DM automatizacija (`/app/automations`): tok ima nalog (Instagram ili Facebook), do 10 ključnih reči, do tri varijante javnog odgovora, privatnu poruku, link sa tekstom i podsetnik. Ključna reč se poredi bez obzira na velika slova, kvačice i ćirilicu, i mora da stoji kao cela reč. Na nov komentar sa ključnom reči Sova javno odgovori, pošalje privatni odgovor na komentar (`recipient.comment_id`, do 7 dana posle komentara) i link koji broji klik (`/r/{token}`). Jedna osoba dobija poruku od jednog toka najviše jednom, a tok vidi samo komentare nastale posle njega. Podsetnik ide samo osobi koja je odgovorila, a nije kliknula, jer Meta ne dozvoljava drugu poruku bez odgovora. Rezultat (pogoci, poruke, klikovi) se računa iz kontakata, bez brojača koji mogu da se raziđu.
- Prekidač `inbox`: dok Meta ne odobri `pages_manage_engagement`, `pages_messaging` i `instagram_manage_messages` (App Review), Inbox i tokovi su vidljivi, ali isključeni: kartice mreža to objašnjavaju, tok se čuva isključen i ne može da se uključi, a posao ne radi. Prekidač može da se uključi za sve ili samo za radne prostore iz `feature_flags.rollout.workspaces` (vlasnik proba na svom nalogu u razvojnom režimu Meta aplikacije). Dok je uključen, prijava na Metu traži i ove dozvole; sa konfiguracijom prijave (`META_LOGIN_CONFIG_ID`) dozvole se dodaju u Meta podešavanjima.
- Svaka vrsta se čita samo ako nalog ima dozvolu (scope sa mreže), a odgovor samo ako ima dozvolu za slanje. Nalog bez nje dobija poruku da ga treba povezati ponovo.

Razlog: zahtev vlasnika (D-108). Inbox na jednom mestu štedi otvaranje aplikacija, a tok „komentar → poruka sa linkom” je najjednostavnija prodaja sa mreža. Prekidač drži sve spremno do odobrenja Mete, bez polovične funkcije za korisnike.

## D-118 · 30.10.2026 · usvojeno · Video iz karusela u pregledaču, instalacija na telefon i obaveštenja

Odluka (faza 11 iz D-108):

- „Napravi video” u Odobravanju (i u Studiju, isti panel) pravi kratak video od slajdova karusela u pregledaču korisnika: WebCodecs i Mediabunny, H.264 u MP4, 30 fps, bez zvuka, blago uvećanje i pretapanje. Format je uspravan 9:16 (slajd na zamućenoj pozadini iste slike, za Reels, TikTok, Shorts i priče) ili 4:5. Video se otprema u biblioteku i postaje nov nacrt sa istim opisom i nalozima koji primaju video (Google profil ne prima); priča postaje obična video objava. Karusel ostaje. Nacrt iz odobravanja ide u isti red bez novog obaveštenja. Server ne kodira ništa, pa video ne košta tokene; pregledač bez WebCodecs-a dobija poruku da otvori Sovu u Chrome-u, Edge-u ili novijem Safariju.
- Sova se instalira na telefon kao aplikacija (manifest, ikonice, početna strana Odobravanje, prečice Inbox i Studio). Service worker (`/sw.js`) samo prikazuje obaveštenja i otvara pravu stranu na dodir; strane se ne keširaju. Kartica „Odobravajte sa telefona” na početnoj ima dugme za instalaciju gde pregledač to dozvoljava, uputstvo za iPhone i Android i link.
- Obaveštenja na telefonu (Web Push, VAPID): pretplata po uređaju (`push_subscriptions`, migracija 039), kanal `push` u podešavanjima obaveštenja. Na telefon idu samo obaveštenja koja to traže (`pushDefault`): objava čeka odobrenje (i nacrti iz tokova), objava nije uspela, nalog traži ponovno povezivanje, ručno objavljivanje, tok nije uspeo, rok za odobrenje, objava kasni. Pretplata koju servis odbije sa 404 ili 410 se briše.
- Adresa pretplate mora biti servis za obaveštenja pregledača (Google, Mozilla, Apple, Microsoft), jer server na nju šalje zahteve: tako pretplata ne može da natera server da zove unutrašnje adrese.
- Ključevi `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY` su opcioni. Bez njih Sova ne nudi obaveštenja na uređaju, a instalacija i video rade.

Razlog: zahtev vlasnika (D-108). Odluka o nacrtu traje nekoliko sekundi i najčešće se donosi sa telefona; video od gotovih slajdova daje Reels bez novog troška.
