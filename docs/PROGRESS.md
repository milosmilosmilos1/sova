# Sova — napredak

Na početku svake sesije pročitaj ovaj fajl i [DECISIONS.md](DECISIONS.md). Režim rada: više faza zaredom bez potvrde po fazi (D-012).

## Stanje (24.10.2026)

| Faza                                     | Status      | Napomena                                                                                                                     |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1 Plan i arhitektura                     | gotovo      | odobreno 23.10.2026, odgovori u D-013                                                                                        |
| 2 Setup projekta                         | gotovo      | lokalno radi, health zelen, build prolazi, 25 unit testova, CI workflow                                                      |
| 3 Baza i bezbednost                      | gotovo      | 14 migracija, 53 tabele, RLS, RPC za tokene, trigeri, storage, seed; 24/24 testova baze                                      |
| 4 Auth i workspace                       | gotovo      | registracija, prijava, magic link, Google (uz ključeve), reset, MFA, workspace, tim, admin gate; 10 integracionih testova    |
| 5 Token engine i AI jezgro               | gotovo      | tokeni, idempotentnost, Gemini sloj, Studio; pravi pozivi čekaju GEMINI_API_KEY                                              |
| 6 Brand Brain                            | gotovo      | crawler + profil + RAG + nedeljna provera; živi smoke nad tangerineseo.rs prošao; bez ključa radi heuristički                |
| 7 Vizuelni pipeline                      | gotovo      | Unsplash + vision rangiranje, 4 šablona (Satori), Canva Connect (PKCE, dizajn, export); čeka: UNSPLASH_ACCESS_KEY, Canva app |
| 8a–8d Integracije mreža                  | sledeće     | treba: app-ovi i prijave iz INTEGRATIONS 14                                                                                  |
| 9a–9b Objave, kalendar, publisher        | nije počelo |                                                                                                                              |
| 10a–10c Strategija, analitika, Autopilot | nije počelo |                                                                                                                              |
| 11 Edge case-ovi                         | nije počelo |                                                                                                                              |
| 12 Plaćanje                              | nije počelo | Stripe nalog vlasnik pravi; preskače se do tada (D-001)                                                                      |
| 13a–13b Admin                            | nije počelo | gate i placeholder postoje                                                                                                   |
| 14a–14c Dizajn                           | nije počelo | treba: screenshot Dribbble reference ako link ne radi                                                                        |
| 15 Testiranje                            | nije počelo | Playwright + Chromium instalirani; `npm run test:e2e` (5 testova) prolazi                                                    |
| 16 Deploy                                | nije počelo | treba: Vercel, Supabase staging/prod, domen sovaai.rs, Upstash, Inngest, Sentry                                              |

## Faza 4 — šta je urađeno

