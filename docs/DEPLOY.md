# Sova — postavljanje na produkciju

Ovo je priprema. Ništa još nije pušteno: nema Vercel projekta, produkcijske baze ni domena. Dokument kaže šta treba otvoriti, koje vrednosti gde upisati i kako proveriti da sve radi. Redosled je bitan, jer kasniji koraci traže vrednosti iz ranijih. Odluke iza ovoga su u [DECISIONS.md](DECISIONS.md) (D-014, D-095, D-097), a stanje mreža i prijava u [INTEGRATIONS.md](INTEGRATIONS.md), sekcija 14.

## 0. Pre početka

- Tri okruženja sa potpuno odvojenim bazama i ključevima: lokalno, staging (Vercel Preview + poseban Supabase projekat) i produkcija (ARCHITECTURE 9).
- Ključevi iz razvoja se ne koriste na produkciji. Gemini ključ iz `.env.local` ostaje samo lokalno; za produkciju otvorite nov ključ na plaćenom nivou (veći limiti, podaci se ne koriste za treniranje).
- Vercel Hobby je samo za nekomercijalnu upotrebu, pa Sova ide na Pro.
- Sve tajne čuvajte u menadžeru lozinki. Nijedna ne ide u repo ni u poruku.

## 1. Nalozi i šta svaki daje

Aplikacija na produkciji ne startuje bez stavki označenih sa „da” (D-014). Mreže i Stripe su opcioni: bez ključa se ta mreža ne nudi, odnosno naplata je isključena.

| Servis                                       | Za šta                                         | Vrednosti za Vercel                                                                                                                                                                | Obavezno |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Vercel (Pro)                                 | hosting aplikacije                             | —                                                                                                                                                                                  | da       |
| Supabase (Pro, region Frankfurt)             | baza, prijava, skladište                       | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (samo ako projekat koristi HS256 ključ, za impersonaciju u adminu) | da       |
| Inngest Cloud                                | pozadinski poslovi i cron                      | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (Vercel integracija ih upisuje sama)                                                                                                    | da       |
| Upstash Redis (Frankfurt)                    | ograničenje broja zahteva i zaključavanja      | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                                               | da       |
| Resend                                       | email (potvrde, obaveštenja, mesečni izveštaj) | `RESEND_API_KEY`, `EMAIL_FROM` (podrazumevano `Sova <noreply@sovaai.rs>`)                                                                                                          | da       |
| Cloudflare Turnstile                         | zaštita registracije od botova                 | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                                                                                                           | da       |
| Google AI Studio (Gemini, plaćeni nivo)      | tekst, slike, analiza sajta                    | `GEMINI_API_KEY`                                                                                                                                                                   | da       |
| Unsplash                                     | fotografije za objave                          | `UNSPLASH_ACCESS_KEY`                                                                                                                                                              | da       |
| Pexels                                       | video i fotografije za objave (D-107)          | `PEXELS_API_KEY`                                                                                                                                                                   | ne       |
| Canva Connect                                | dizajn u Canvi                                 | `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`                                                                                                                                           | da       |
| Sentry                                       | prijava grešaka                                | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                                                                                        | ne       |
| Stripe                                       | naplata                                        | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_AUTOMATIC_TAX`                          | ne       |
| Meta, LinkedIn, TikTok, Google, Pinterest, X | povezivanje mreža                              | vidi `.env.example`, odeljak „Društvene mreže”                                                                                                                                     | ne       |

## 2. Tajne aplikacije (pravite ih sami)

Za staging i produkciju posebno:

```
TOKEN_ENCRYPTION_KEY = v1:<izlaz komande: openssl rand -base64 32>
CRON_SECRET          = <openssl rand -hex 32>
IMPERSONATION_SECRET = <openssl rand -hex 32>
```

`TOKEN_ENCRYPTION_KEY` šifruje tokene povezanih mreža. Ako se izgubi, svi korisnici moraju ponovo da povežu naloge. Rotacija bez gubitka je opisana u RUNBOOK 4.

## 3. Supabase (produkcija)

1. Nov projekat, region Frankfurt (`eu-central-1`), plan Pro (dnevne rezerve i vraćanje na trenutak u vremenu). Jaka lozinka baze, sačuvana u menadžeru lozinki.
2. GitHub, Settings → Environments → `production`: uključite obaveznog recenzenta (vi). U okruženje dodajte tajne `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens) i `SUPABASE_DB_PASSWORD`, i promenljivu `SUPABASE_PROJECT_REF` (ID projekta iz adrese). Isto za `staging` sa staging projektom.
3. GitHub, Actions → „Migracije (staging i produkcija)” → Run workflow: `target = production`, `dry_run = true`. Pregledajte spisak migracija u logu. Zatim ponovo sa `dry_run = false` i, samo prvi put, `include_seed = true` (planovi, podešavanja, praznici, admin lista). Ponovljen seed ne gazi vrednosti koje admin menja u aplikaciji.
4. Authentication → URL Configuration: Site URL `https://sovaai.rs`; Redirect URLs `https://sovaai.rs/auth/callback` (za staging njegova adresa).
5. Authentication → Emails → SMTP: preko Resend-a, prema njihovom uputstvu za Supabase (pošiljalac `noreply@sovaai.rs`). Potvrda emaila ostaje uključena.
6. Authentication → Providers → Google: Client ID i Secret iz Google Cloud-a; u Google Cloud-u dodajte authorized redirect URI koji Supabase prikaže (`https://<projekat>.supabase.co/auth/v1/callback`).
7. Authentication → Multi-Factor: TOTP uključen (admin panel traži drugi faktor).
8. Storage: bucketi nastaju iz migracija. Najveći dozvoljen fajl u podešavanjima projekta mora biti bar `MEDIA_MAX_VIDEO_MB` (podrazumevano 50 MB).

