# Sova — napredak

Na početku svake sesije pročitaj ovaj fajl i [DECISIONS.md](DECISIONS.md). Režim rada: više faza zaredom bez potvrde po fazi (D-012).

## Stanje (25.10.2026)

| Faza                                    | Status          | Napomena                                                                                                                                                                                                                 |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Plan i arhitektura                    | gotovo          | odobreno 23.10.2026, odgovori u D-013                                                                                                                                                                                    |
| 2 Setup projekta                        | gotovo          | lokalno radi, health zelen, build prolazi, 25 unit testova, CI workflow                                                                                                                                                  |
| 3 Baza i bezbednost                     | gotovo          | 14 migracija, 53 tabele, RLS, RPC za tokene, trigeri, storage, seed; 24/24 testova baze                                                                                                                                  |
| 4 Auth i workspace                      | gotovo          | registracija, prijava, magic link, Google (uz ključeve), reset, MFA, workspace, tim, admin gate; 10 integracionih testova                                                                                                |
| 5 Token engine i AI jezgro              | gotovo          | tokeni, idempotentnost, Gemini sloj, Studio; Gemini ključ proveren 24.10.2026 (tekst, slika, embedding; D-088)                                                                                                           |
| 6 Brand Brain                           | gotovo          | crawler + profil + RAG + nedeljna provera; živi smoke nad tangerineseo.rs prošao; bez ključa radi heuristički                                                                                                            |
| 7 Vizuelni pipeline                     | gotovo          | Unsplash + vision rangiranje, 4 šablona (Satori), Canva Connect (PKCE, dizajn, export); čeka: UNSPLASH_ACCESS_KEY, Canva app                                                                                             |
| 8a Facebook + Instagram                 | gotovo          | OAuth, izbor naloga, tokeni, uvoz istorije, osvežavanje, webhook-ovi, provider za objave, Reels i video (D-089); čeka: Meta app i App Review                                                                             |
| 8b LinkedIn i TikTok                    | gotovo          | LinkedIn profil i stranice, video i prvi komentar (D-087), TikTok foto (video spreman u provideru), panel u editoru, osvežavanje tokena; čeka: app-ovi i odobrenja (INTEGRATIONS 14)                                     |
| 8c–8d Ostale mreže                      | gotovo          | direktno otpremanje i video (D-082), zajednički tok (D-083), Google poslovni profil i YouTube Shorts (D-084), Pinterest (D-085), X (D-086); čeka: app-ovi, ključevi i odobrenja iz INTEGRATIONS 14                       |
| 9a Objave, odobravanje, kalendar        | gotovo          | state machine, composer backend, verzije, javni link, komentari, kalendar, red objava; UI /app/posts, /app/calendar, /approve                                                                                            |
| 9b Publisher                            | gotovo          | Inngest publish-target (sleepUntil, cancelOn, 3 pokušaja 1/5/15 min, IG polling), watchdog, rollup statusa, asistirano objavljivanje, retry, obaveštenja sa podešavanjima, K3                                            |
| 10a Strategija i kalendar iz strategije | gotovo          | AI strategija (20 tokena, Inngest), vremena iz istorije ili pretpostavke, verzije, stubovi i kampanje, kalendar nacrta bez tokena, UI /app/strategy                                                                      |
| 10b Metrike i analitika                 | gotovo          | post-metrics (+1h/+24h/+7d/+30d), dnevne metrike naloga, pregled sa poređenjem, AI uvidi nedeljno + predlozi, UI /app/analytics                                                                                          |
| 10c Autopilot i Inbox predloga          | gotovo          | nivoi 0–3, nedeljni nacrti iz strategije sa QA i budžetom, rokovi, mesečna strategija, okidači, Pauziraj sve, Inbox, UTM                                                                                                 |
| 11a GDPR i nalog                        | gotovo          | izvoz podataka, brisanje naloga uz ponovnu potvrdu identiteta, prenos vlasništva, odjava u svim tabovima                                                                                                                 |
| 11b Ostali ivični slučajevi             | gotovo          | nacrt editora, siročići uploada, brisanje medija u upotrebi, promena zone brenda, dupli tekst, GIF, letnje/zimsko vreme; ispravljeno meko brisanje brenda i prostora; plaćanje (T4–T13, K6) čeka fazu 12                 |
| 12 Plaćanje                             | gotovo          | Stripe Checkout, Portal, webhook i tokeni kroz mock (D-090); čeka: Stripe nalog, cene, webhook endpoint, Portal i poreski model                                                                                          |
| 13a–13b Admin                           | gotovo          | pregled, korisnici i radnje, monitor objava, AI troškovi i marža, platforma (flagovi, cene, modeli, održavanje), audit sa CSV-om, impersonacija (D-070, D-075)                                                           |
| 14a–14c Dizajn                          | gotovo          | plava tema i tamne javne strane, nov landing, okvir aplikacije i početna (D-091), grafikoni (D-092), stub i kampanja u editoru, sečenje i zamena medija (D-093), mesečni PDF izveštaj (D-094), SEO javnih strana (D-095) |
| 15 Testiranje                           | gotovo          | E2E glavnih tokova (13), pristupačnost kroz axe u svetloj i tamnoj temi, E2E posao u CI-ju sa Supabase-om, Mailpit-om i Inngest dev serverom (D-096)                                                                     |
| 16 Deploy                               | priprema gotova | vodič DEPLOY.md, workflow za migracije uz odobrenje, maxDuration, produkcijski build proveren (D-097); sam deploy čeka naloge i dozvolu vlasnika                                                                         |
| Landing po Claude Design-u              | gotovo          | novi landing, zaglavlje i podnožje javnih strana, kalkulator tokena iz baze, strana Kontakt (D-098); fotografije su primeri sa Unsplash-a                                                                                |
| Cene u evrima                           | gotovo          | mesečni 47 €, godišnji 277 €, dopune 12/30/85 €, paketi 5 brendova, 10 mreža i 2 člana; admin preračunava u USD po kursu; favicon (D-099)                                                                                |
| Deploy na Netlify                       | u toku          | sovaai.netlify.app radi od 29.10.2026 u režimu pregleda (D-101): baza (Supabase, Frankfurt), 26 migracija i seed; nalog vlasnika i interni plan „Vlasnik” (D-102); ključevi servisa kasnije (DEPLOY.md 10, D-100)        |

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

## Faza 8a — šta je urađeno

- **Ugovor za mreže** (`src/integrations/social/types.ts`, `errors.ts`): `SocialProvider` interfejs iz INTEGRATIONS 1 (auth URL, razmena koda, lista naloga, validacija, objava, status, idempotentna provera, brisanje, istorija, metrike objave i naloga, opoziv, mogućnosti), `ProviderError` sa kodovima `TOKEN_INVALID`, `PERMISSION_LOST`, `RATE_LIMITED`, `MEDIA_REJECTED`, `CONTENT_REJECTED`, `DUPLICATE`, `QUOTA_EXCEEDED`, `ACCOUNT_RESTRICTED`, `PROVIDER_DOWN` i porukama na srpskom; `providerToApiError` za rute. `registry.ts` bira provider po mreži (`meta` za Facebook i Instagram).
- **Meta provider** (`src/integrations/social/meta/`): Graph klijent sa verzijom iz env-a (`META_GRAPH_VERSION`, v26.0) i mapiranjem Graph kodova (190/102 token, 10/200+ dozvole, 4/17/32/613 limit, 368 ograničenje, 506 duplikat, 9004/36xxx/2207xxx mediji, 1/2/5xx privremeno); Facebook Login dialog (scope lista ili `META_LOGIN_CONFIG_ID` za Login for Business), kod → kratkotrajan → dugotrajan korisnički token (60 dana) → `/me/accounts` sa Page tokenima bez isteka i povezanim Instagram nalozima; objava na stranicu (tekst + link, jedna slika, više slika kroz `attached_media`, prvi komentar) i Instagram (kontejner → provera `status_code` → `media_publish` → permalink, karusel do 20, `alt_text`, `is_ai_generated`, `IN_PROGRESS` vraća ručku za kasniji poll); istorija (posts / media), metrike objave i naloga (insights uz fallback na osnovna polja), `findExistingPost` po tekstu u poslednja 2 h, brisanje, opoziv dozvola; `signed-request.ts` za callback-ove.
- **Servisi** (`src/services/social/`): `accounts.ts` (početak OAuth-a sa state-om u `oauth_states`, callback → nalozi upisani kao „na čekanju” sa tokenima AES-256-GCM, korisnik bira naloge → aktivni + uvoz istorije, ostali se brišu; lista kroz `social_accounts_public`; sinhronizacija; prekid veze sa opozivom; `assisted_only` kad je flag mreže isključen), `history.ts` (do 100 objava u `historical_posts`, idempotentno), `refresh.ts` (dnevno produženje korisničkog tokena i Page tokena, `needs_reauth` pri opozivu), `webhooks.ts` (deauthorize → `revoked`; data deletion → `account_deletion_requests` + odgovor `{url, confirmation_code}`).
- **Inngest**: `social-history-import` (po nalogu), cron `social-token-refresh` (03:00 UTC).
- **API rute**: `GET /api/integrations/[provider]/connect` (facebook | instagram | meta), `GET .../callback`, `GET /api/social-accounts`, `POST /api/social-accounts/activate`, `DELETE /api/social-accounts/[id]`, `POST .../sync`, `GET .../history`, `POST /api/webhooks/meta`, `POST /api/webhooks/meta/data-deletion`.
- **Stranica** `/app/accounts` („Mreže”): povezivanje, izbor naloga posle povratka sa Facebook-a, statusi (aktivno, treba ponovo povezati, isključeno, opozvano, asistirano), sinhronizacija, istorija objava, prekid veze.
- **Env**: `META_GRAPH_VERSION` (default v26.0), `META_LOGIN_CONFIG_ID` (opciono). Feature flagovi `platform.facebook` i `platform.instagram` upravljaju povezivanjem i `assisted_only` oznakom.
- **Testovi**: 2 unit (signed_request, mapiranje Graph grešaka) i 8 integracionih sa MSW mockom Graph API-ja (connect → 302 sa scope-ovima i state-om, 404 za nepodržanu mrežu; callback → razmena koda, dugotrajan token, 3 naloga na čekanju, ponovljen state 400; izbor aktivira 2 i briše 1, IG asistiran kad je flag isključen, uvoz zakazan, ponovni izbor 404; uvoz istorije idempotentan, sinhronizacija nevidljivog naloga → `disabled`; provider objavljuje tekst/sliku/karusel na stranicu i kontejner na Instagram sa permalinkom, pending ručka i kasniji publish, odbijen medij, validacija, metrike objave i naloga, brisanje; osvežavanje tokena obnavlja Page token i `needs_reauth` posle isteka; webhook-ovi sa potpisom; prekid veze briše istoriju). Publisher koji ove metode poziva po rasporedu stiže u 9b.
- Napomena: Meta app, test stranica i App Review još ne postoje (INTEGRATIONS 14), pa pravi Graph pozivi nisu provereni; mock prati dokumentaciju pročitanu 24.10.2026 (v26.0, token exchange, content publishing, data deletion).