- **Auth** (`src/lib/auth/actions.ts`, Server Actions): registracija (ime, email, lozinka ≥ 10, uslovi, Turnstile kad je podešen, blokada jednokratnih domena, rate limit 3/h po IP), prijava lozinkom (5 pokušaja / 15 min po IP+email), magic link, Google OAuth (dugme samo uz ključeve), zaboravljena i nova lozinka, ponovno slanje potvrde, odjava. Poruke Supabase-a mapirane na srpski (`messages.ts`). `/auth/callback` menja PKCE kod ili OTP hash za sesiju i vraća na proverenu `next` putanju.
- **Sesija**: `getViewer()` (cookie) i `getViewerFromRequest()` (Bearer ili cookie) vraćaju korisnika, profil, MFA nivo i Supabase klijent sa RLS pravima. `proxy.ts` osvežava sesiju (`getClaims`), štiti `/app` i `/admin`, preusmerava prijavljene sa `/login` i `/register`, šalje `x-pathname`.
- **Workspace i tim**: cookie `sova_ws` i `sova_brand` za trenutni kontekst; servisi `workspaces.ts`, `team.ts`, `brands.ts`, `plans.ts` (limiti plana iz pretplate ili besplatnog plana); pozivnice sa hash tokenom, 7 dana, email preko Resend-a ili DEV log (link se prikazuje adminu u DEV-u); prihvatanje kroz RPC uz proveru emaila; uloge i pristup po brendu; poslednji owner i owner uloga zaštićeni u bazi.
- **API rute**: `/api/workspaces` (GET, POST), `/api/workspaces/[id]` (GET, PATCH, DELETE), `/api/workspaces/[id]/members` (GET, PATCH, DELETE), `/api/invitations` (GET, POST), `/api/invitations/[id]` (DELETE), `/api/invitations/[id]/accept` (POST; `id` je token), `/api/brands` (GET, POST), `/api/brands/[id]` (GET, PATCH, DELETE), `/api/me`, `/api/auth/signout`.
- **Stranice**: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/invite/[token]`; `/app` (početna sa tokenima, brendovima, planom), `/app/onboarding` (tip naloga, radni prostor, brend, sajt), `/app/team` (članovi, uloge, uklanjanje, pozivnice), `/app/settings` (profil, radni prostor, brendovi), `/app/settings/security` (TOTP: uključivanje, potvrda koda, isključivanje); `/admin` (gate: platform_admin + MFA u sesiji, inače 404 ili preusmerenje na bezbednost).
- **E2E** (`npm run test:e2e`, Playwright, 5 testova prolazi): zaštita `/app` i `/admin` bez sesije, registracija → Mailpit link → onboarding, kreiranje radnog prostora (50 tokena, 1 brend), tim (limit plana), podešavanja, 404 za `/admin` običnom korisniku, odjava. Otkrio i ispravio: RSC petlju u layoutu (D-026), CSP nonce za next-themes, status 200 umesto 404 za admin (D-025), `nativeButton={false}` za Base UI dugmad koja renderuju linkove.
- **Testovi**: 10 integracionih (`npm run test:integration`): 401 bez sesije, 400 sa poljima, srećan put, tuđ workspace 404, pogrešan Origin 403, limit brendova i članova (PLAN_LIMIT), pozivnica → prihvatanje → vidljivost, pogrešan email 403, editor ne menja uloge, owner menja.
- Lokalni Supabase: `enable_confirmations = true`, `minimum_password_length = 10`, MFA TOTP uključen, Google provider sa env ključevima, `email_sent` limit podignut na 100/h za testiranje.

## Faza 5 — šta je urađeno

- **Token engine** (`src/lib/tokens/`): cene akcija i modela iz `platform_settings` sa 60 s kešom i podrazumevanim vrednostima; omotači oko RPC-a `reserve_tokens` → `confirm_reservation` / `release_reservation`; stanje kroz `workspace_token_totals`. `reserve_tokens` sada ima opcione parametre (brend, korisnik, posao) radi tipova.
- **Idempotentnost** (`src/lib/idempotency.ts`, D-028) i `Idempotency-Key` header obavezan na AI rutama.
- **Gemini sloj** (`src/lib/ai/`): `gemini.ts` (tekst sa JSON šemom i slikama, slike sa `responseModalities: IMAGE`, embeddings), `retry.ts` (3 pokušaja, oko 1/3/9 s, jitter), `breaker.ts` (više od 50 % grešaka od bar 4 poziva u 2 min → 5 min pauze; Redis ili memorija), `orchestrator.ts` (lanac modela: primarni → fallback; safety blokada i 400 se ne ponavljaju i ne idu na fallback; 404 modela loguje alarm i prelazi dalje), `cost.ts` (USD po cenovniku), `errors.ts` (klasifikacija i poruke na srpskom), `prompts/post-text.ts` (sistemski prompt, limiti mreža, delimiteri, Zod šema izlaza).
- **Servisi**: `services/ai/text.ts` (tekst za objavu, sa fotografijom ili bez; validacija dužine po mreži iz `config/platforms.ts`), `services/ai/image.ts` (zahtev → 202; `runImageGeneration` kao idempotentan posao), `services/ai/generations.ts` (upis u `ai_generations`, dnevni limit besplatnog plana, status posla sa potpisanim URL-om), `services/media.ts` (upload: magic bytes, EXIF uklonjen, resize 4096, sRGB, dedup po SHA-256; čuvanje generisanih slika).
- **Inngest**: funkcija `ai-generate-image` (concurrency 2 po workspace-u, idempotentna); `src/lib/jobs/enqueue.ts` daje jasnu poruku kad dev server nije pokrenut.
- **API rute**: `POST /api/ai/text`, `POST /api/ai/image/from-prompt`, `POST /api/ai/image/from-photo`, `GET /api/ai/jobs/[id]`, `POST /api/media/upload`, `GET /api/media/[id]/url`, `GET /api/tokens/balance`.
- **Studio** (`/app/studio`): tri kartice (tekst, slika iz fotografije, slika iz prompta), stanje tokena i cene, upload fotografije, prikaz varijanti sa proverom dužine, polling statusa posla, 4 stanja.
- **Testovi**: 18 novih unit testova (retry, breaker, cena, limiti mreža, prompt i šema); 10 integracionih sa MSW mockom Gemini-ja: 400 bez ključa idempotentnosti, srećan put (50 → 48 tokena, trošak upisan, sistemska instrukcija i JSON šema poslate), ponovljen ključ bez nove naplate i 409 za drugo telo, 503 pa uspeh (retry), safety blokada (422, tokeni vraćeni), 404 modela → fallback, 402 bez poziva modela, upload (odbija ne-sliku, prima PNG), slika iz prompta (202 → posao → 8 tokena → potpisan URL, ponovno pokretanje preskočeno), slika iz fotografije (šalje sliku modelu, premium model, neuspeh vraća 15 tokena).

## Faza 6 — šta je urađeno

- **SSRF zaštita** (`src/lib/ssrf.ts`): samo http/https, normalizacija URL-a (bez tracking parametara), statičke provere imena, DNS provera svake adrese (IPv4 i IPv6, mapirane i NAT64 adrese, metadata opsezi), ručno praćenje najviše 5 preusmerenja uz proveru svakog hopa, timeout, gornja granica veličine, User-Agent `SovaBot/1.0 (+BOT_INFO_URL)`. Javna strana `/bot` objašnjava bota i kako se zabranjuje.
- **Crawler** (`src/lib/crawler/`): `robots.ts` (robots-parser, Crawl-delay, Sitemap linije), `discover.ts` (sitemap i sitemap index, RSS/Atom, linkovi sa početne; dedup, prioritet po tipu, blog najviše trećina limita, hash liste za nedeljnu proveru), `classify.ts` (tip strane po putanji na srpskom i engleskom), `extract.ts` (cheerio: naslov, meta, OG, JSON-LD, naslovi, glavni tekst bez navigacije i futera, slike, kandidati za logo po skoru, interni linkovi, društvene mreže bez share linkova, feed i CSS linkovi, SPA detekcija, charset), `colors.ts` (CSS varijable i važni selektori teže, ΔE spajanje, WCAG kontrast, monohrom), `fonts.ts` (Google Fonts, @font-face, body i naslovi, mapiranje komercijalnih fontova), `logo.ts` (SVG sanitizacija, ico/webp/png kroz sharp), `chunk.ts` (3.000 karaktera, preklop 300), `fetch-page.ts` (Cloudflare challenge, greške kao podaci). `deps.ts` daje zamenu fetch-a i DNS-a za testove.
- **Profil brenda** (`src/lib/brand/`): Zod šema sa `{value, confidence, source_urls}` po polju (identitet, ponuda, publika, glas, činjenice, kontakt, mreže, vizuali, sadržaj, meta), `heuristic.ts` (profil bez AI-ja iz JSON-LD, meta, naslova, kontakt regexa, detekcija pisma i obraćanja), `compose.ts` (heuristika + AI + zaključana polja iz prethodne verzije; `toBrandContext` za promptove). Promptovi `prompts/brand-profile.ts` (korpus do 120k karaktera, izlaz bez null vrednosti radi stabilnog JSON-a) i `prompts/photo-style.ts` (vision nad 3–8 fotografija).
- **Pipeline** (`src/services/brand-brain/pipeline.ts`, Inngest `brand-analyze`): prepare → discover → fetch po 10 (3 paralelno, Crawl-delay) → visual (logo u `brand-assets`, paleta iz CSS-a i logoa kroz node-vibrant, fontovi) → photo-style → profile (nova verzija, `locked_fields` poštovani) → embed (`knowledge_chunks`, nepromenjeni chunkovi se ne šalju ponovo) → finish (status `succeeded` ili `partial`, naplata samo kad je AI radio, notifikacija). Deterministične greške (robots, 404, SPA, challenge) su podaci, ne izuzeci; `cancelOn` i `onFailure` vraćaju tokene.
- **Servisi**: `crawl.ts` (zahtev, jedan aktivan po brendu, prva analiza besplatna pa 10 tokena, otkazivanje), `profile.ts` (verzije, ručne izmene koje zaključavaju polja, otključavanje, vraćanje starije verzije), `embed.ts` (indeksiranje i semantička pretraga kroz RPC `match_knowledge_chunks`), `site-check.ts` (nedeljna provera sitemap/RSS → predlozi `new_blog_post` i `profile_update`, bez dupliranja). `text.ts` sada puni kontekst iz profila i dodaje do 5 RAG odlomaka u prompt.
- **API rute**: `POST|GET /api/brands/[id]/analyze`, `GET|DELETE /api/brands/[id]/analysis/[crawlId]`, `GET|PATCH /api/brands/[id]/profile`, `POST .../profile/restore`, `POST .../profile/unlock`.
- **Stranica** `/app/brand`: pokretanje i otkazivanje analize sa napretkom (polling 2 s), profil po sekcijama sa pouzdanošću, izvorima i katancem, ručne izmene ključnih polja, verzije sa vraćanjem, 4 stanja.
- **Baza**: migracija 15 (`match_knowledge_chunks`, `next_brand_profile_version`, `brand_knowledge_count`, jedinstven indeks jedne aktivne analize po brendu).
- **Testovi**: 43 nova unit testa (SSRF, crawler, boje, fontovi, chunkovi, SVG, heuristika, spajanje, prompt), 9 integracionih sa lažnim sajtom kroz MSW i DNS stubom (prva analiza besplatna i ceo pipeline sa logoom, bojama, fontovima, stilom fotografija, znanjem; 409 za drugu analizu u toku; ručna izmena i 400 za sistemsko polje; druga analiza 10 tokena uz zaključana polja; vraćanje verzije; otkazivanje vraća tokene; robots blokada → failed; bez ključa heuristički i besplatno; nedeljna provera pravi predlog bez dupliranja). Živi smoke `npx tsx scripts/crawl-smoke.ts https://tangerineseo.rs`: 25 strana za 15 s, logo, paleta, kontakt, mreže, blog.
- Ispravljen bag iz faze 5: `embedTexts` je niz stringova slao kao jedan sadržaj sa više delova (SDK spaja stringove), pa bi embeddingi u produkciji pali; sad svaki tekst ide kao poseban `Content`.

