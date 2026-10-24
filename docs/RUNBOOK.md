# Sova — runbook

Provereno 23.10.2026 na Windows 11 (Git Bash), Node 24, Docker Desktop.

## 1. Lokalno pokretanje

Preduslovi: Node 20.9+ (koristi se 24), Docker Desktop, Git, gitleaks (`winget install Gitleaks.Gitleaks`).

```
npm install
cp .env.example .env.local        # pa unesi vrednosti (vidi dole)
npm run db:start                   # lokalni Supabase: API :54321, DB :54322, Studio :54323, Mailpit :54324
npm run db:reset                   # migracije + seed
npm run dev                        # Next.js na http://localhost:3001
npm run inngest:dev                # Inngest dev server na :8288 (poseban terminal)
```

Vrednosti za `.env.local` lokalnog Supabase-a: `npx supabase status -o env` (ANON_KEY → NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE_ROLE_KEY → SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET → SUPABASE_JWT_SECRET). Tajne: `openssl rand -base64 32` za TOKEN_ENCRYPTION_KEY (sa prefiksom `v1:`), `openssl rand -hex 32` za CRON_SECRET i IMPERSONATION_SECRET.

Mreže iz faze 8b: `LINKEDIN_CLIENT_ID/SECRET`, `LINKEDIN_PAGES` i `LINKEDIN_MEMBER_ANALYTICS` (`true` tek kad LinkedIn odobri Community Management API odnosno Member Post Analytics), `TIKTOK_CLIENT_KEY/SECRET`, `PUBLIC_MEDIA_BASE_URL` (domen verifikovan u TikTok portalu; prazno = adresa aplikacije). Lokalno TikTok ne može da preuzme fajl sa localhost-a, pa foto objava traži javni tunel ili staging.

Google poslovni profil i YouTube (faza 8c): isti `GOOGLE_CLIENT_ID/SECRET` kao Google prijava; u Google Cloud konzoli dodati redirect URI-je `{APP}/api/integrations/google_business/callback` i `{APP}/api/integrations/youtube/callback`. Flagovi `platform.google_business` i `platform.youtube` u admin panelu uključuju povezivanje. Dok je OAuth ekran u režimu „Testing”, Google refresh token ističe za 7 dana.

Mediji (faza 8c): `MEDIA_MAX_VIDEO_MB` (podrazumevano 50) je najveći video u biblioteci. Supabase besplatan plan ne prima fajl veći od 50 MB bez obzira na ovu vrednost; na Pro planu podići i „Upload file size limit” u Storage podešavanjima projekta. Pregledač otprema pravo u skladište, pa `NEXT_PUBLIC_SUPABASE_URL` mora biti dostupan iz pregledača (CSP `connect-src` ga već dozvoljava).

Provera: http://localhost:3001/api/health vraća `status: ok`; `database: ok`.

Demo nalog za pregled ekrana: `npm run demo:seed` pravi `demo@sova.local` (lozinka iz `DEMO_PASSWORD` ili nasumična, ispisuje se samo u konzoli), radni prostor „Sova demo” sa lažnim Facebook i Instagram nalogom (asistirano objavljivanje, ništa ne ide na prave mreže), aktivnom strategijom, 20 objavljenih objava sa metrikama, nacrtima Autopilota, uvidima, predlozima i obaveštenjima. Ponovno pokretanje briše prethodni demo. Skripta odbija Supabase URL koji nije localhost. Lokalni mejlovi (potvrda registracije, pozivnice) stižu u Mailpit na http://localhost:54324, ne u pravi sandučić. `npm run db:reset` briše i demo i sve lokalne naloge.

Isti `demo:seed` pravi i lokalnog admina `admin@sova.local` (kroz `platform_admin_allowlist`, kao u produkciji) sa uključenim TOTP-om; lozinka i TOTP tajna se ispisuju samo u konzoli. Admin panel traži kod potvrđen u sesiji: Podešavanja → Bezbednost → kod iz aplikacije za kodove ili `npm run demo:totp -- <tajna>`, pa `/admin`.

