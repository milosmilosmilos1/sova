# Sova — napredak

Na početku svake sesije pročitaj ovaj fajl i [DECISIONS.md](DECISIONS.md). Režim rada: više faza zaredom bez potvrde po fazi (D-012).

## Stanje (23.10.2026)

| Faza                                     | Status      | Napomena                                                                                 |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| 1 Plan i arhitektura                     | gotovo      | odobreno 23.10.2026, odgovori u D-013                                                    |
| 2 Setup projekta                         | gotovo      | lokalno radi, health zelen, build prolazi, 25 unit testova, CI workflow napisan          |
| 3 Baza i bezbednost                      | gotovo      | 14 migracija, 53 tabele, RLS, RPC za tokene, trigeri, storage, seed; 24/24 testova baze  |
| 4 Auth i workspace                       | sledeće     | treba od vlasnika: Google OAuth klijent (opciono za DEV), Resend (opciono), Turnstile    |
| 5 Token engine i AI jezgro               | nije počelo | treba: GEMINI_API_KEY                                                                    |
| 6 Brand Brain                            | nije počelo | test sajt: tangerineseo.rs                                                               |
| 7 Vizuelni pipeline                      | nije počelo | treba: Unsplash ključ, Canva integracija                                                 |
| 8a–8d Integracije mreža                  | nije počelo | treba: app-ovi i prijave iz INTEGRATIONS 14                                              |
| 9a–9b Objave, kalendar, publisher        | nije počelo |                                                                                          |
| 10a–10c Strategija, analitika, Autopilot | nije počelo |                                                                                          |
| 11 Edge case-ovi                         | nije počelo |                                                                                          |
| 12 Plaćanje                              | nije počelo | Stripe nalog vlasnik pravi; preskače se do tada (D-001)                                  |
| 13a–13b Admin                            | nije počelo |                                                                                          |
| 14a–14c Dizajn                           | nije počelo | treba: screenshot Dribbble reference ako link ne radi                                    |
| 15 Testiranje                            | nije počelo |                                                                                          |
| 16 Deploy                                | nije počelo | treba: Vercel, Supabase staging/prod projekti, domen sovaai.rs, Upstash, Inngest, Sentry |

## Faza 2 — šta je urađeno

- Next.js 16.4.3, React 19.3, TypeScript strict, Tailwind v4 (`@tailwindcss/turbopack`), shadcn/ui stil `base-nova` (Base UI, ne Radix; `render` prop umesto `asChild`, vidi D-015), lucide ikone, next-themes.
- `src/lib/env.schema.ts` + `env.ts`: Zod validacija sa tri režima (prod, dev, build); `instrumentation.ts` uvozi env pri startu pa server ne kreće bez obaveznih varijabli. Modeli Gemini-ja samo kroz env sa podrazumevanim vrednostima iz D-002.
- `src/lib/api/`: `createHandler` (auth režimi none/cron/user/verified/admin, Zod za body/query/params, rate limit, Origin provera za mutacije, jedinstven odgovor `{ ok, data | error }` sa kodovima i porukama na srpskom), `ApiError`.
- `src/lib/logger.ts` (JSON, redakcija tajni), `src/lib/ratelimit.ts` (Upstash ili memorija u DEV, D-014), `src/lib/security/csp.ts` + `src/proxy.ts` (CSP sa nonce-om, request id, noindex za /admin), bezbednosni headeri u `next.config.ts`.
- Supabase klijenti (`server.ts`, `client.ts`, `admin.ts` sa `server-only`), tipizovani generisanim `src/types/database.ts`.
- Inngest v4: klijent, tipizovani događaji (`src/inngest/events.ts`, Zod šeme), `ping` funkcija, `/api/inngest`.
- next-intl bez rutiranja po jeziku: cookie `sova_locale`, poruke `sr-Latn` i `en`, tipizovane poruke.
- Stranice: landing, `/privacy`, `/terms`, `/data-deletion` (srpski + engleski sažetak, TangerineSEO LLC, sovaai.rs), placeholder `/login` i `/register`, `not-found`, `error`, `global-error`, `loading`. `AsyncState` komponenta za 4 stanja.
- `/api/health`: baza, Redis, Inngest, Gemini. Sentry opciono (samo sa DSN-om).
- Alati: Vitest 5 (`vitest.config.mts`), Prettier, ESLint + prettier config, husky pre-commit (gitleaks + lint-staged u grupama zbog Windows limita komandne linije), `.gitleaks.toml` izuzeci za test fixture-e, GitHub Actions CI (gitleaks, lint, typecheck, test, build).
- `.env.local` napravljen lokalno sa ključevima lokalnog Supabase-a i generisanim tajnama (nije u repou).