## Pregled uživo (lokalno)

- Aplikacija: http://localhost:3001 (posle `npm run dev`); pozadinski poslovi traže `npm run inngest:dev` (http://localhost:8288).
- `npm run demo:seed` pravi demo nalog sa primerima podataka i ispisuje email i lozinku; detalji u RUNBOOK 1.
- Lokalni mejlovi idu u Mailpit: http://localhost:54324.
- Admin panel: isti `npm run demo:seed` pravi i `admin@sova.local` sa uključenim TOTP-om i ispisuje lozinku i TOTP tajnu. Posle prijave: Podešavanja → Bezbednost → kod iz aplikacije za kodove (ili `npm run demo:totp -- <tajna>`), pa http://localhost:3001/admin.
- Provereno 24.10.2026 u Chromium-u: početna, Inbox, Objave, detalj objave, Kalendar, Strategija, Analitika, Autopilot, Obaveštenja, Mreže i Podešavanja rade bez grešaka u konzoli i API odgovorima. Usput ispravljeno: legenda kalendara je prikazivala interne nazive statusa, horizonti snimaka u analitici nisu bili poređani, editor nije prikazivao zašto je Autopilot vratio nacrt (sada prikazuje, a izveštaj se briše čim se tekst promeni).
- Provereno 24.10.2026 u Chromium-u (faza 11b): nacrt editora (čuvanje, traka posle osvežavanja, vraćanje, brisanje posle čuvanja), termin se vraća isti posle čuvanja, forma zone brenda sa ponudom zadržavanja lokalnog vremena; bez grešaka u konzoli.
- Provereno 24.10.2026 u Chromium-u (faza 13): svih sedam admin strana, „Gledaj kao” za demo nalog (traka, izmena u read-only režimu dobija 403 sa objašnjenjem, „Izađi” vraća na detalj korisnika), `/admin/users` na 390 px bez horizontalnog skrola. Usput ispravljeno: stara provera u `requireMembership` je tokom read-only pregleda rušila svaku stranu aplikacije.

## Deploy na Netlify — šta je urađeno

- **Baza**: postojeći prazan Supabase projekat (Frankfurt). 25 migracija i seed pušteni kroz Supabase konektor, istorija nosi verzije iz repoa, šema proverena otiskom i ista je kao lokalna (D-100).
- **Migracija 025**: neprijavljen korisnik više ne može da pozove pomoćne SECURITY DEFINER funkcije; nov test baze (31).
- **Netlify**: sajt `sovaai`, `netlify.toml`, javne promenljive upisane; tajne aplikacije u lokalnom `.env.netlify.local` za uvoz.
- **Režim pregleda** (D-101): `SOVA_PREVIEW=true` pušta produkciju bez ključeva servisa; CAPTCHA, emailovi, AI i pozadinski poslovi čekaju svoje ključeve, a prijavljen korisnik vidi napomenu.
- **Sajt radi** (29.10.2026): Supabase ključ i tri tajne su u Netlify-ju, `/` i `/login` vraćaju 200, baza odgovara. Nalog vlasnika (`platform_admin`) napravljen je u Supabase-u sa lozinkom.
- **Interni plan „Vlasnik”** (D-102): plan u seed-u i produkcijskoj bazi, migracija 026 (admin statistika ga ne broji kao prihod), nov test baze (32). Dodela radnom prostoru je u RUNBOOK 8.
- **`/api/health`** javno vraća samo status; detalje vidi admin sa TOTP-om (D-102).
- **Ključevi u Netlify-ju** (29.10.2026): tri tajne aplikacije (`IMPERSONATION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`) su bile uvezene bez oznake tajne, pa su pri proveri promenljivih pročitane u razgovoru. Nove su generisane lokalno u `.env.netlify-kljucevi.local`, zajedno sa `GEMINI_API_KEY`; šifrovanih tokena u bazi još nema, pa zamena ništa ne lomi. `CRON_SECRET` je već obrisan u Netlify-ju (brisanje druge dve klasifikator je odbio). **Deploy ne puštati dok vlasnik ne uveze taj fajl**: bez `CRON_SECRET` server ne prolazi proveru env-a. Od D-103 build to sam proverava i pada pre objave. `UNSPLASH_ACCESS_KEY` je upisan kroz konektor (tajna, produkcija); vlasnik je ključ dao u razgovoru, a Unsplash secret key aplikaciji ne treba.
- **Čeka vlasnika**: uvoz `.env.netlify-kljucevi.local` u Netlify (DEPLOY.md 10, 1a), Supabase Auth adrese (Site URL je još `http://localhost:3000`, pa linkovi iz mejlova za lozinku i potvrdu vode na localhost; DEPLOY.md 10, korak 2), zamena Supabase secret key-a (bio je u razgovoru), ostali ključevi servisa i jedna SQL linija.
- **Lozinka vlasnika** (29.10.2026): stara nije prolazila, a link za novu je vodio na localhost; privremena lozinka je upisana direktno u `auth.users` (bcrypt), vlasnik je menja posle podešavanja adresa.

## Cene u evrima i favicon — šta je urađeno

- **Katalog** (`supabase/seed.sql`, D-099): mesečni 47 €, godišnji 277 €, dopune 12, 30 i 85 €, besplatni plan u EUR; mesečni i godišnji 5 brendova, 10 mreža, 2 člana. Lokalna baza ažurirana.
- **Landing** sve čita iz baze: „Oko 23 € mesečno”, „51 % manje nego mesečni plan”; cenovnik se ne prikazuje ako valute nisu iste.
- **Admin**: MRR, vrednost tokena i marža u USD po kursu iz `platform_settings.fx_usd_rates` (1 EUR = 1,1193 USD, ECB 23.10.2026); kurs piše uz MRR i na strani AI troškovi.
- **Favicon** (`src/app/icon.svg`, `favicon.ico`, `apple-icon.png`, skripta `scripts/make-icons.mjs`); Next oznaka „N” u uglu isključena.
- **Testovi**: unit 226 (dupli test množine izbačen, landing koristi `pluralSr`); integracioni test dopune sada očekuje EUR.

## Landing po dizajnu iz Claude Design-a — šta je urađeno

- **Sekcije kao u dizajnu** (`src/components/landing/`): hero sa demoom u šest koraka, Mreže (pregled iste objave za osam mreža sa dužinom teksta), Funkcije (šest kartica sa malim interaktivnim primerima), Kako radi, Cene sa kalkulatorom tokena, Česta pitanja, završni poziv. Forma sa adresom sajta (gore i dole) menja domen u demou.
- **Podaci iz baze**: planovi, dopune i troškovi tokena; preporuka plana i najjeftinija dopuna u `pricing-math.ts` (5 unit testova). Tekst o tokenima pominje izuzetak za objave na X.
- **Javni layout**: Onest i JetBrains Mono, lepljivo zaglavlje sa sovom čije oči prate miš i menijem za telefon, podnožje sa pravnim linkovima i stranom `/kontakt`. Isti okvir imaju prijava, registracija i pravne strane; linkovi u pravnim tekstovima su sada podvučeni.
- **Registracija**: dugmad i pilula iznad naslova prate flag `registration_open` (lokalno uključen, pa se vidi „Otvoreno”).
- **Provereno**: snimci na 1440 i 390 px bez horizontalnog skrola, sve interakcije (forma, kalkulator, pitanja, navigacija), axe bez nalaza i posle klikova, LCP je naslov (ne slika), produkcijski build prolazi. Usput ispravljeno: obaveštenje u demou je na telefonu prekrivalo poslednji red panela, kartica Brand Brain se na telefonu sekla pri dnu.
- **Testovi**: unit 226 (bilo 219), E2E 13; provera pristupačnosti sada obuhvata i `/data-deletion` i `/kontakt`.

## Kako da testiraš (landing)

- `npm run dev`, pa http://localhost:3001. Unesite adresu sajta u formu gore: demo kreće od prvog koraka sa vašim domenom. Pomerite klizače u Cenama: preporuka i istaknuti planovi se menjaju (60 i 60 objava daje 740 tokena i predlog dopune od 300 tokena).
- Admin → Platforma → flag `registration_open` isključen: pilula postaje „U izradi”, a dugmad vode na demo i cene.

## Faza 16 — šta je urađeno (priprema, bez deploya)

- **[DEPLOY.md](DEPLOY.md)**: redosled postavljanja za vlasnika: nalozi i šta svaki daje, tajne aplikacije, Supabase, Vercel, DNS, adrese za OAuth i webhook-ove, provera posle prvog deploya, vraćanje unazad, bezbednost (D-097).
- **Workflow „Migracije”**: samo ručno, uz odobrenje kroz GitHub Environment, podrazumevano suvi prolaz, seed samo prvi put; Supabase CLI 2.122.0.
- **Seed**: podešavanja koja admin menja više se ne vraćaju na početne pri ponovljenom seed-u.
- **maxDuration** na osam teških ruta (Inngest 300 s, video 120 s, ostale 60 s).
- **Produkcijski build** prolazi lokalno; fontovi i react-pdf su u trace-u, robots, mapa i slika za deljenje se prave pri build-u.
- **Unsplash**: ime fotografa i Unsplash su vidljivi ispod svake fotografije u pretrazi, sa linkovima i UTM-om (uslov za produkcijski ključ); ime se u HTML-u escape-uje.
- **Šta čeka vlasnika**: nalozi i ključevi iz DEPLOY.md 1, Environments u GitHub-u, prijave mreža (INTEGRATIONS 14), dozvola za prvi deploy.

## Faza 15 — šta je urađeno

- **E2E glavnih tokova** (D-096): nacrt → zakazivanje → kalendar, javni link → klijent odobrava bez naloga, sečenje slike 9:16 → 4:5, mesečni PDF iz Analitike. Korisnik i radni prostor se prave kroz service role, samo nad lokalnim Supabase-om.
- **Pristupačnost**: axe (WCAG 2.1 A i AA) na javnim stranama, 15 strana aplikacije u obe teme i strani za odobravanje; test pada na ozbiljne i kritične nalaze. Ispravljeno sve što je prvi prolaz našao (kontrast crvene, zelene i statusa u kalendaru, dani van meseca, labele, imena dugmadi). Demo nalog sa podacima: nula nalaza.
- **CI**: nov posao `e2e` (lokalni Supabase sa Mailpit-om, dev server, Inngest dev 1.46.0); na grešci čuva rezultate i logove.
- **npm audit**: 9 postojećih nalaza procenjeno, nijedan nije dostupan nepoverenim ulazom (D-096).
- **Testovi**: E2E 13 (bilo 6), od toga 3 provere pristupačnosti.

## Faza 14, deo 4 — šta je urađeno