Zamke:

- Stari Supabase kontejneri drugog projekta na istim portovima: `docker ps -a | grep supabase`, pa `docker rm -f` i `docker volume rm` pre `db:start`.
- Dva `supabase start` istovremeno se sudaraju oko imena kontejnera; pokreni samo jedan.
- Port 3000 drži drugi projekat; Sova je na 3001 (D-011).
- `npm run build` i `npm run dev` dele `.next`: build dok dev radi daje 500 na svim stranama, a dev pokrenut preko ostataka builda (`BUILD_ID`, `build-manifest.json` pored `.next/dev`) ulazi u beskonačnu Fast Refresh petlju (strana se ponovo učitava svake sekunde, E2E pada na „waiting for navigation”). Postupak: zaustavi dev → `npm run build` → `rm -rf .next` → `npm run dev`.
- Native dodaci (`@resvg/resvg-js`, `sharp`) su u `serverExternalPackages`; nov paket sa `.node` fajlom dodaj tamo, inače Turbopack build pada sa „non-ecmascript placeable asset”.

## 2. Testovi

```
npm run lint && npm run typecheck
npm run test            # Vitest unit (178)
npm run test:db         # RLS, RPC, trigeri nad lokalnim Supabase-om (30); pravi i briše test korisnike
npm run test:integration # API rute u procesu nad lokalnim Supabase-om; Gemini, lažni sajt, Unsplash, Canva, Meta Graph, LinkedIn i TikTok kroz MSW (148)
npm run test:e2e        # Playwright kroz Mailpit (6); traži pokrenut dev server; posle brisanja .next prvi run traje oko 2 min
npx tsx scripts/crawl-smoke.ts https://tangerineseo.rs 25   # živi crawler bez baze i AI-ja
npm run build           # produkcijski build
```

## 3. Migracije

- Nova migracija: `npx supabase migration new <naziv>` → fajl u `supabase/migrations/`. Do lansiranja se postojeće migracije menjaju u mestu i radi se `db:reset`; posle lansiranja samo nove migracije, unazad kompatibilne (expand → migrate → contract).
- Posle promene šeme: `npm run db:reset`, `npm run test:db`, `npm run db:types` (regeneriše `src/types/database.ts`), `npm run typecheck`.
- Bez brisanja lokalnih podataka (demo nalozi): `npx supabase migration up --local` primenjuje samo nove migracije; posle toga `npm run db:types`. Ispravka već primenjene migracije ide novom migracijom ili ručno kroz `psql`, jer `migration up` ne ponavlja zabeleženu verziju.
- Novi strani ključ sa `ON DELETE CASCADE` ili `SET NULL` piše se kao `DEFERRABLE INITIALLY DEFERRED` (D-079), inače brisanje naloga može da padne usred kaskade.
- Append-only tabele (`admin_audit_log`, `token_ledger`, `publish_attempts`, `post_versions`, `approvals`) se ne menjaju ni u migraciji; jedini izuzetak je popuna nove kolone uz privremeno isključen okidač (primer: migracija 019).
- Security definer funkcije: `revoke all ... from public, anon, authenticated` pa `grant execute ... to service_role` (Supabase podrazumevano daje EXECUTE svim ulogama).
- Staging i prod: kroz GitHub Actions posle odobrenja vlasnika (dodaje se u fazi 16), nikad `db push` sa lokalne mašine na prod.

## 4. Rotacija ključeva