## Faza 7 — šta je urađeno

- **Unsplash** (`src/integrations/unsplash/client.ts`): pretraga sa `content_filter=high`, keš 1 h (Redis ili memorija), 403 sa potrošenim limitom → 429 korisniku, `download_location` se poziva pri svakoj stvarnoj upotrebi, atribucija sa `utm_source=sova`, hotlink URL-ovi zadržavaju `ixid`. Servis `services/visuals/unsplash.ts`: pretraga za UI (pregledi 600 px, sličice 200 px), izbor fotografije → kopija u `uploads` + `media_assets` (`source: unsplash`, atribucija i izvorni podaci), ponovni izbor koristi postojeću; `rankCandidates` (Gemini vision nad do 8 sličica, bez ključa redosled Unsplash-a), `pickPhotoForTemplate`.
- **Šabloni** (`src/lib/visuals/`): `templates.ts` (4 šablona kao Satori stablo: fotografija sa naslovom, boja brenda i poruka, fotografija pored teksta, najava sa okvirom; 5 formata; automatski izbor; veličina naslova po dužini; kontrast teksta), `fonts.ts` (Google Font brenda kao WOFF kroz CSS v1 API sa UA starog Chrome-a, provera magic bajtova, keš; ugrađen Inter podskup latinica + latin-ext + ćirilica, OFL, 2 × 35 KB), `render.ts` (Satori → resvg → sharp; slike i logo kao data URI, logo SVG se rasterizuje).
- **Posao** `visual_template` (`services/visuals/template.ts`, Inngest `ai-visual-template`): 2 tokena, 202; slika sa Unsplash-a (zadata ili pretraga po pojmu ili naslovu + rangiranje), iz biblioteke ili bez slike; boje, fontovi, logo i stil fotografija iz Brand Brain profila; rezultat u `generated` (`source: template`) sa atribucijom i spiskom kandidata. Rangiranje koje padne ne ruši posao (napomena u izlazu).
- **Canva Connect** (`src/integrations/canva/client.ts`, `services/canva/*`): OAuth Authorization Code + PKCE S256, token endpoint form-urlencoded sa Basic auth, refresh token rotira; tokeni AES-256-GCM (`src/lib/crypto/tokens.ts`, verzija ključa, AAD po vezi) u `canva_connections`, state i PKCE verifier u `oauth_states`; `GET /users/me`, proba Autofill-a (`/brand-templates` 403 → nema); dizajn od slike (`/asset-uploads` + polling → `/designs` → `edit_url`), export (`/exports` + polling → fajl u biblioteku, `source: canva`); osvežavanje tokena 2 min pre isteka, `invalid_grant` → `needs_reauth`. Iza feature flaga `canva` i env ključeva.
- **Gemini slike** sada u prompt dodaju stil fotografija i boje brenda iz profila (`services/ai/image.ts`).
- **API rute**: `GET /api/unsplash/search`, `POST /api/unsplash/select`, `POST /api/ai/visual/template`, `GET /api/integrations/canva/connect`, `GET /api/integrations/canva/callback`, `GET /api/canva/status`, `DELETE /api/canva/connection`, `POST /api/canva/designs`, `POST /api/canva/export`.
- **UI**: Studio kartica „Vizual iz šablona” (naslov, podnaslov, CTA, format, šablon, izvor slike: Unsplash pretraga sa izborom, moja fotografija, bez slike; polling posla; atribucija), dugmad „Doradi u Canvi” i „Uvezi gotov dizajn” uz rezultate; kartica Canva u podešavanjima (status, poveži, prekini).
- **Testovi**: 8 unit (šifrovanje tokena, šabloni, render 4 šablona u 540 px sa ćirilicom, PNG, fallback fontova); 9 integracionih sa MSW mockom Unsplash API-ja, Unsplash CDN-a i Canva API-ja (pretraga + keš + 429 + 400, izbor sa beleženjem preuzimanja i ponovnom upotrebom, šablon sa Unsplash-om i rangiranjem → 2 tokena i atribucija, šablon bez slike i sa otpremljenom fotografijom, rangiranje koje pada ne ruši posao, 400 bez Idempotency-Key i refund za nepostojeću fotografiju, Canva connect → PKCE state, callback → šifrovani tokeni i status, dizajn + export po 2 tokena, osvežavanje tokena i `needs_reauth` posle opoziva, prekid veze). Vizuelna provera: 4 šablona renderovana na 1080 px sa pravim Google fontovima.
- Napomena: Unsplash i Canva nemaju ključeve lokalno, pa pravi pozivi nisu provereni; MSW mock prati zvaničnu dokumentaciju pročitanu 24.10.2026 (INTEGRATIONS 11 i 12).

