# Sova — runbook

Skelet u fazi 1. Svaka faza dopunjava svoju sekciju. Ništa odavde još nije isprobano jer koda nema.

## 1. Lokalno pokretanje (popunjava faza 2)

Preduslovi: Node 20.9+, Docker Desktop (za Supabase CLI), Git.

```
npm install
cp .env.example .env.local        # pa unesi vrednosti
npx supabase start                 # lokalni Postgres, Auth, Storage, Studio na :54323
npx supabase db reset              # migracije + seed
npm run dev                        # Next.js na http://localhost:3001
npx inngest-cli@latest dev         # Inngest dev server na :8288, sam nalazi /api/inngest
```

Pre prvog `supabase start` na ovoj mašini obrisati stare volumene: `docker volume ls | grep -i supabase` pa `docker volume rm` za one sa sufiksom „Social Media Automatizacija”.

Provera: `GET http://localhost:3001/api/health` vraća `ok: true` za bazu, Redis, Inngest i Gemini.

## 2. Testovi (popunjavaju faze 3–15)

```
npm run lint && npm run typecheck
npm run test            # Vitest unit + integracioni (traži pokrenut lokalni Supabase)
npm run test:db         # RLS i RPC testovi
npm run test:e2e        # Playwright
```

## 3. Migracije

- Nova migracija: `npx supabase migration new <naziv>`; pisati unazad kompatibilno (expand → migrate → contract).
- Lokalno: `npx supabase db reset`. Tipovi: `npm run db:types` (generiše `src/types/database.ts`).
- Staging i prod: kroz GitHub Actions posle tvog odobrenja (ručni `workflow_dispatch`), nikad ručno iz lokalne mašine.

## 4. Rotacija ključeva (popunjava faza 5)

- `TOKEN_ENCRYPTION_KEY`: dodati `v2:` ključ, deploy, pokrenuti `scripts/reencrypt-tokens.ts`, ukloniti `v1` kad nema redova sa `key_version = 1`.
- Gemini, Unsplash, Canva, mreže: zameniti u Vercel env, redeploy; stare vrednosti opozvati kod provajdera.
- Supabase service role: rotirati u dashboardu, ažurirati Vercel i Inngest.
- Ako ključ procuri: rotirati odmah, pregledati `admin_audit_log` i Sentry za neobične zahteve, zapisati incident u sekciju 7.

## 5. Deploy (popunjava faza 16)

Vercel: `main` → Production, PR → Preview. Checklista pre lansiranja je u ARCHITECTURE 9 i brifu 19.2.

## 6. Incidenti (popunjavaju faze 9, 12, 16)

- **Objave kasne**: proveriti Inngest dashboard (zaostali run-ovi), `select count(*) from post_targets where status='scheduled' and scheduled_at < now() - interval '3 minutes'`, watchdog logove; ako je Inngest nedostupan, ručno `POST /api/admin/publish-monitor/retry`.
- **Mreža vraća 401 masovno**: admin feature flag `platform.<mreža>` isključiti, obavestiti korisnike bannerom, proveriti promenu API verzije.
- **Dupli tokeni ili ledger ne štima**: `select workspace_id, sum(delta) from token_ledger group by 1` naspram `sum(amount - remaining)` grantova; razlika znači bag u RPC-u, ne popravljati ručno bez zapisa.
- **Webhook plaćanja ne stiže**: provajderov dashboard → ponovno slanje; `payment_events` UNIQUE garantuje da ponovljeno slanje ne duplira.
- **Gemini pad**: circuit breaker preskače model 5 min; ako traje, admin u `platform_settings.allowed_models` menja primarni model bez deploya.

## 7. Dnevnik incidenata

Još nema.