Vaš email je u admin listi iz seed-a; posle registracije na produkciji imate admin ulogu.

## 4. Vercel

1. Import GitHub repoa `milosmilosmilos1/sova`, framework Next.js, Node 22, produkcijska grana `main`.
2. Settings → Functions: region Frankfurt (`fra1`), da funkcije budu blizu baze. Fluid compute ostaje uključen; granice trajanja teških ruta su u kodu (`maxDuration`: Inngest 300 s, PDF i obrada medija do 120 s).
3. Settings → Environment Variables: posebno za Production i Preview. `NEXT_PUBLIC_APP_URL` je za Production `https://sovaai.rs`, a za Preview adresa staging-a. Indeksira se samo `sovaai.rs` (D-095), pa staging i pregledi sami dobijaju zabranu za pretragu.
4. Domains: `sovaai.rs` kao glavni, `www.sovaai.rs` preusmeren na njega.
5. Integracije: Inngest iz Vercel Marketplace-a (upisuje ključeve i sinhronizuje `https://sovaai.rs/api/inngest` posle svakog deploya); Sentry po želji.

## 5. DNS za sovaai.rs

- Zapisi za Vercel: tačno one vrednosti koje Vercel prikaže u Settings → Domains.
- Resend: SPF, DKIM i DMARC zapisi iz Resend → Domains. Dok domen nije verifikovan, emailovi ne odlaze.
- Verifikacije domena za mreže (TikTok „URL properties”, Meta, Google Search Console): TXT zapisi iz njihovih portala, redosled u INTEGRATIONS 14.

## 6. Adrese koje se upisuju kod provajdera (produkcija)

| Gde                            | Polje                                             | Adresa                                                        |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------- |
| Meta (Facebook i Instagram)    | Valid OAuth Redirect URI                          | `https://sovaai.rs/api/integrations/meta/callback`            |
| Meta                           | Deauthorize callback URL                          | `https://sovaai.rs/api/webhooks/meta`                         |
| Meta                           | Data Deletion Request URL                         | `https://sovaai.rs/api/webhooks/meta/data-deletion`           |
| LinkedIn                       | Authorized redirect URL                           | `https://sovaai.rs/api/integrations/linkedin/callback`        |
| TikTok                         | Redirect URI                                      | `https://sovaai.rs/api/integrations/tiktok/callback`          |
| TikTok                         | URL properties (domen za preuzimanje fotografija) | `sovaai.rs` ili domen iz `PUBLIC_MEDIA_BASE_URL`              |
| Google Cloud (YouTube)         | Authorized redirect URI                           | `https://sovaai.rs/api/integrations/youtube/callback`         |
| Google Cloud (poslovni profil) | Authorized redirect URI                           | `https://sovaai.rs/api/integrations/google_business/callback` |
| Pinterest                      | Redirect URI                                      | `https://sovaai.rs/api/integrations/pinterest/callback`       |
| X                              | Callback URI                                      | `https://sovaai.rs/api/integrations/x/callback`               |
| Canva                          | Redirect URL                                      | `https://sovaai.rs/api/integrations/canva/callback`           |
| Stripe                         | Webhook endpoint                                  | `https://sovaai.rs/api/webhooks/payments`                     |
| Inngest                        | App URL (sinhronizacija)                          | `https://sovaai.rs/api/inngest`                               |