- **SEO javnih strana** (D-095): naslov, opis i kanonski URL početne, Open Graph i Twitter kartica, slika za deljenje (1200×630, pravi se pri build-u), strukturirani podaci (`Organization`, `SoftwareApplication` sa cenama iz baze).
- **robots.txt i sitemap.xml**: javne strane da, aplikacija, admin, API i privatni linkovi ne. Van domena `sovaai.rs` (pregledi, staging, localhost) sve je zabranjeno i svaka strana ima `noindex`.
- **Provereno na dev serveru**: oznake u `<head>`, JSON-LD, OG slika (PNG 1200×630 sa srpskim slovima), robots i mapa za localhost.
- **Testovi**: 3 unit (pravi domen, robots i mapa na produkciji i na pregledu).

## Faza 14, deo 3 — šta je urađeno

- **Mesečni PDF izveštaj** (D-094): pločice sa poređenjem sa prethodnim mesecom, doseg po danu, mreže, najbolje objave, stubovi, pratioci i AI uvidi, za kalendarski mesec u zoni brenda. Kartica u Analitici pravi PDF za izabrani mesec i čuva listu napravljenih sa linkom za preuzimanje.
- **Slanje klijentu**: 1. u mesecu u 06:00 po zoni brenda Inngest pravi izveštaj za prethodni mesec, šalje ga kao prilog na do 5 adresa klijenta i obaveštava vlasnika i administratore; isti mesec se ne šalje dvaput. Adrese menja vlasnik ili administrator u istoj kartici.
- **Migracija 024**: `brands.report_emails`, jedan izveštaj po brendu i mesecu. Lokalno primenjena kroz `docker exec … psql` (supabase.exe je i dalje blokiran), tipovi dopunjeni ručno.
- **Provereno u Chromium-u**: izveštaj za septembar i oktobar demo brenda kroz pravi Next server, stranice PDF-a pregledane kroz pdf.js.
- **Testovi**: 4 integraciona (`api.reports`: pravljenje i zamena, odbijeni meseci i tuđ brend, adrese klijenta, mesečni posao jednom sa prilogom), 7 unit (granice meseca i zona, render PDF-a).

## Faza 14, deo 2 — šta je urađeno

- **Grafikoni** (D-092): sopstvene SVG komponente jedne serije u `src/components/charts/`. Analitika ima doseg i angažovanje po danu objave (preko 31 dana po nedelji) i pratioce po mreži kao male zasebne linije; admin pregled ima registracije po danu, a AI troškovi trošak i generisanja po danu. Svaki grafikon ima oblačić na miš i strelice, prikaz kao tabelu i prazno stanje.
- **Editor**: izbor stuba sadržaja i kampanje (neaktivni stubovi i završene kampanje se ne nude, osim već izabranih); stari lokalni nacrt se dopunjuje novim poljima.
- **Sečenje slike** (N9, D-093): slika van opsega izabranih mreža dobija upozorenje i sečenje uz pregled; isečak je nova slika, original ostaje.
- **Zamena medija u zakazanoj objavi** (U9, D-093): vlasnik ili administrator menja sliku ili video bez otkazivanja termina; posle toga stari medij može da se obriše.
- **Ispravke**: isti fajl u drugom brendu više ne vraća medij tog brenda (objava je padala); red naloga u editoru se prelama na telefonu (strana je bila šira od ekrana za 49 px).
- **Testovi**: 4 integraciona (zamena, pravila zamene, sečenje, odbijeni zahtevi), 7 unit (odnos stranica i isečak, dnevni niz u zoni brenda).

## Faza 14, deo 1 — šta je urađeno

- **Vizuelni sistem** (D-091): plavi tokeni za svetlu i tamnu temu, mreža i sjaj iz reference, znak Sove.
- **Landing**: tamna strana sa segmentiranom navigacijom, dijagramom toka, mrežama, funkcijama, koracima, cenama iz baze (ušteda godišnjeg plana se računa), pitanjima i završnim pozivom; mobilni prikaz proveren na 500 px.
- **Prijava i javne strane**: ista tamna površina sa mrežom i sjajem iza kartice; tamna površina ide do dna ekrana.
- **Okvir aplikacije**: meni u grupama (Rad, Plan i rast, Sadržaj, Podešavanja), plavo aktivno stanje, kartica korisnika; stavka „Naplata”.
- **Početna**: pregled sa četiri pločice, sledećim objavama i prvim koracima.
- **Ispravka**: analitički test je kroz `runAccountMetricsSweep` upisivao vrednosti iz mocka u demo naloge (zajednička lokalna baza); sweep sada prima `scope.brandId`, a lažni redovi su obrisani.
- **Provere**: E2E 6/6 posle izmena okvira.

## Faza 12 — šta je urađeno

- **Stripe iza PaymentProvider interfejsa** (D-090): Checkout za pretplatu i dopunu, Customer Portal, jedan kupac po radnom prostoru (`billing_customers`).
- **Webhook**: provera potpisa, upis jednom, obrada u pozadini, stanje pretplate uvek iz Stripe-a.
- **Tokeni**: dopuna kad je plaćeno, pretplata uz plaćenu fakturu, godišnji plan mesečno, povraćaj i spor oduzimaju srazmerno.
- **Neuspelo plaćanje**: rok 7 dana, podsetnici dan 1, 3 i 6, posle roka nova generisanja staju (PAYMENT_REQUIRED).
- **Strana `/app/billing`**: plan, pretplata, dopune, Portal, istorija tokena; stavka „Naplata” u meniju; link iz podešavanja kad se dostigne limit plana.
- **Dnevni posao `billing-daily`**: godišnji plan, podsetnici, istekle rezervacije i grantovi (do sada ih nije čistio nijedan posao), zaglavljeni događaji.
- **Testovi**: 13 integracionih (`api.billing`, pravi potpis webhook-a, Stripe kroz MSW), 4 unit (pravila naplate); migracija 023.
- **Napomena**: Windows Application Control od 24.10.2026 uveče blokira `supabase.exe`; migracija 023 je lokalno primenjena kroz `docker exec … psql`, a tipovi su dopunjeni ručno u formatu CLI-ja (RUNBOOK, Zamke).

## Meta video i nove metrike — šta je urađeno

- **Instagram Reels i video u karuselu** (D-089): Reel kroz proveru statusa, karusel sa videom se pravi tek kad Instagram obradi delove (provera statusa sada može da pređe u sledeću fazu), prvi komentar i posle odložene objave, razumljive poruke za podkodove grešaka.
- **Facebook Reels i video**: uspravan kratak video ide kao Reel (bajtovi na rupload), ostalo kao video kroz `file_url`; objava kad Facebook obradi video; link Reela ili videa.
- **Metrike posle gašenja starih**: Facebook objava, stranica i video, Instagram nalog i Reel sa novim nazivima; mock sada odbija ugašene metrike kao pravi Graph API. Dodata dozvola `read_insights`.
- **Testovi**: 8 integracionih (`api.meta-video`), 3 unit.

## LinkedIn video, prvi komentar i Gemini ključ — šta je urađeno

- **LinkedIn video** (D-087): otpremanje u delovima kroz Videos API, objava tek kad LinkedIn obradi video, poruka kad obrada ne uspe; provera ne pušta sliku i video zajedno.
- **LinkedIn prvi komentar**: posle objave (kod videa posle obrade), samo za naloge sa dozvolom `*_feed` iz Community Management API-ja; greška komentara ne obara objavu. Editor sada piše da prvi komentar važi i za LinkedIn.
- **Gemini ključ** (D-088): u `.env.local`, proveren živim pozivima (tekst 1,7 s, embedding 1536 dimenzija, slika 10 s). Glavni tekstualni model je `gemini-3.6-flash` jer je 3.8 trenutno spor; istek roka odmah ide na fallback model.
- **Živi testovi sa pravim Gemini-jem** (`npm run test:live`, samo ručno): svih šest JSON šema prolazi kod pravog API-ja i kroz Zod; Studio, slika (0,07 USD, 21 s), Brand Brain nad tangerineseo.rs (30 strana, tačan profil sa uslugama) i strategija rade. Prva provera je našla da upit za objavu ne zna datum; sada ga nosi.
- **Testovi bez pravih ključeva**: integracioni testovi uvek koriste lažne ključeve spoljnih servisa, a opcioni servisi su isključeni.
- **Testovi**: 5 novih integracionih (LinkedIn video u delovima, neuspela obrada, slika i video zajedno, prvi komentar sa dozvolom i bez nje, 504 ide na fallback), 2 unit (klasifikacija grešaka).

## Faza 8d — šta je urađeno

- **X** (D-086): povezivanje sa PKCE, objava teksta, do 4 slike (sa opisom slike) ili videa (u delovima, sa čekanjem obrade), link objave u tekstu, metrike na 24 h i 7 dana, uvoz poslednjih 20 objava, opoziv pri odvajanju.
- **Naplata u tokenima**: 1 token, a sa linkom ili domenom 6; editor pokazuje cenu uz X nalog; naplaćuje se tek kad objava prođe (duplikat i potrošeni X krediti ne troše tokene).
- **Brojanje teksta kao na X-u** (`src/lib/x-text.ts`): link 23, emoji i CJK 2, domen bez `https://` je link.
- **Testovi**: 9 integracionih (`api.x`: PKCE i Basic, naplata sa linkom i bez, domen kao link, slike sa opisom, video sa obradom, nedovoljno tokena, duplikat i 402 bez troška, jednokratan refresh token, metrike po horizontima, istorija, opoziv), 8 unit (brojanje, linkovi, greške, tekst sa linkom).

## Faza 8c, deo 4 — šta je urađeno

- **Pinterest** (D-085): povezivanje, pin sa slikom, karusel do 5 slika i video pin; tabla se bira za svaki pin (panel u editoru čita table uživo).
- **Pravila Pinterest-a**: Autopilot ne pravi Pinterest objave i Pinterest ne može na nivo 3; istorija i metrike pinova se ne čuvaju.
- **Usput**: isti medij dvaput u jednoj objavi više ne daje grešku (upisuje se jednom).
- **Testovi**: 7 integracionih (`api.pinterest`: OAuth sa Basic autentikacijom, table kroz dve strane, provera, pin sa slikom i UTM linkom, karusel, obrisana tabla, video kroz S3, refresh token koji se menja, pravila čuvanja i Autopilota), 3 unit.

## Faza 8c, deo 3 — šta je urađeno

- **YouTube Shorts** (D-084): povezivanje kanala preko Google naloga, objava vertikalnog videa do 3 minuta sa naslovom, privatnošću i izjavom „namenjen deci”, čekanje da YouTube obradi video pa link na Short. Panel u editoru. Metrike: pregledi, lajkovi, komentari i pratioci kanala; uvoz istorije iz plejliste otpremanja.
- **Kvota**: 100 uploada dnevno za ceo Google projekat dok YouTube ne odobri više; kad se potroši, objava se pomera za 24 h.
- **Testovi**: 6 integracionih (`api.youtube`: nalog bez kanala, Shorts pravila, upload sa obradom, odbijen video, kvota, metrike i istorija), 3 unit (naslov, bajtovi opisa, izjava za decu).

## Faza 8c, deo 2 — šta je urađeno