## Kako da testiraš (faza 7)

1. Bez ključeva: `/app/studio` → „Vizual iz šablona” → naslov, „Bez slike” ili „Moja fotografija” → vizual sa bojama, fontovima i logoom iz Brand Brain profila (posle analize sajta). Unsplash izvor javlja da nije podešen.
2. Sa `UNSPLASH_ACCESS_KEY` (demo aplikacija, 50 zahteva/h): Unsplash pretraga u kartici, izbor sličice ili prazno → Sova pretražuje po naslovu, AI rangira (uz Gemini ključ) i render traje 3–8 s.
3. Canva: u Developer portalu napravi integraciju (scope-ovi iz INTEGRATIONS 11, redirect `http://localhost:3001/api/integrations/canva/callback`), unesi `CANVA_CLIENT_ID/SECRET`, uključi flag `canva` u `feature_flags` → Podešavanja → „Poveži Canvu” → posle vizuala „Doradi u Canvi” otvara Canvu, „Uvezi gotov dizajn” vraća PNG u biblioteku.
4. `npm run test` (94), `npm run test:integration` (38), `npm run test:db` (24), `npm run test:e2e` (5).

## Kako da testiraš (faza 6)

1. `npm run db:start` (migracija 15 je primenjena sa `npx supabase migration up`; posle `db:reset` ide sama), `npm run dev`, `npm run inngest:dev`.
2. `/app/brand` → unesi `tangerineseo.rs` → „Analiziraj sajt”: traka napretka prolazi faze (čitam sajt, tražim stranice, preuzimam 1/25…, logo i boje, fotografije, profil, pamtim sadržaj). Bez `GEMINI_API_KEY` završava kao „Gotovo, uz napomene” sa heurističkim profilom i 0 tokena; sa ključem profil je AI i piše model.
3. Profil: naziv, slogan, opis, usluge, cene sa sajta, kontakt, mreže, logo, paleta, fontovi; verzija 1. „Izmeni ključna polja” → sačuvaj → verzija 2, polja sa katancem. „Analiziraj ponovo” → 10 tokena manje, zaključana polja netaknuta. „Vrati ovu verziju” → nova verzija sa starim sadržajem.
4. `/app/studio` tekst: prompt sada nosi ton, činjenice, usluge i (sa ključem) odlomke sa sajta.
5. Lažni sajt bez baze: `npx tsx scripts/crawl-smoke.ts https://tangerineseo.rs 25`.
6. `npm run test` (86), `npm run test:integration` (29), `npm run test:db` (24), `npm run test:e2e` (5).