- `TOKEN_ENCRYPTION_KEY`: nov ključ ide u `TOKEN_ENCRYPTION_KEY` kao `v2:<base64>`, stari u `TOKEN_ENCRYPTION_KEY_PREVIOUS` (`v1:...`), deploy; `src/lib/crypto/tokens.ts` dešifruje po `key_version` zapisa, a svaki nov upis koristi v2. Skripta za ponovno šifrovanje postojećih redova (`canva_connections`, od faze 8 `social_accounts`) stiže uz fazu 8; kad nema redova sa `key_version = 1`, ukloni `_PREVIOUS`.
- Canva: ako korisnik opozove pristup u Canvi, sledeći refresh vraća `invalid_grant` i veza prelazi u `needs_reauth`; korisnik je ponovo povezuje iz podešavanja.
- Gemini, Unsplash, Canva, mreže: zameni u Vercel env, redeploy, stari ključ opozovi kod provajdera.
- Supabase service role: rotiraj u dashboardu, ažuriraj Vercel i Inngest.
- Ako ključ procuri: rotiraj odmah, pregledaj `admin_audit_log`, Sentry i logove za neobične zahteve, zapiši incident u sekciju 7.

## 5. Deploy

Faza 16. Vercel: `main` → Production, PR → Preview. Checklista u ARCHITECTURE 9 i brifu 19.2.

## 6. Incidenti