- **Google poslovni profil** (D-084): povezivanje preko Google naloga (svaka lokacija je nalog u Sovi), objave sa fotografijom i dugmetom, događaji i ponude, metrike lokacije (prikazi, klikovi, pozivi, putanje). Panel u editoru objave. Objave nemaju metrike kroz Google API.
- **Zajednički tok za nove mreže** (D-083): PKCE u OAuth toku (za X), osvežavanje tokena po mreži, opoziv tek kad isti identitet nema drugih naloga ni u jednom brendu, metrike po mreži, naplata objave na X u tokenima (rezervacija pre slanja, potvrda posle uspeha).
- **Testovi**: 8 integracionih (`api.google-business`: povezivanje kroz dve strane lokacija, objava sa fotografijom i dugmetom, događaj, odbijena objava, novi pokušaj posle 503, lokacija bez prava objave, osvežavanje tokena, metrike i istorija, odvajanje bez i sa opozivom), 7 unit (pravila podešavanja, mapiranje Google grešaka).

## Faza 8c, deo 1 — šta je urađeno

- **Direktno otpremanje** (D-082): editor objave i AI Studio šalju fajl pravo u Supabase skladište preko potpisanog URL-a, uz traku napretka; server zatim proverava tip po sadržaju i upisuje fajl. Na Vercel-u bi otpremanje kroz server palo na 4,5 MB.
- **Video u biblioteci**: MP4 i MOV do 50 MB (`MEDIA_MAX_VIDEO_MB`). Trajanje i dimenzije se čitaju iz zaglavlja (vertikalan snimak sa telefona ostaje vertikalan), lokacija snimka se briše. U biblioteci video ima sličicu i trajanje. Objavljivanje videa po mrežama stiže sa YouTube-om, TikTok-om i ostalima; Facebook i Instagram ga zasad jasno odbijaju.
- **Čišćenje**: privremeni fajl se briše odmah posle obrade; napuštene briše dnevni posao `media-incoming-cleanup` (migracija 022, RPC `stale_incoming_uploads`).
- **Ispravke usput**: otpremanje u editoru objave nije radilo (ruta je tražila `workspaceId`, editor ga nije slao); traka „Vrati nacrt” se pojavljivala usred kucanja jer je čitala nacrt koji ista sesija upravo sačuva (sad se nacrt čita jednom, pri otvaranju editora; E2E to proverava).
- **Testovi**: 5 integracionih (`api.media-upload`: slika bez EXIF-a, video sa rotacijom i lokacijom, duplikat, MOV, oštećen i lažan video, limiti, tuđi brend, čišćenje), 7 unit (MP4 zaglavlje, rotacija, 64-bitne kutije, brisanje lokacije), 1 test baze (RPC samo za service role). Provereno u Chromium-u: video od 6 MB i slika kroz editor, bez grešaka.

## Kako da testiraš (faza 8c, deo 1)

1. Objave → Nova objava → Mediji → izaberi MP4 ili MOV sa telefona → traka napretka, pa pločica sa trajanjem.
2. Isto sa fotografijom većom od 5 MB → prolazi (ne ide kroz server).
3. `npm run test` (171), `npm run test:integration` (140), `npm run test:db` (30), `npm run test:e2e` (6).

## Faza 11b — šta je urađeno

- **Nacrt editora** (A4): tekst, nalozi, mediji i termin se čuvaju u pregledaču dok kucate. Posle osvežavanja, isteka sesije ili zatvaranja taba editor nudi „Vrati nacrt” ili „Odbaci”; posle čuvanja nacrt nestaje.
- **Mediji**: brisanje iz biblioteke (`DELETE /api/media/[id]`) daje 409 dok je medij u zakazanoj objavi (U9); kad upis u bazu ne uspe, fajl se odmah briše iz skladišta (U7); GIF dobija poruku sa razlogom (U6).
- **Zona brenda** (K7): Podešavanja → Brendovi → izbor zone; zakazane objave podrazumevano zadržavaju isto lokalno vreme (10:00 ostaje 10:00 u novoj zoni), run-ovi se zakazuju ponovo. Nepoznata zona daje 400.
- **Letnje i zimsko vreme** (K2): jedna konverzija lokalnog vremena u UTC za server i editor (`src/lib/zoned-time.ts`). Stara je na dan prelaza pomerala noćne termine za sat; sad 02:30 koje ne postoji postaje 03:30, a 02:30 koje postoji dvaput uzima prvi put.
- **Dupli tekst** (K9): za Facebook, LinkedIn i X provera objave javlja kad je isti tekst već objavljen ili zakazan na istom nalogu u poslednjih 30 dana (te mreže ga odbijaju); Instagram i TikTok se ne proveravaju (D-081).
- **Brisanje brenda i radnog prostora**: nije radilo (403 iz RLS-a, akcija je grešku prećutala); sad radi i otkazuje zakazane objave (K3, K13).
- **Ostalo**: stanje tokena u Studiju se osvežava pri povratku na tab i na 60 s (T2); polje termina ima oznaku za čitače ekrana; „1 zakazana objava” umesto „1 zakazanih objava” (`src/lib/plural.ts`). E2E granice su šire (30 s po proveri, 120 s po testu), jer dev server rutu pri prvom zahtevu prevodi i do 20 s.
- **Testovi**: 6 integracionih (`api.edge-cases`: GIF, medij u upotrebi, siročić u skladištu, promena zone, dupli tekst na Facebooku i bez provere na Instagramu, brisanje brenda i prostora sa otkazivanjem), 10 unit (zone i prelazi, množina), 1 E2E (nacrt posle osvežavanja i termin 31.3.2030 02:30 → 03:30). Provereno u Chromium-u: traka nacrta, vraćanje, čuvanje, forma zone.

## Kako da testiraš (faza 11b)

1. Objave → Nova objava → upiši tekst → osveži stranu → traka „Imate nesačuvan nacrt” → Vrati nacrt.
2. Podešavanja → Brendovi → izaberi drugu zonu → uz zakazane objave čekiraj „zadrži lokalno vreme” → Sačuvaj zonu → u kalendaru objava ostaje u istom satu.
3. Zakaži objavu sa slikom, pa probaj da obrišeš sliku kroz `DELETE /api/media/{id}` → 409; otkaži zakazivanje → brisanje prolazi.
4. Facebook objava sa istim tekstom kao već zakazana → Zakaži → poruka „Isti tekst je već zakazan na ovom nalogu…”.
5. `npm run test` (164), `npm run test:integration` (135), `npm run test:db` (29), `npm run test:e2e` (6).

## Faza 11a — šta je urađeno

- **Izvoz podataka** (D-080): `GET /api/account/export` vraća JSON fajl (`sova-podaci-YYYYMMDD.json`): profil, način prijave, članstva, sve iz radnih prostora čiji ste vlasnik (bez tokena mreža i internih troškova, mediji sa linkovima na 7 dana), vaše objave i komentari u tuđim prostorima, obaveštenja i podešavanja. Najviše 3 na sat, ne tokom impersonacije.
- **Brisanje naloga**: Podešavanja → Privatnost i podaci → kucanje emaila i lozinka (nalog bez lozinke: prijava u poslednjih 15 minuta). Vlasnik tima prvo prenosi vlasništvo; solo radni prostori se brišu, veze sa mrežama opozivaju, objave u tuđim prostorima ostaju bez autora. Isti plan brisanja koristi admin panel (`src/services/account.ts`).
- **Prenos vlasništva**: Tim → Prenos vlasništva (samo vlasnik, na postojećeg člana); RPC `transfer_workspace_ownership` (migracija 021), stari vlasnik postaje administrator, novi dobija obaveštenje `workspace_ownership`.
- **Odjava u svim tabovima** (EDGE_CASES A6, A7): BroadcastChannel `sova-auth` posle odjave ili brisanja, provera `/api/me` pri povratku fokusa; odjava vodi na `/login?odjava=1`, brisanje na `/login?nalog=obrisan` sa porukom.
- **Testovi**: 5 integracionih (izvoz bez tokena, limit izvoza, blokada vlasnika tima i pogrešan email, prenos sa proverama i obaveštenjem, brisanje sa lozinkom, opozivom TikTok veze i zadržavanjem objave u tuđem prostoru), 1 test baze (RPC prenosa odbija ne-vlasnika), 2 unit (pravila impersonacije). Provereno u Chromium-u: kartica privatnosti, izvoz, prenos, odjava u dva taba.

## Kako da testiraš (faza 11a)

1. Podešavanja → Privatnost i podaci → „Preuzmi moje podatke (JSON)”.
2. Tim (kao vlasnik sa bar jednim članom) → Prenos vlasništva → izaberi člana, potvrdi → vi ste administrator.
3. Otvori aplikaciju u dva taba, odjavi se u jednom → drugi prelazi na prijavu.
4. Probni nalog → Podešavanja → Obriši nalog… → email + lozinka → prijava sa porukom da je nalog obrisan.
5. `npm run test` (154), `npm run test:integration` (129), `npm run test:db` (29), `npm run test:e2e` (5).

## Faza 8b — šta je urađeno

- **Opšti sloj mreža**: registry po ključu toka (`meta`, `linkedin`, `tiktok`) i mreži, uopšten servis naloga (povezivanje, izbor, sinhronizacija, prekid veze sa opozivom samo kad token ne deli drugi nalog), `providerUserId` u metapodacima naloga. `accessTokenFor` daje važeći token svim pozivima mreže (TikTok se osvežava pre isteka, LinkedIn posle isteka bez refresh-a traži ponovno povezivanje, D-078); cron `social-token-refresh` na 6 h. Novi moduli `account-rows.ts` i `tokens.ts` sklanjaju kružne uvoze.
- **LinkedIn** (D-076): lični profil (self-serve proizvodi) i stranice firmi (Community Management API, `LINKEDIN_PAGES=true`), Posts API verzija 202610, tekst u `little` formatu, jedna slika ili više njih (Images API, WebP → JPEG), link kao članak sa naslovom i opisom sa stranice (SSRF-bezbedan pregled), brisanje, istorija i statistika stranice, metrike ličnih objava uz `LINKEDIN_MEMBER_ANALYTICS=true`, pratioci stranice. Obaveštenje `account_expiring` 7 dana pre isteka veze od 60 dana, posle isteka `needs_reauth`.
- **TikTok** (D-077): OAuth za web, nalog sa pratiocima, `creator_info` pre svake objave, foto objava (`PULL_FROM_URL` sa našeg domena kroz `/api/media/public/{token}.jpg`, JPEG do 1080p), video kroz `FILE_UPLOAD` u delovima (radi kad mediji budu imali video), polling statusa u publisheru, ID posle moderacije (`publish:…` dok ga nema, razrešava se pri metrikama), istorija i metrike videa, nalog iz `user/info`, opoziv pri prekidu veze. int64 ID-jevi se parsiraju bez gubitka cifara.
- **Editor**: TikTok panel po UX smernicama (nalog na koji ide objava, privatnost bez podrazumevane vrednosti, komentari/duet/stitch po pravilima naloga, otkrivanje komercijalnog sadržaja sa oznakama „Vaš brend” i „Brendirani sadržaj”, saglasnost sa pravilima o muzici i brendiranom sadržaju); podešavanja se čuvaju u `post_targets.options.tiktok` i proveravaju pri zakazivanju.
- **Mreže (strana)**: dugme za svaku podešenu mrežu, poruke po mreži, „Poveži ponovo” po mreži naloga, datum isteka LinkedIn veze.
- **Usput ispravljeno**: provera objave pre zakazivanja sada pita provider svake mreže (ranije samo Facebook i Instagram); sinhronizacija Meta naloga ponovo šifruje i refresh token aktuelnom verzijom ključa; brisanje korisnika sa strategijom je padalo na FK proveri usred kaskade (migracija 020, D-079); `deleteTestUser` je tiho ignorisao neuspelo brisanje, pa su se test podaci gomilali i ometali watchdog test.
- **Šema**: migracija `20261024000020_deferred_cascade_fks.sql` (odložena provera CASCADE i SET NULL ključeva).
- **Testovi**: 2 testa baze (brisanje korisnika sa strategijom i generacijom, odložena provera i dalje odbija nepostojećeg roditelja), 16 unit (little format, podela videa, UTF-16 skraćivanje, opcije, mapiranje grešaka, int64 ID-jevi, potpis javnog URL-a) i 13 integracionih sa MSW mock-om (LinkedIn povezivanje, profil sa dve slike, stranica sa člankom, metrike, istek i obaveštenje; TikTok povezivanje, `creator_info` i provera, foto objava sa javnim URL-om i rutom, moderacija, promenjena privatnost, osvežavanje i rotacija refresh tokena, video `FILE_UPLOAD`, istorija i opoziv).