## Kako da testiraš (faza 5)

1. Unesi `GEMINI_API_KEY` u `.env.local` (nov ključ iz Google AI Studio), restartuj `npm run dev`; `/api/health` → `gemini: ok` sa nazivom modela.
2. `npm run inngest:dev` u drugom terminalu (bez njega slike javljaju da pozadinski servis nije pokrenut).
3. `/app/studio`: tekst za Instagram i Facebook → varijante sa brojem karaktera; stanje tokena pada za 2.
4. Slika iz prompta → za 10–30 s slika i „AI generisano”; stanje pada za 8. Premium kvalitet troši 15.
5. Slika iz fotografije → otpremi JPG/PNG, upiši uputstvo → rezultat.
6. `npm run test`, `npm run test:integration` (MSW, bez pravog poziva), `npm run test:db`, `npm run test:e2e`.

## Kako da testiraš (faza 4)

1. `npm run db:start`, `npm run dev` → http://localhost:3001/register: napravi nalog (lozinka ≥ 10 karaktera, štikliraj uslove).
2. Otvori Mailpit http://127.0.0.1:54324 → klikni link za potvrdu → stižeš na `/app/onboarding`.
3. Napravi radni prostor (tip, naziv, sajt) → `/app` prikazuje 50 tokena, 1 brend, plan Besplatno.
4. `/app/team`: pozovi email (u DEV-u link pozivnice piše u poruci forme); otvori link u drugom pregledaču, registruj se tim emailom, prihvati → član vidi radni prostor sa ulogom.
5. `/app/settings`: promeni ime i jezik; pokušaj da dodaš drugi brend → poruka o limitu plana.
6. `/app/settings/security`: uključi TOTP (QR + kod); tvoj email je u admin allowlist-i, pa posle potvrde koda `/admin` otvara pregled. Bez MFA `/admin` vraća na bezbednost; drugom korisniku `/admin` daje 404.
7. Odjava → `/app` preusmerava na `/login?next=/app`.