- **Objave kasne**: `publish-watchdog` (cron 5 min) sam ponovo šalje događaj za target koji kasni > 3 min (`last_error_code = WATCHDOG_RESENT`, najviše jednom u 10 min) i posle 15 min šalje alarm vlasnicima; proveri `select id, status, scheduled_at, last_attempt_at, attempt_count, last_error_code from post_targets where status in ('scheduled','publishing') and scheduled_at < now() - interval '3 minutes'`, Inngest dashboard (run `publish-target` po `targetId`) i log `publish_watchdog_alarm`. Ručni nastavak: dugme „Pokušaj ponovo” na objavi (`failed`/`needs_reauth`).
- **Target zaglavljen u `publishing`**: watchdog ga posle 30 min bez pokušaja vraća u `scheduled` i ponovo šalje događaj; publisher pre novog slanja proverava kod mreže da li je objava već prošla (`findExistingPost`). Ručno (service role): `update post_targets set status='scheduled' where id='…'` pa dugme „Pokušaj ponovo”.
- **Mreža odbija objave masovno (kvota, 5xx)**: `select error_code, count(*) from publish_attempts where started_at > now() - interval '1 hour' group by 1`; kvota pomera termin za 24 h (obaveštenje `post_rescheduled`), 5xx troši 3 pokušaja (1/5/15 min) pa `failed`.
- **Metrike ne stižu**: `select target_id, horizon, captured_at from post_metrics_snapshots where target_id = '…'`; Inngest run `post-metrics` po `targetId` (spava do sledećeg horizonta); `social-account-metrics` u 04:00 UTC (log `account_metrics_sweep`). Meta insights za nove objave kasne do ~1 h i za stranice ispod 100 pratilaca mogu biti prazni; dugme „Osveži” na analitici upisuje snimak `adhoc`.
- **Uvidi se ne prave**: treba bar 3 objave sa metrikama u periodu (log `weekly_insights`, `ai_generations` tip `insights`); bez `GEMINI_API_KEY` generacija pada sa porukom.
- **Autopilot nije napravio nacrte**: `select kind, period_start, status, summary, tokens_used from autopilot_runs where brand_id = '…' order by created_at desc`; razlog piše u `summary.reason` (nivo 0, pauziran brend, nema aktivne strategije, budžet). Ponovni prolaz za istu nedelju: obriši red za tu nedelju u `autopilot_runs` (service role) i klikni „Pripremi narednu nedelju sada”.
- **Autopilot troši previše**: `select sum(tokens_charged) from ai_generations where brand_id = '…' and input->>'autopilot' = 'true' and created_at >= date_trunc('month', now())`; budžet se menja na `/app/autopilot`, „Pauziraj sve” zaustavlja odmah.
- **Nacrti vraćeni na doradu**: `select id, qa_report from posts where source = 'autopilot' and status = 'draft' and qa_report->>'passed' = 'false'`; najčešće zabranjena reč, brojka koje nema u profilu ili sličnost sa ranijom objavom.
- **Asistirani targeti stoje danima**: `select t.id, t.post_id, a.name from post_targets t join social_accounts a on a.id = t.social_account_id where t.status = 'assisted_pending'`; podsetnik stiže sa fazom 11.
- **LinkedIn veze ističu**: token traje 60 dana; bez programskog refresh-a vlasnici dobijaju obaveštenje 7 dana ranije, a posle isteka nalog je `needs_reauth`. Spisak: `select id, name, token_expires_at, refresh_token_enc is not null as ima_refresh from social_accounts where platform = 'linkedin' order by token_expires_at`. Ponovno povezivanje bez ekrana za saglasnost radi dok je korisnik prijavljen na LinkedIn i token još važi.
- **TikTok odbija objave**: `unaudited_client_can_only_post_to_private_accounts` (aplikacija nije prošla audit: samo privatni nalozi i „Samo ja”), `url_ownership_unverified` (domen iz `PUBLIC_MEDIA_BASE_URL` nije verifikovan u URL properties), `spam_risk_too_many_posts` (dnevni limit naloga, publisher pomera za 24 h), `privacy_level_option_mismatch` (korisnik je promenio privatnost naloga; bira ponovo u objavi). `fail_reason` iz statusa je u `last_error_message`.
- **TikTok objava bez linka**: dok moderacija traje `external_post_id` je `publish:{id}`; povlačenje metrika ga zameni pravim ID-jem. Ako ostane danima: `select id, external_post_id from post_targets where platform = 'tiktok' and external_post_id like 'publish:%'`.
- **Javni URL medija vraća 404**: token je istekao (2 h), medij je obrisan ili je promenjen `TOKEN_ENCRYPTION_KEY` (ključ potpisa se izvodi iz njega). Publisher pravi nov URL pri svakom pokušaju.
- **Mreža vraća 401 masovno**: isključi feature flag `platform.<mreža>`, banner korisnicima, proveri promenu API verzije (`META_GRAPH_VERSION` u env-u; promena bez deploya koda).
- **Nalozi prelaze u `needs_reauth`**: `select platform, status, status_reason, last_error, refresh_token_expires_at from social_accounts where status <> 'active'`; Meta korisnički token traje 60 dana i `social-token-refresh` ga produžava dnevno; ako je korisnik promenio lozinku ili uklonio aplikaciju, ponovo povezuje iz `/app/accounts`.
- **Meta webhook ne prolazi**: `signed_request` se proverava `META_APP_SECRET`-om iste aplikacije; pogrešna tajna daje 403. Data deletion mora da vrati čist JSON `{url, confirmation_code}` (ruta to radi mimo `ok/data` omotača).
- **Dupli tokeni ili ledger ne štima**: `select workspace_id, sum(delta) from token_ledger group by 1` naspram `sum(amount - remaining)` iz `token_grants`; razlika je bag u RPC-u, ne popravljati ručno bez zapisa.
- **Webhook plaćanja ne stiže**: provajderov dashboard → ponovno slanje; `payment_events (provider, event_id)` UNIQUE sprečava dupliranje.
- **Gemini pad**: circuit breaker preskače model 5 min; ako traje, Admin → Platforma → AI modeli: izaberi drugi model sa dozvoljene liste (važi za najviše minut, bez deploya). Nov model se prvo dodaje u `platform_settings.allowed_models`.
- **Analiza sajta visi**: `select id, status, phase, progress->>'message', started_at from website_crawls where status in ('queued','running')`; Inngest dashboard → run `brand-analyze` po `crawlId`. Otkazivanje iz UI-ja šalje `brand/analyze.canceled` i vraća tokene; ručno: `update website_crawls set status='canceled', finished_at=now()` pa `release_reservation` za `ai_generations.token_reservation_id`.
- **Vlasnik sajta se žali na SovaBot**: User-Agent je `SovaBot/1.0 (+https://sovaai.rs/bot)`; bot čita samo sajtove koje je korisnik uneo, poštuje robots.txt i Crawl-delay, najviše 60 strana po analizi i nedeljnu proveru sitemap/RSS. Blokada: `User-agent: SovaBot` / `Disallow: /`. Proveri `website_crawls` po `url` da vidiš ko je pokrenuo.
- **Lažno pozitivna SSRF blokada**: `assertPublicHost` odbija domen ako bilo koja A/AAAA adresa padne u privatni opseg; proveri `nslookup` i, ako je sajt iza CDN-a sa javnim adresama, prijavi kao bag (ne dodavati izuzetke bez pregleda).