## Kako da testiraš (faza 8b)

1. Bez ključeva: `/app/accounts` piše koje mreže nisu podešene; `npm run test:integration` pokriva ceo tok kroz mock.
2. Sa ključevima (`LINKEDIN_CLIENT_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`) i flagovima `platform.linkedin` / `platform.tiktok` u Admin → Platforma: „Poveži LinkedIn” → profil (i stranice uz `LINKEDIN_PAGES=true`) → objava sa slikom.
3. TikTok: nalog mora biti privatan dok aplikacija ne prođe audit; u editoru izaberite privatnost „Samo ja”, potvrdite saglasnost, dodajte fotografiju; `PUBLIC_MEDIA_BASE_URL` mora biti domen verifikovan u TikTok portalu.
4. `npm run test` (154), `npm run test:integration` (124), `npm run test:db` (28), `npm run test:e2e` (5).

## Faza 13 — šta je urađeno

- **Pristup** (brif 16, D-071): `/admin/*` i `/api/admin/*` samo za `platform_admin` (email u allowlist-i pri registraciji) sa potvrđenim emailom i TOTP kodom potvrđenim u toj sesiji (AAL2). Bez potvrde stranice vode na Bezbednost sa objašnjenjem, a API vraća 403. Admin rute uvek rade sa stvarnim adminom, i tokom impersonacije.
- **Pregled** (`/admin`): korisnici (ukupno, novi za 1/7/30 dana, blokirani, DAU/WAU/MAU iz `auth.sessions`, registracije po danu), radni prostori i brendovi, naplata (MRR, ARR, churn, konverzija; nula do faze 12 i strana to kaže), tokeni i AI (potrošnja, generisanja, trošak, procena marže), objave po mreži, kasne i neuspele.
- **Korisnici** (`/admin/users`): pretraga po emailu, imenu i radnom prostoru, filteri (status, plan, period registracije), sortiranje i paginacija na serveru. Detalj: radni prostori sa tokenima i planom, brendovi i mreže (bez tokena), istorija tokena, generisanja, neuspele objave, oznake zloupotrebe, impersonacije i audit nad korisnikom. Svako otvaranje detalja ide u audit (`user.view`).
- **Radnje nad korisnikom**: tokeni +/− uz razlog (ledger i jedan audit zapis u istoj transakciji, D-075), blokada (profil, Auth ban i opoziv sesija) i deblokada, odjava sa svih uređaja (izdat token odmah prestaje da važi), ponovno slanje verifikacije, brisanje naloga uz kucanje emaila (vlasnik tima sa drugim članovima dobija 409; solo radni prostori, objave, mediji i veze mreža se brišu). Nad drugim adminom i sopstvenim nalogom ove radnje nisu dozvoljene.
- **Monitor objava** (`/admin/publishing`): neuspele objave po mreži i kodu greške za 30 dana, lista sa ručnim ponovnim pokušajem (sledeći slobodan minut, objava se vraća u red, audit `publish.retry`), zakazane koje kasne više od 3 minuta, broj naloga koji čekaju ponovno povezivanje.
- **AI troškovi** (`/admin/ai-costs`): po modelu, danu i radnom prostoru (sa vlasnikom), prihod i marža po D-074, istaknuta negativna marža; 7, 30 ili 90 dana.
- **Platforma** (`/admin/platform`): feature flagovi, cene akcija u tokenima, aktivni modeli samo sa dozvoljene liste (D-072), banner za održavanje svim korisnicima. Izmene važe za najviše minut i idu u audit sa stanjem pre i posle.
- **Audit log** (`/admin/audit`): filteri po adminu, akciji, korisniku i periodu, paginacija, CSV izvoz (BOM za Excel, zaštita od formula, najviše 1.000 redova; i sam izvoz se beleži), lista sesija impersonacije sa brojem zahteva.
- **Impersonacija** (D-070): razlog, read-only podrazumevano, pun režim uz kucanje emaila korisnika, najviše 30 minuta, potpisan httpOnly cookie sa ID-jem sesije, JWT za ciljnog korisnika (RLS radi kao za pravog korisnika), traka „Gledate kao … · Izađi” na svakoj strani aplikacije i admin panela, svaki zahtev u auditu (bez zapisa nema impersonacije). Read-only čuvaju handler API-ja, serverske akcije i RLS. Pun režim i dalje zabranjuje lozinku, email i MFA, naplatu, svako brisanje, povezivanje mreža i Canve, objavljivanje, Autopilot, tim i nov radni prostor. MFA panel je tokom impersonacije isključen, a „Odjava” samo završava impersonaciju.
- **Šema**: migracija `017_admin` (RPC-ovi za brojke, aktivnost, opoziv sesija, Auth podatke i AI troškove; indeksi audita i sesija; `active_models`), `018_post_media_fk` (FK ka medijima se proverava na kraju transakcije: brisanje korisnika ili radnog prostora sa objavama koje imaju medije je ranije padalo), `019_audit_log_permanent` (audit bez stranih ključeva, `admin_email`, atomičan `admin_adjust_tokens`, D-075).
- **Usput ispravljeno**: `requireMembership` je tokom read-only impersonacije bacao grešku i za čitanje; pravilo punog režima za `/api/workspaces` usklađeno je sa serverskom akcijom (izmena podešavanja radnog prostora dozvoljena, nov radni prostor i tim ne).
- **Lokalni admin**: `npm run demo:seed` pravi `admin@sova.local` kroz allowlist sa uključenim TOTP-om; `npm run demo:totp -- <tajna>` ispisuje trenutni kod.
- **Testovi**: 11 unit (cookie i JWT impersonacije, pravila blokade, metrike, CSV), 15 integracionih (pristup bez MFA, pregled i detalj, tokeni, blokada, odjava i verifikacija, brisanje, flagovi, cene, modeli, održavanje, monitor i ponovni pokušaj, AI troškovi, audit i CSV, impersonacija read-only i pun režim sa istekom, ukraden i lažan cookie, RLS sa `imp.ro`) i 2 testa baze (audit append-only bez stranih ključeva, atomičan `admin_adjust_tokens`).

## Kako da testiraš (faza 13)

1. `npm run demo:seed` → prijava kao `admin@sova.local` → Podešavanja → Bezbednost → kod (`npm run demo:totp -- <tajna>`) → `/admin`.
2. Korisnici → `demo@sova.local` → dodaj 10 tokena uz razlog → istorija tokena i Audit log pokazuju promenu.
3. „Gledaj kao” sa razlogom → `/app` sa žutom trakom; izmena daje poruku o režimu samo za čitanje; „Izađi” vraća na detalj korisnika; sesija se vidi na Audit log strani sa brojem zahteva.
4. Platforma → banner za održavanje uključen → traka na svim stranama za najviše minut; isključi ga posle provere.
5. Audit log → Izvezi CSV → fajl se otvara u Excelu sa ispravnim slovima.
6. `npm run test` (138), `npm run test:integration` (111), `npm run test:db` (26), `npm run test:e2e` (5).

## Faza 10c — šta je urađeno