Stripe webhook šalje ove događaje: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Tajna potpisa ide u `STRIPE_WEBHOOK_SECRET`.

Cene u Stripe-u se prave u evrima: proizvod „Sova” sa cenom 47 € mesečno i 297 € godišnje (D-105), a njihovi ID-jevi idu u `STRIPE_PRICE_MONTHLY` i `STRIPE_PRICE_YEARLY`. Dopune se u Stripe-u ne prave; aplikacija ih šalje sa iznosom i valutom iz tabele `plans` (D-099).

Za staging se iste putanje upisuju sa adresom staging-a, u test aplikacijama mreža.

## 7. Provera posle prvog deploya

Redom; svaka stavka zavisi od prethodnih:

1. `https://sovaai.rs/api/health` vraća `status: ok`. Detalje po servisu (baza, Redis, Inngest, Gemini) vidi admin platforme prijavljen sa TOTP-om (D-102).
2. `robots.txt`, `sitemap.xml` i slika za deljenje (RUNBOOK 6, „SEO posle deploya”); mapu prijavite u Search Console.
3. Registracija sa pravim emailom: stiže potvrda preko Resend-a, onboarding pravi radni prostor sa 50 tokena.
4. Admin panel `/admin` sa drugim faktorom.
5. Brand Brain nad pravim sajtom (na primer tangerineseo.rs).
6. AI tekst i slika u Studiju (troše tokene i Gemini kredit).
7. Inngest dashboard: aplikacija sinhronizovana i sve funkcije prisutne (publisher, metrike, Autopilot, naplata, mesečni izveštaj).
8. Prva mreža posle odobrenja aplikacije (Meta): povezivanje test strane, zakazana objava, objava stiže na mrežu.
9. Stripe u test režimu: Checkout prolazi, webhook u Stripe-u vraća 200, tokeni su dodeljeni.
10. Sentry: probna greška stiže (ako je podešen).
11. Analitika → „Napravi PDF”: izveštaj se preuzima.

## 8. Vraćanje unazad

- Aplikacija: Vercel → Deployments → Instant Rollback na prethodni deploy.
- Baza: migracije idu samo unapred. Greška u šemi se ispravlja novom migracijom (isti workflow); izgubljeni ili pokvareni podaci se vraćaju iz Supabase rezerve na trenutak u vremenu.
- Procureo ključ: odmah rotacija prema RUNBOOK 4 i zapis u dnevnik incidenata (RUNBOOK 7).

## 9. Bezbednost pre puštanja

- CI zelen na `main`: gitleaks, lint, typecheck, unit, baza i integracioni testovi, E2E sa proverom pristupačnosti.
- `SUPABASE_SERVICE_ROLE_KEY` postoji samo na serveru (`src/lib/supabase/admin.ts`); nijedna `NEXT_PUBLIC_` promenljiva nije tajna.
- Sigurnosna zaglavlja i CSP su u `next.config.ts` i `src/proxy.ts`; posle deploya proverite ih u alatkama pregledača (Network → Response headers).
- Ključevi koji su ikada bili u razvoju ne idu na produkciju.

## 10. Netlify (trenutni deploy, D-100)