- **Zahtev za podacima ili brisanjem stiže emailom**: korisnik sam izvozi i briše nalog u Podešavanja → Privatnost i podaci (D-080). Ako ne može da se prijavi: potvrdi identitet sa adrese naloga, pa Admin → Korisnici → Brisanje naloga (kucanje emaila). Izvoz u ime korisnika nije ugrađen; u izuzetnom slučaju korisnik privremeno vraća pristup kroz reset lozinke.
- **Brisanje naloga vraća 409**: korisnik je vlasnik radnog prostora sa drugim članovima; prenosi vlasništvo na strani Tim (ili ga uklanja iz tima), pa briše nalog.

## 7. Dnevnik incidenata

Još nema.

## 8. Admin pristup i impersonacija

- **Ko je admin**: samo email koji je u `platform_admin_allowlist` u trenutku registracije (ili seed); uloga se ne menja iz aplikacije. Nov admin na produkciji: insert u allowlist kroz SQL editor uz zapis u sekciji 7, pa registracija. Za postojeći nalog: `update profiles set platform_role = 'platform_admin' where email = '…'` (service role), takođe uz zapis.
- **Pristup**: TOTP je obavezan i potvrđuje se u svakoj sesiji (AAL2). Izgubljen telefon: Supabase dashboard → Authentication → korisnik → obriši MFA faktor, admin ga ponovo uključuje u Podešavanja → Bezbednost.
- **Impersonacija**: detalj korisnika → razlog (najmanje 10 znakova) → „Gledaj kao”. Read-only je podrazumevan; pun režim traži kucanje emaila korisnika. Traje najviše 30 minuta; izlaz dugmetom „Izađi” ili odjavom. Sesije: `select id, admin_id, user_id, mode, started_at, expires_at, ended_at, end_reason from impersonation_sessions order by started_at desc limit 20`; zahtevi jedne sesije: `select created_at, after from admin_audit_log where impersonation_session_id = '…' order by id`.
- **Impersonacija ne radi** (traka se ne pojavljuje, admin vidi svoje podatke): proveri `SUPABASE_JWT_SECRET` (HS256 secret projekta), `IMPERSONATION_SECRET` (najmanje 32 znaka) i da je TOTP potvrđen u sesiji. Log `impersonation_audit_failed` znači da upis u audit ne prolazi; tada impersonacija namerno ne radi (fail closed).
- **Hitno gašenje svih impersonacija**: `update impersonation_sessions set ended_at = now(), end_reason = 'revoked' where ended_at is null` (service role); rotacija `IMPERSONATION_SECRET` poništava sve cookie-je odjednom.
- **Audit**: Admin → Audit log → filteri → „Izvezi CSV” (najviše 1.000 redova; za više suzi period). Zapisi se ne menjaju i ne brišu, ni kad se nalog admina ili korisnika obriše (D-075).
- **Blokada i brisanje**: blokada zaključava profil i Auth nalog i briše sesije, pa izdati tokeni odmah prestaju da važe. Brisanje naloga traži kucanje emaila; vlasnik tima sa drugim članovima prvo prenosi vlasništvo (409).