- **Nivoi** (brif 9.2, `src/lib/autopilot/rules.ts`): 0 ručno, 1 kopilot (nedeljni nacrti idu na odobrenje), 2 autopilot sa odobrenjem (Sova sama pravi strategiju; neodobrene posle roka se preskaču ili objavljuju po podešavanju), 3 pun autopilot (zakazuje bez odobrenja samo na izabranim nalozima; traži flag `autopilot_level3`, naziv brenda kao potvrdu i izbor naloga; svaki drugi nivo ga isključuje).
- **Nedeljni prolaz** (`src/services/autopilot/runner.ts`, Inngest `autopilot-weekly` na sat → `autopilot-brand-week` po brendu): ponedeljkom od 06:00 po zoni brenda za narednu nedelju; red u novoj tabeli `autopilot_runs` sa (brend, nedelja) sprečava dupli prolaz. Iz aktivne strategije koja pokriva nedelju pravi nacrte (postojeći nacrti-brifovi iz „Napravi kalendar” se pune), na nivou 2–3 bez strategije prvo sam napravi i aktivira strategiju za 4 nedelje, na nivou 1 ostavlja predlog u Inbox-u. Svaki nacrt je poseban step: tekst (2 tokena), vizual iz šablona za Instagram i Pinterest (2 tokena, JPEG 1:1, boje i logo brenda), kontrola kvaliteta, pa odobrenje ili zakazivanje. Najviše 21 nacrt po nedelji.
- **Kontrola kvaliteta** (brif 9.3.4): prazan tekst, dužina i hashtagovi po mreži, zabranjene reči, pismo (latinica/ćirilica, AI7), sličnost sa objavama iz 90 dana (Jaccard nad trojkama reči ≥ 0,6, AI9), brojke kojih nema u profilu brenda (cene, procenti, rokovi), vizual za mreže koje ga traže. Pad → nacrt ostaje kod korisnika sa `qa_report` i obaveštenjem „Autopilot je vratio objavu”.
- **Budžet** (brif 9.3.3): mesečni limit tokena po brendu (`autopilot_token_budget`, prazno = bez limita); potrošnja = `tokens_charged` generacija sa `input.autopilot = true` u UTC mesecu; upozorenje na 80 %, stop na 100 % (prolaz se završava kao „delimično”), obaveštenje jednom mesečno.
- **Rokovi** (`deadlines.ts`, cron na 15 min): odobrena Autopilot objava se zakazuje za svoj termin; neodobrena posle roka (sati pre termina): nivo ≥ 2 preskoči (otkazivanje) ili objavi (sistemsko odobrenje + zakazivanje), nivo 1 podsetnik jednom pa povratak u nacrt kad termin prođe.
- **Mesečni prolaz** (`autopilot-daily` u 05:00 UTC, od 25. u mesecu po zoni brenda): nivo ≥ 2 pravi i aktivira strategiju za mesec od prvog ponedeljka (20 tokena iz budžeta Autopilota), nivo 1 predlog u Inbox-u. Aktiviranje strategije sada arhivira samo aktivne strategije čiji se period preklapa (D-064).
- **Okidači** (`triggers.ts`): praznik u narednih 7 dana → predlog (jednom), objava sa ≥ 2× prosečnim angažovanjem brenda iz 30 dana (bar 5 objava) → predlog „ponovi format” posle snimka od 24 h, istek predloga dnevno. Novi blog i promene sajta već dolaze iz nedeljne provere sajta (faza 6).
- **Nedeljni izveštaj** (brif 9.3.6): posle prolaza vlasnicima obaveštenje i email sa brojem objava, dosegom i angažovanjem prethodne nedelje i planom za narednu.
- **„Pauziraj sve”**: brend `paused`, sve zakazane objave pauzirane i run-ovi otkazani (publisher i Autopilot ionako ne rade za pauziran brend); „Nastavi” (vlasnik, administrator) vraća u red objave čiji termin nije prošao.
- **Inbox predloga** (`src/services/suggestions.ts`): lista po statusu sa brojevima, prihvatanje (blog → nacrt sa linkom, uvid/praznik/ponovi format → nacrt, profil → Brand Brain, strategija → Strategija), odbacivanje, zaštita od dvostruke obrade.
- **Sistemske radnje nad objavom** (`src/services/posts/system.ts`): slanje na odobrenje, zakazivanje (isti minut → +1 min), sistemsko odobrenje, povlačenje, otkazivanje — isti `transition_post`, `actor = null` u istoriji verzija.
- **UTM** (brif 10): publisher svakom linku dodaje `utm_source` = mreža, `utm_medium = social`, `utm_campaign` = UTM ili naziv kampanje (podrazumevano `sova`); ručni UTM objave i postojeći parametri imaju prednost.
- **API**: `GET/PATCH /api/autopilot/[brandId]`, `POST /api/autopilot/[brandId]/{pause,resume,run}`, `GET /api/suggestions`, `POST /api/suggestions/[id]/{accept,dismiss}`.
- **UI**: `/app/autopilot` (nivoi sa opisom, potvrda za nivo 3 sa izborom naloga, budžet sa trakom i stanjem, rok i ponašanje, „Pauziraj sve” / „Nastavi”, „Pripremi narednu nedelju sada”, aktivna strategija, poslednji prolazi), `/app/inbox` (kartice po statusu, Prihvati / Odbaci), kartica Inbox-a i nivoa na početnoj strani; navigacija: Inbox, Autopilot.
- **Šema**: tabela `autopilot_runs` (RLS čitanje za članove brenda, upis samo service role) i parcijalni indeks Autopilot objava na odobrenju (nova migracija `20261024000016_autopilot.sql`); `brands.settings.autopilot` nosi naloge za nivo 3 i objave pauzirane kroz „Pauziraj sve”.
- **Testovi**: 9 unit (budžet, vreme prolaza, rok, kontrola kvaliteta, okidači) i 16 integracionih (podešavanja i nivo 3, ručni prolaz, Inbox, mesečni prolaz nivo 1 i 2, nedeljni prolaz nivo 1 sa vizualom i odobrenjima, povratak zbog zabranjene reči, nivo 3 po nalogu, stop budžeta, rokovi objavi/preskoči/podsetnik/povratak, „Pauziraj sve” i „Nastavi”, praznik, istek, izuzetna objava) + UTM provera u testu publishera.

## Kako da testiraš (faza 10c)

1. `/app/autopilot` → nivo 1 → „Pripremi narednu nedelju sada” (treba aktivna strategija koja pokriva narednu nedelju, `GEMINI_API_KEY` i `npm run inngest:dev`) → nacrti na `/app/posts?status=in_review`, IG nacrt ima vizual iz šablona.
2. Odobri jedan nacrt → za najviše 15 min `autopilot-deadlines` ga zakazuje za planirani termin. Nivo 2 + „objavi” → neodobrena objava se posle roka sama zakazuje.
3. Budžet 10 tokena → sledeći prolaz staje posle prvih nacrta, obaveštenje „Budžet Autopilota potrošen”.
4. „Pauziraj sve” → zakazane objave pauzirane, traka na vrhu; „Nastavi” ih vraća.
5. `/app/inbox` → prihvati predlog iz bloga → otvara se nacrt sa linkom.
6. `npm run test` (127), `npm run test:integration` (96), `npm run test:db` (24), `npm run test:e2e` (5).

## Faza 10b — šta je urađeno

- **Metrike objava** (`src/services/analytics/metrics.ts`, Inngest `post-metrics` na `post/target.published`): spava do +1 h, +24 h, +7 d i +30 d od objave i svaki put upisuje snimak u `post_metrics_snapshots` (prikazi, doseg, reakcije, komentari, deljenja, čuvanja, klikovi, stopa angažovanja, sirovi odgovor). Isti horizont se ne upisuje dvaput (UNIQUE indeks + provera), `adhoc` snimak je ručno osvežavanje. Meta „objekat ne postoji” (code 100 / subcode 33) ili 404 → target `deleted_externally` i kraj praćenja (N6); istekao token → nalog `needs_reauth`.
- **Metrike naloga** (cron `social-account-metrics` u 04:00 UTC): pratioci, doseg, prikazi i pregledi profila za jučerašnji dan po aktivnom nalogu, upsert po (nalog, dan) u `account_metrics_daily`.
- **Pregled** (`src/services/analytics/overview.ts`, čista pravila u `src/lib/analytics/aggregate.ts`): objavljeni targeti u periodu (`published` i `assisted_done`), merodavan snimak po targetu (najduži horizont, pri istom horizontu najsvežiji), zbirovi (objave, sa metrikama, prikazi, doseg, angažovanje, stopa = angažovanje / doseg), poređenje sa prethodnim periodom iste dužine, tabele po mreži i stubu, najbolje i najslabije objave, pratioci po nalogu (početak, kraj, promena), napomene kad metrike još nisu stigle. Isti kod radi za korisnika (RLS) i za cron (service role).
- **AI uvidi** (`src/services/analytics/insights.ts`, prompt `src/lib/ai/prompts/insights.ts`, cron `analytics-insights-weekly` nedeljom u 18:00 UTC): treba bar 3 objave sa metrikama; model vraća 3–5 tvrdnji sa preporukom, dokazima (samo ID-jevi targeta koji postoje u podacima), pouzdanošću (svedena na 0–1); do 2 uvida postaju predlozi u `suggestions` (source `insight`, rok 14 dana, score = pouzdanost × 100). Platforma plaća (akcija `insights` = 0 tokena, generacija se beleži). Vlasnici dobijaju obaveštenje `insights_ready`.
- **API**: `GET /api/analytics/overview`, `GET /api/analytics/posts` (filter po mreži, horizonti po objavi), `GET /api/analytics/insights`, `POST /api/analytics/insights/generate` (urednici, 2 na sat), `POST /api/analytics/refresh` (urednici, snimak `adhoc`, 10 u minutu). Opseg najviše godinu dana, početak pre kraja.
- **UI** `/app/analytics` (`src/components/analytics/analytics-client.tsx`): izbor perioda 7/30/90 dana, četiri ključna broja sa promenom u odnosu na prethodni period, tabele po mreži i stubu, najbolje objave, pratioci, AI uvidi sa pouzdanošću i brojem dokaza, sve objave sa metrikama i dugmetom „Osveži”. Brojevi su tekst, bez višeserijskih grafikona (D-062). Navigacija: Analitika.
- **Testovi**: 5 unit (izbor snimka, zbirovi i grupe, promene i prethodni period, serija pratilaca) i 8 integracionih (FB snimak + ponovljeni horizont + adhoc; IG snimak iz insights; N6 obrisana objava; metrike naloga upsert i dnevni prolaz; pregled sa zbirovima, mrežama, stubovima, najboljim objavama i pratiocima, posmatrač čita, loš opseg 400; objave sa horizontima, filter, osvežavanje 403/200; uvidi bez podataka; uvidi sa filtriranim dokazima, predlogom u Inbox-u i obaveštenjem).
- Odloženo: mesečni PDF izveštaj (`reports-monthly`) stiže uz dizajn (14b) jer zavisi od vizuelnog identiteta; Inbox UI i prihvatanje predloga su faza 10c.

## Kako da testiraš (faza 10b)

1. Uz povezan Meta nalog i objavljenu objavu: Inngest dashboard pokazuje run `post-metrics` koji spava do +1 h; na `/app/analytics` „Osveži” odmah povlači snimak.
2. Bez pravog naloga: ubaci objavljen target i pokreni test `npm run test:integration -- api.analytics` (Meta mock) ili ručno `capturePostMetrics` iz skripte.
3. `/app/analytics` → period 7/30/90 dana, tabele, „Generiši uvide” (treba bar 3 objave sa metrikama i `GEMINI_API_KEY`).
4. `npm run test` (118), `npm run test:integration` (80), `npm run test:db` (24), `npm run test:e2e` (5).

## Faza 10a — šta je urađeno