## Šta čeka vlasnika

- Google OAuth klijent (`GOOGLE_CLIENT_ID/SECRET`) da se pojavi Google dugme; Resend ključ da pozivnice i obaveštenja idu emailom; Turnstile ključevi za zaštitu registracije u produkciji.
- `GEMINI_API_KEY` u `.env.local` (jedino što fali da AI Studio i AI profil brenda rade sa pravim modelom; prvi pravi poziv Brand Brain-a nad tangerineseo.rs proveriti zajedno, posebno `responseJsonSchema` sa većom šemom).
- Ćirilični i SPA sajt za ivične slučajeve B4 i B10 (predlog: jedan sajt na ćirilici koji poznaješ).
- `UNSPLASH_ACCESS_KEY` (developer aplikacija „sova”, demo plan) i Canva integracija (`CANVA_CLIENT_ID/SECRET`, redirect URL za localhost i sovaai.rs) da se faza 7 proveri uživo; tekst Unsplash production prijave stiže uz dizajn.
- Adresa sedišta TangerineSEO LLC i merodavno pravo; email za privatnost na domenu sovaai.rs.
- GitHub → Settings → Code security: uključiti secret scanning.

## Poznati bagovi

- Nema poznatih. Ispravljeno u fazi 5: onboarding tipa „Jedan biznis” je padao na validaciji jer je prazno skriveno polje `brandName` stizalo kao prazan string (sad `parseForm` prazna polja tretira kao neuneta).