Sajt `sovaai` (https://sovaai.netlify.app) i baza u postojećem Supabase projektu (Frankfurt) su napravljeni; migracije (do 026) i seed su pušteni. Od 29.10.2026 sajt radi u pregledu sa Supabase ključem i tri tajne aplikacije. Sajt radi u režimu pregleda (`SOVA_PREVIEW=true`, D-101): za početak su dovoljni korak 1a i adrese iz koraka 2 (Site URL i Redirect URLs), a ostali ključevi se dodaju kasnije.

1a. **Pregled**: Supabase secret key je dodat kao jedna promenljiva (`SUPABASE_SERVICE_ROLE_KEY`, „Contains secret values”). Tri tajne aplikacije su 29.10.2026 zamenjene novim jer su stare, uvezene bez oznake tajne, pročitane kroz Netlify konektor; nove su, sa Gemini ključem, uvezene iz privremenog fajla (sukob imena: „Update conflicts”), koji je posle obrisan. Iste vrednosti su u `.env.netlify.local`. Promenljive se ne listaju kroz konektor (`getAllEnvVars` vraća vrednosti koje nisu označene kao tajne).

Za punu produkciju:

1. **Ključevi**: popunite `.env.netlify.local` u korenu projekta (tri tajne aplikacije su već generisane), pa ceo fajl uvezite: Netlify → Project configuration → Environment variables → Add a variable → Import from a .env file, uz oznaku „Contains secret values”. Promenljive važe tek posle novog build-a: Deploys → Trigger deploy.
2. **Supabase → Authentication**: URL Configuration: Site URL `https://sovaai.netlify.app`, Redirect URLs `https://sovaai.netlify.app/**`. Emails → SMTP Settings: Resend (`smtp.resend.com`, port 465, korisnik `resend`, lozinka je Resend API ključ, pošiljalac `noreply@sovaai.rs` posle verifikacije domena u Resend-u); bez toga Supabase šalje potvrde samo članovima tima. Providers → Email: potvrda emaila uključena, lozinka najmanje 10 znakova.
3. **Supabase → SQL Editor**: `drop function if exists public.admin_adjust_tokens(uuid, integer, text, uuid);`
4. **Inngest**: urađeno 29.10.2026. Ključevi su u Netlify-ju; sinhronizacija posle deploy-a koji menja funkcije: `curl -X PUT https://sovaai.netlify.app/api/inngest` (ili Apps → Sync new app u Inngest-u).
5. **Turnstile**: domen `sovaai.netlify.app` (kasnije i `sovaai.rs`).
6. **Canva i mreže**: adrese iz odeljka 6 sa domenom `sovaai.netlify.app` dok sovaai.rs nije povezan.
7. **Kraj pregleda**: kad su svi ključevi uneti, obrišite `SOVA_PREVIEW` u Netlify-ju i pustite nov deploy; server tada opet traži sve ključeve.
8. **Domen sovaai.rs** kasnije: Netlify → Domain management → Add a domain, DNS kod SuperHosting-a, zatim `NEXT_PUBLIC_APP_URL=https://sovaai.rs` i nov deploy. Do tada sajt nosi `noindex` i ne ulazi u pretragu.

**Obaveštenja na telefonu (D-118)**: napravite par ključeva (`npx web-push generate-vapid-keys`) i dodajte `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY` u Netlify (privatni ključ kao tajnu), pa nov deploy. Bez njih kartica na početnoj nudi samo instalaciju.

**Inbox i DM automatizacija (D-117)** su iza prekidača `inbox`. Za probu na jednom radnom prostoru pre odobrenja Mete: `insert into feature_flags (key, enabled, description, rollout) values ('inbox', false, 'Inbox i DM automatizacija', '{"workspaces": ["<id radnog prostora>"]}') on conflict (key) do update set rollout = excluded.rollout;`, zatim u Meta konfiguraciji prijave dodati `pages_manage_engagement`, `pages_messaging` i `instagram_manage_messages` i ponovo povezati nalog. Za sve korisnike: posle App Review-a `update feature_flags set enabled = true where key = 'inbox';`. Posao `inbox-sync` traži Inngest sinhronizaciju posle deploy-a.

**Limit od 30 sekundi (D-122)**: Netlify prekida svaki zahtev posle 30 sekundi, i rute i Inngest korake (`export const maxDuration` u ruti se ne poštuje). Prekinut zahtev u logu je 502 ili 504 sa trajanjem oko 30,2 s (Netlify konektor → observability → `get-request-logs` sa filtrom `URL = /api/inngest`). Posao koji može da traje duže deli se na Inngest korake od kojih nijedan ne prelazi oko 15 sekundi; tako rade mesečni plan i tokovi (slajdovi po tri u koraku).

Build počinje proverom env-a (`npm run check:env`, D-103). Ako fali obavezna promenljiva, build pada sa njenim imenom u logu, a živi sajt ostaje na prethodnom deploy-u. Kad prođe, log pokazuje koji servisi su podešeni.

Novi deploy iz čiste kopije (bez `.env` fajlova): `git archive HEAD | tar -x -C /c/Temp/sova-deploy` (git worktree na dugoj putanji pada), pa u tom folderu komanda koju daje Netlify konektor (`npx -y @netlify/mcp@latest --site-id … --proxy-path …`). Kad se GitHub repo poveže sa sajtom (Netlify → Build & deploy → Link repository), svaki push na `main` gradi sajt sam.