- **Strategija** (`src/services/strategy/strategy.ts`, prompt `src/lib/ai/prompts/strategy.ts`): `POST /api/strategies/generate` (20 tokena, 3 na sat po korisniku, Idempotency-Key, 202) → Inngest `ai-generate-strategy` (jedan run po brendu). Ulaz: profil brenda + RAG odlomci, aktivne mreže (ili izabrane u zahtevu), ciljevi i napomene korisnika, praznici u periodu (RS + globalni komercijalni datumi), istorija objava iz poslednjih 180 dana (ritam po mreži, top 5 po angažovanju). Izlaz: sažetak, ciljevi sa KPI i metom, mix mreža (`per_week`, formati, uloga), stubovi sadržaja (udeli = 100), nedeljne teme (tačno N), hashtag strategija (core, niche, local, avoid), kampanje uz praznike i ponude, lista pretpostavki. `normalizeStrategyOutput` čisti izlaz: samo tražene mreže, udeli na 100, popunjene nedelje, datumi kampanja u periodu, hashtagovi malim slovima.
- **Najbolja vremena** (`src/lib/strategy/plan.ts`): iz istorije kad mreža ima bar 10 objava (top 3 para dan/sat po prosečnom angažovanju, u zoni brenda), inače predlog modela ili tabela pretpostavki; svaki termin nosi `source: data | assumption`, strategija `uses_assumptions`.
- **Verzije i stubovi**: ista `period_start` → `version + 1`; `PATCH /api/strategies/[id]` sa `status: active` arhivira ostale aktivne i upisuje `approved_by`; stubovi sa istim imenom se vezuju za novu strategiju umesto da se dupliraju; kampanje se vezuju za strategiju.
- **Kalendar iz strategije** (`POST /api/strategies/[id]/generate-calendar`, bez tokena): `planCalendar` raspoređuje `per_week` termina po mreži u najboljim vremenima (rotacija po nedeljama), neradni praznik pomera objavu za dan, isti termin za istu mrežu se ne ponavlja; nacrti dobijaju naslov (tema — ugao), brif kao tekst, stub, kampanju, `strategy_id`, `scheduled_for` u UTC i targete za sve aktivne naloge te mreže. Ponovni poziv preskače postojeće termine, prošle termine i mreže bez naloga (brojevi u odgovoru).
- **Stubovi i kampanje**: `GET/POST /api/pillars`, `PATCH/DELETE /api/pillars/[id]` (dupli naziv 409), `GET/POST /api/campaigns`, `PATCH/DELETE /api/campaigns/[id]` (kraj pre početka 400); upis kroz service role posle provere uloge, čitanje kroz RLS.
- **UI** `/app/strategy` (`src/components/strategy/strategy-client.tsx`): lista verzija po periodu, forma „Nova strategija” (početak = sledeći ponedeljak, 2–12 nedelja, ciljevi po redu, napomene, objava nedeljno), praćenje posla kroz `/api/ai/jobs/[id]`, pregled (ciljevi, mreže, stubovi sa bojama i udelima, nedeljne teme, najbolja vremena sa oznakom podaci/pretpostavka, hashtagovi, kampanje, pretpostavke), Aktiviraj / Arhiviraj / Vrati u nacrt, „Napravi kalendar (N nacrta)” sa rezultatom i linkom na kalendar, dodavanje i brisanje stubova i kampanja. Navigacija: Strategija.
- **Šema**: `strategies.summary` i `strategies.assumptions` (migracija izmenjena u mestu, `db:reset`, `db:types`).
- **Testovi**: 6 unit (vremena iz istorije u lokalnom satu, spajanje podaci/model/pretpostavke, plan kalendara sa praznikom i bez duplih termina, nedelje i sledeći ponedeljak) i 6 integracionih (202 + rezervacija 20 tokena + posao sa Gemini mockom → v1 sa normalizacijom; posmatrač 403 i bez Idempotency-Key 400; v2 + aktiviranje arhivira v1 + stubovi bez dupliranja; kalendar 20 nacrta sa stubom, kampanjom i targetima, Božić preskočen, ponovni poziv 0 novih, kalendar API; stubovi CRUD sa 409 i 403; kampanje 400/201/brisanje).
- Odloženo: izbor stuba i kampanje u composeru (tehnički dug); Autopilot (10c) koristi aktivnu strategiju (`activeStrategy`) i stubove.

## Kako da testiraš (faza 10a)

1. `/app/accounts` sa bar jednim aktivnim nalogom (ili red u `social_accounts` kao u testu) → `/app/strategy` → „Nova strategija” → sa `GEMINI_API_KEY` i pokrenutim `npm run inngest:dev` posao traje do 2 minuta; bez ključa posao pada sa porukom, a tokeni se vraćaju.
2. Pregledaj verziju: termini označeni „pretpostavka” dok nema istorije; „Aktiviraj”; „Napravi kalendar” → `/app/calendar` pokazuje nacrte po terminima; otvori nacrt → naslov tema — ugao, tekst je brif, stub i kampanja su upisani.
3. Dodaj stub i kampanju ručno; ponovo „Napravi kalendar” → 0 novih (termini već postoje).
4. `npm run test` (113), `npm run test:integration` (72), `npm run test:db` (24), `npm run test:e2e` (5).

## Faza 9b — šta je urađeno

- **Publisher** (`src/services/posts/publisher.ts`, Inngest `publish-target`): run po targetu spava do termina (`sleepUntil`), `cancelOn post/target.unscheduled` po `targetId`, jedan run po nalogu mreže u isto vreme. Ponovna provera u terminu: brend aktivan (inače target i objava `paused`), nalog aktivan (inače target `needs_reauth` + obaveštenje), asistirani nalog (→ `assisted_pending`), mediji postoje, dnevni limit po mreži (IG 100, TikTok 15, YouTube 6 u pokretnom prozoru od 24 h → pomeranje za 24 h, nov događaj, obaveštenje; N7). Zaključavanje `scheduled → publishing` uslovnim UPDATE-om (samo jedan run prolazi), objava `scheduled → publishing` sa `locked_at` (K5).
- **Pokušaji**: najviše 3 sa pauzama 1/5/15 min unutar run-a (`step.sleep`); privremene greške (rate limit, 5xx, pad mreže) vraćaju target u `scheduled` sa porukom; pre svakog ponovnog pokušaja `findExistingPost` (N5, pad usred slanja); trajne greške → `failed` sa porukom na srpskom; token/dozvole → nalog `needs_reauth` + target `failed` sa uputstvom; duplikat → traži postojeću objavu; kvota mreže → pomeranje za 24 h. Svaki završen pokušaj je red u `publish_attempts` (append-only). IG kontejner: provera na minut do 10 puta (`getPublishStatus`), istek → `failed` sa porukom.
- **Status objave iz targeta** (`rollupPost`, K12): svi uspeli → `published`; nijedan → `failed`; mešano → `partially_published`; dok neki čeka → `publishing` (ako je nešto već prošlo ili upravo ide) ili `scheduled` (svi čekaju; nov servisni prelaz `publishing → scheduled`, D-051). Potpisani URL medija važi 24 h (N12). `onFailure` otključava target posle naše greške (`failed`, kod INTERNAL).
- **Watchdog** (`publish-watchdog`, cron na 5 min; K11): target `scheduled` koji kasni > 3 min bez pokušaja → nov događaj (najviše jednom u 10 min, `last_error_code = WATCHDOG_RESENT`), > 15 min → alarm vlasnicima (jednom po targetu); `publishing` bez pokušaja 30 min → nazad u `scheduled` + nov događaj.
- **Asistirano objavljivanje**: nalog sa `assisted_only` ili bez `capabilities.publish` → u terminu target `assisted_pending` + email; na strani objave kartica sa „Kopiraj tekst”, linkovima medija i „Označi kao objavljeno” (`POST /api/posts/[id]/targets/[targetId]/assisted-done`, opcioni link) → `assisted_done`, objava `published`.
- **Retry iz UI-ja** (K12): `POST /api/posts/[id]/targets/[targetId]/retry` za `failed` i `needs_reauth` (nalog mora biti aktivan) → sledeći pun minut, objava `failed → scheduled`, nov događaj.
- **Obaveštenja**: katalog tipova u `src/config/notifications.ts` (podrazumevani email po tipu), `notification_preferences` po korisniku, workspace-u, tipu i kanalu (isključen kanal se preskače), API `GET /api/notifications`, `POST /api/notifications/read`, `GET/PUT /api/notifications/preferences`; zvono u navigaciji (broj nepročitanih, poslednjih 8, osvežavanje na minut), strana `/app/notifications`, kartica „Obaveštenja” u podešavanjima.
- **K3**: arhiviranje brenda otkazuje run-ove i zakazane objave (`cancelScheduledPostsForBrand` posle `deleteBrand`); podešavanja pokazuju broj zakazanih po brendu.
- **Testovi**: 7 unit (pravila publishera: rollup, pauze, razvrstavanje grešaka) i 12 integracionih (uspeh sa prvim komentarom i događajem, privremena greška + drugi pokušaj, zastareo run, onFailure, asistirano + označavanje, odbijen medij + retry + IG kontejner, K12 delimičan uspeh, N7 limit, watchdog sa alarmom i otključavanjem, obaveštenja API i podešavanja, K3).
- Odloženo: funkcija `post-metrics` (sleepUntil +1 h/+24 h/+7 d/+30 d) stiže u 10b (analitika); događaj `post/target.published` se već šalje.

## Kako da testiraš (faza 9b)

1. `npm run inngest:dev` pa u aplikaciji zakaži objavu za 2 minuta → u Inngest dashboardu (`localhost:8288`) run `publish-target` spava, u minutu termina objavljuje; strana objave se sama osvežava (target „objavljeno”, link na objavu). Bez pravog Meta naloga run završava kao `needs_reauth`/`failed` sa porukom, što je očekivano.
2. „Objavi sada” → objava odlazi u sledećem punom minutu. „Otkaži zakazivanje” dok run spava → run se otkazuje (`post/target.unscheduled`).
3. Nalog bez API objavljivanja (asistiran) → u terminu target „čeka ručno objavljivanje” + email; na objavi „Kopiraj tekst” i „Označi kao objavljeno”.
4. Zvono u gornjem levom uglu: nepročitana obaveštenja; `/app/settings` → kartica Obaveštenja → isključi email za „Objava objavljena”.
5. `npm run test` (107), `npm run test:integration` (66), `npm run test:db` (24), `npm run test:e2e` (5).

## Faza 9a — šta je urađeno