## Faza 3 — šta je urađeno

- 14 migracija u `supabase/migrations/` (vidi [SCHEMA.md](SCHEMA.md), sekcija „Odstupanja implementacije”): 53 tabele, 3 view-a bez tajnih kolona, 12 pomoćnih funkcija, RLS na svakoj tabeli, 13 RPC funkcija, 11 trigera, 4 storage bucket-a sa politikama, Realtime na 4 tabele.
- `supabase/seed.sql`: planovi (free, monthly, yearly, 3 top-up paketa), `platform_settings` (cene tokena, cene modela, dozvoljeni modeli, limiti, rate limit, maintenance), 15 feature flagova, praznici RS i globalni 2026–2027, admin allowlist sa emailom vlasnika.
- `scripts/test-db.mjs` (`npm run test:db`): 24 testa, svi prolaze: izolacija A/B nad 32 tabele, uloge, ograničen pristup brendu, token kolone nečitljive, paralelne rezervacije, idempotentna potvrda i grant, FIFO po isteku, append-only ledger, state machine objave sa optimističkim zaključavanjem, poslednji owner, zaštita profila, storage politike, brisanje korisnika kroz kaskadu, seed.
- `src/types/database.ts` generisan (`npm run db:types`).

## Kako da testiraš (faze 2 i 3)

1. Docker Desktop pokrenut → `npm run db:start` (prvi put vuče slike) → `npm run db:reset`.
2. `npm run dev` → http://localhost:3001 (landing), `/privacy`, `/terms`, `/data-deletion`, `/nepostoji` (404).
3. http://localhost:3001/api/health → `database: ok`, `redis: dev_fallback`, `inngest: not_configured` dok ne pokreneš `npm run inngest:dev` (onda `dev_fallback`), `gemini: not_configured` dok ne uneseš ključ.
4. `npm run test` (25 unit), `npm run test:db` (24 testa baze), `npm run typecheck`, `npm run lint`, `npm run build`.
5. Supabase Studio: http://127.0.0.1:54323 (tabele, politike), Mailpit za emailove: http://127.0.0.1:54324.

## Šta čeka vlasnika

- Pre faze 4 (nije blokirajuće za DEV): Google Cloud OAuth klijent (`GOOGLE_CLIENT_ID/SECRET`), Resend ključ i domen, Turnstile ključevi.
- Pre faze 5: nov `GEMINI_API_KEY`.
- Adresa sedišta TangerineSEO LLC i merodavno pravo za `src/config/company.ts` i Uslove; email za privatnost na domenu sovaai.rs (sad je gmail vlasnika).
- GitHub → Settings → Code security: uključiti secret scanning (repo je javan, opcija je besplatna).

## Poznati bagovi

- Nema poznatih.

## Tehnički dug

- `login` i `register` su placeholder strane do faze 4.
- Sentry `withSentryConfig` se primenjuje samo kad postoji `SENTRY_DSN`; source map upload tek sa `SENTRY_AUTH_TOKEN`.
- `vector_sova` kontejner lokalnog Supabase-a se restartuje (logovi), ne utiče na rad; pratiti posle sledećeg `supabase start`.
- `complete_upload` RPC iz plana odložen za fazu 7 (upload tok tada dobija magic-bytes proveru na serveru).