## Tehnički dug

- Tekstovi stranica faze 4 su na srpskom u kodu; selidba u next-intl poruke ide uz dizajn (faza 14) kad se ekrani finalizuju.
- Prenos vlasništva radnog prostora i brisanje naloga iz aplikacije (izvoz, kaskada, opoziv tokena mreža) stižu uz GDPR deo (faza 11) i integracije (faza 8).
- Sentry `withSentryConfig` samo sa `SENTRY_DSN`; upload source mapa tek sa `SENTRY_AUTH_TOKEN`.
- CI pokreće samo unit testove; testovi baze i integracioni zahtevaju Supabase u CI-ju (faza 15).
- `complete_upload` RPC iz plana zamenjen serverskim uploadom (`POST /api/media/upload`); HEIC konverzija (WASM dekoder) i video upload idu u fazu 7.
- Studio status posla kroz polling; Realtime pretplata uz dizajn (D-029).
- Brand kontekst bez profila i dalje pada na `brands.settings`; posle prve analize koristi profil i RAG.
- Firecrawl (SPA i Cloudflare sajtovi) nije ugrađen: takvi sajtovi dobijaju jasnu poruku i ručni unos (D-035). Realtime napredak analize ide kroz polling do faze 14 (tabela `website_crawls` je u publikaciji).
- Nedeljna provera pravi predloge, ali ih UI još ne prikazuje (inbox predloga stiže u fazi 10); notifikacije o završenoj analizi se upisuju u `notifications` bez UI-ja.
- AI7 (odgovor na pogrešnom pismu) i AI9 (sličan tekst u 90 dana) ostaju za fazu 9a kad postoje objave.