- **State machine** (`src/lib/posts/state-machine.ts`): matrica prelaza iz SCHEMA.md, `SERVICE_ONLY` prelazi, pravila radnji po ulozi (`checkAction`, `availableActions`), status targeta koji prati objavu, validacija vremena (prošlost → poruka sa „Objavi sada”, najviše godinu dana). Baza ostaje druga i treća odbrana (`status_transitions`, `posts_guard`, RPC `transition_post`).
- **Objave** (`src/services/posts/posts.ts`): kreiranje nacrta sa targetima po nalogu (tekst po mreži ili master) i medijima iz biblioteke (po objavi ili po nalogu), pregled sa potpisanim URL-ovima i dostupnim radnjama, lista sa filterima i stranicama, izmena sa `version` (409 na zastarelu, odobrena/na odobrenju → nacrt), meko brisanje, dupliranje, istorija verzija (`post_versions` snimak pri svakoj izmeni).
- **Tok odobravanja** (`workflow.ts`): slanje na odobrenje (validacija sadržaja po mreži, red u `approvals`, obaveštenje approverima + email), povlačenje, odluka (`decide_post` RPC; komentar obavezan za odbijanje i izmene; obaveštenje autoru), zakazivanje (validacija, isti minut po nalogu → 409, događaj `post/target.scheduled` po targetu), „Objavi sada” (sledeći pun minut), otkazivanje zakazivanja, pauza/nastavak (istekao termin → poruka za ponovno zakazivanje), otkazivanje, vraćanje u nacrt.
- **Javni link** (`approval-links.ts`): token 32 bajta → SHA-256 u bazi, rok, broj upotreba, opoziv; javne rute za čitanje, odluku i komentar klijenta (30/min po IP-u); strana `/approve/[token]`.
- **Komentari** (`comments.ts`), **kalendar** i **red objava** (`calendar.ts`: objave i targeti u opsegu do 62 dana, zona brenda u odgovoru; termini po nalogu i danu, sledeći slobodan termin u zoni brenda bez sudara sa zakazanim).
- **Obaveštenja** (`src/services/notifications.ts`): redovi u `notifications` + email kroz Resend (`src/emails/notice.tsx`) kad je ključ podešen; primaoci po ulogama sa pristupom brendu.
- **API rute**: `GET/POST /api/posts`, `GET/PATCH/DELETE /api/posts/[id]`, `POST /api/posts/[id]/{submit,withdraw,approve,reject,request-changes,schedule,publish-now,unschedule,pause,resume,cancel,restore,duplicate,validate}`, `GET/POST /api/posts/[id]/comments`, `GET /api/posts/[id]/versions`, `GET/POST /api/approval-links`, `DELETE /api/approval-links/[id]`, `GET/POST /api/public/approvals/[token]`, `GET /api/calendar`, `GET/POST /api/queue-slots` (+ `?next=1`), `DELETE /api/queue-slots/[id]`, `GET /api/media`.
- **UI**: `/app/posts` (lista sa filterima po statusu), `/app/posts/new` i `/app/posts/[id]` (composer: naslov, master tekst, tekst po mreži, nalozi, biblioteka medija i upload, link, prvi komentar, termin u zoni brenda, radnje po ulozi, odluka sa komentarom, targeti, javni link, komentari, verzije), `/app/calendar` (mesečna mreža po zoni brenda, boje po statusu), `/approve/[token]` (klijent: pregled, odluka, komentar). Navigacija: Objave, Kalendar.
- **Testovi**: 4 unit (state machine) i 8 integracionih (editor pravi nacrt sa dva targeta; 409 na zastarelu verziju i snimci; editor ne zakazuje iz nacrta i ne odobrava; slanje na odobrenje sa obaveštenjem; javni link samo za objave na odobrenju, odluka klijenta bez komentara 400, zastarela verzija 409, izmene vraćaju u nacrt sa komentarom, opoziv linka 404; zakazivanje u prošlost 400, u budućnost sa događajem, izmena zakazane 409; isti minut 409 (K8) uz vraćanje targeta; pauza, nastavak, otkazivanje zakazivanja, otkazivanje, vraćanje, brisanje po ulozi; kalendar; komentari i red objava sa sledećim slobodnim terminom ponedeljkom u 09:30 po Beogradu).
- Napomena: događaji `post/target.scheduled` i `post/target.unscheduled` se šalju, a funkcija koja ih sluša (publisher sa `sleepUntil`, watchdog, asistirano objavljivanje) je faza 9b.

## Kako da testiraš (faza 9a)

1. `/app/accounts` mora da ima bar jedan aktivan nalog (ili ubaci red u `social_accounts` kao u testu) → `/app/posts/new`: tekst, nalozi, slika iz biblioteke (AI Studio ili Unsplash iz faze 7) → „Sačuvaj nacrt”.
2. Kao editor: „Pošalji na odobrenje” (greške po mreži se ispisuju). Kao vlasnik: na strani objave kartica „Odluka” → Odobri / Traži izmene / Odbij; ili „Napravi link” → otvori `/approve/<token>` u privatnom prozoru i odluči kao klijent.
3. „Zakaži” sa terminom u zoni brenda → status zakazano, target zakazan; isti minut na istom nalogu daje 409. „Pauziraj”, „Nastavi”, „Otkaži zakazivanje”. `/app/calendar` prikazuje termin.
4. Inngest dev server beleži događaje `post/target.scheduled` (bez funkcije do 9b).
5. `npm run test` (100), `npm run test:integration` (54), `npm run test:db` (24), `npm run test:e2e` (5).

## Kako da testiraš (faza 8a)

1. Napravi Meta app (tip Business), dodaj Facebook Login, u Valid OAuth Redirect URIs unesi `http://localhost:3001/api/integrations/meta/callback`, u `.env.local` `META_APP_ID` i `META_APP_SECRET`; u `feature_flags` uključi `platform.facebook` (i `platform.instagram` da IG ne bude asistiran).
2. `/app/accounts` → „Poveži Facebook i Instagram” → prijava i saglasnost → nazad u Sovu sa spiskom stranica i IG naloga → štikliraj → „Poveži izabrane”. Za minut se pojavi broj uvezenih objava (Inngest dev server mora da radi).
3. „Istorija objava” prikazuje poslednje objave sa brojem sviđanja i komentara; „Sinhronizuj” osvežava ime, avatar i token.
4. Deauthorize i data deletion URL-ove (`/api/webhooks/meta`, `/api/webhooks/meta/data-deletion`) unesi u App Dashboard kad sajt bude na javnom domenu.
5. `npm run test` (96), `npm run test:integration` (46), `npm run test:db` (24), `npm run test:e2e` (5).

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

- Netlify: popuniti `.env.netlify.local` i uvesti ga, podesiti Supabase Auth (adrese, SMTP preko Resend-a), obrisati staru funkciju jednom SQL linijom, sinhronizovati Inngest (DEPLOY.md 10).
- Stripe: cene pretplata napraviti u evrima (47 € mesečno, 277 € godišnje); kurs za admin statistiku menjati u `platform_settings.fx_usd_rates` kad se znatno promeni (D-099).
- Prave fotografije za landing (sada primeri sa Unsplash-a u `public/landing/`) i provera logotipa mreža prema brand kitovima pre lansiranja (D-098).
- Google OAuth klijent (`GOOGLE_CLIENT_ID/SECRET`) da se pojavi Google dugme; Resend ključ da pozivnice i obaveštenja idu emailom; Turnstile ključevi za zaštitu registracije u produkciji.
- `GEMINI_API_KEY` u `.env.local` (jedino što fali da AI Studio i AI profil brenda rade sa pravim modelom; prvi pravi poziv Brand Brain-a nad tangerineseo.rs proveriti zajedno, posebno `responseJsonSchema` sa većom šemom).
- Ćirilični i SPA sajt za ivične slučajeve B4 i B10 (predlog: jedan sajt na ćirilici koji poznaješ).
- `UNSPLASH_ACCESS_KEY` (developer aplikacija „sova”, demo plan) i Canva integracija (`CANVA_CLIENT_ID/SECRET`, redirect URL za localhost i sovaai.rs) da se faza 7 proveri uživo; tekst Unsplash production prijave stiže uz dizajn.
- Meta app (Business), test Facebook stranica sa povezanim Instagram Business nalogom, `META_APP_ID/SECRET`; kasnije Business Verification i App Review (scope-ovi iz INTEGRATIONS 3 i 4, screencast). Do App Review-a objavljivanje radi samo za uloge na app-u (test korisnici), zato je `assisted_only` fallback uključen kroz flagove.
- Adresa sedišta TangerineSEO LLC i merodavno pravo; email za privatnost na domenu sovaai.rs.
- GitHub → Settings → Code security: uključiti secret scanning.
- LinkedIn: aplikacija u Developer portalu sa proizvodima „Share on LinkedIn” i „Sign In with LinkedIn using OpenID Connect”, redirect `https://sovaai.rs/api/integrations/linkedin/callback` (i localhost:3001 za probu), `LINKEDIN_CLIENT_ID/SECRET`; za stranice prijava za Community Management API (firma, poslovni email, verifikovana stranica), za metrike ličnih objava formular za Member Post Analytics.
- TikTok: aplikacija u TikTok for Developers sa Login Kit-om (web) i Content Posting API-jem (Direct Post), redirect `https://sovaai.rs/api/integrations/tiktok/callback`, `TIKTOK_CLIENT_KEY/SECRET`; verifikacija domena medija (URL properties) za `PUBLIC_MEDIA_BASE_URL`; pa prijava za audit (do tada samo privatni nalozi i „Samo ja”).
- Za admin panel na produkciji: Supabase projekat sa HS256 JWT secretom dostupnim serveru (impersonacija, D-070) i `IMPERSONATION_SECRET` u Vercel env-u. Vaš email je u allowlist-i: posle registracije uključite TOTP u Podešavanja → Bezbednost.

## Poznati bagovi

- Nema poznatih. Ispravljeno u fazi 8c: otpremanje u editoru objave je vraćalo 400 (nedostajao `workspaceId`); traka „Vrati nacrt” se pojavljivala usred kucanja.
- Ispravljeno u fazi 11b: brisanje brenda iz Podešavanja i brisanje radnog prostora nisu radili (meko brisanje kroz RLS je vraćalo 403, a akcija je grešku prećutala); na dan prelaza na letnje ili zimsko vreme noćni termini su bili pomereni za sat (Beograd 01:00–02:00, Njujork 01:00–06:00); nacrt editora se vraćao posle čuvanja ako se čuvalo odmah posle kucanja.
- Ispravljeno u fazi 5: onboarding tipa „Jedan biznis” je padao na validaciji jer je prazno skriveno polje `brandName` stizalo kao prazan string (sad `parseForm` prazna polja tretira kao neuneta).

## Tehnički dug

- Tekstovi stranica faze 4 su na srpskom u kodu; selidba u next-intl poruke ide uz dizajn (faza 14) kad se ekrani finalizuju.
- Sentry `withSentryConfig` samo sa `SENTRY_DSN`; upload source mapa tek sa `SENTRY_AUTH_TOKEN`.
- CI pokreće samo unit testove; testovi baze i integracioni zahtevaju Supabase u CI-ju (faza 15).
- HEIC konverzija (WASM dekoder) još nije ugrađena: HEIC dobija poruku da se sačuva kao JPEG. Video se ne transkoduje (mreže primaju MP4/H.264 kakav jeste).
- Studio status posla kroz polling; Realtime pretplata uz dizajn (D-029).
- Brand kontekst bez profila i dalje pada na `brands.settings`; posle prve analize koristi profil i RAG.
- Firecrawl (SPA i Cloudflare sajtovi) nije ugrađen: takvi sajtovi dobijaju jasnu poruku i ručni unos (D-035). Realtime napredak analize ide kroz polling do faze 14 (tabela `website_crawls` je u publikaciji).
- Predlozi iz nedeljne provere se vide u Inbox-u (faza 10c), a obaveštenja kroz zvono (faza 9b).
- AI7 i AI9 pokriva kontrola kvaliteta Autopilota (faza 10c, D-065); ručni AI Studio još ne upozorava na sličnost, a embedding sličnost čeka kalibraciju praga.
- Composer još nema izbor stuba i kampanje (Autopilot i kalendar iz strategije ih upisuju); dodaje se uz dizajn ekrana (14b).
- Mesečni PDF izveštaj (`reports-monthly`) i grafikoni analitike stižu uz dizajn (D-062).
- Vizual Autopilota je šablon bez fotografije (D-068); Unsplash i AI slika kao opcija Autopilota kad budu ključevi.
- LinkedIn video i prvi komentar nisu ugrađeni; TikTok video čeka upload videa u medijima (provider i testovi su spremni).
- Admin pregled i AI troškovi su tabele; grafikoni stižu uz dizajn (faza 14). Audit CSV ima najviše 1.000 redova po izvozu (za više se sužava period).
