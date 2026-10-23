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

Provera: http://localhost:3001/api/health vraća `status: ok`; `database: ok`.

Zamke:

- Stari Supabase kontejneri drugog projekta na istim portovima: `docker ps -a | grep supabase`, pa `docker rm -f` i `docker volume rm` pre `db:start`.
- Dva `supabase start` istovremeno se sudaraju oko imena kontejnera; pokreni samo jedan.
- Port 3000 drži drugi projekat; Sova je na 3001 (D-011).

## 2. Testovi

```
npm run lint && npm run typecheck
npm run test            # Vitest unit (25)
npm run test:db         # RLS, RPC, trigeri nad lokalnim Supabase-om (24); pravi i briše test korisnike
npm run build           # produkcijski build
```

## 3. Migracije

- Nova migracija: `npx supabase migration new <naziv>` → fajl u `supabase/migrations/`. Do lansiranja se postojeće migracije menjaju u mestu i radi se `db:reset`; posle lansiranja samo nove migracije, unazad kompatibilne (expand → migrate → contract).
- Posle promene šeme: `npm run db:reset`, `npm run test:db`, `npm run db:types` (regeneriše `src/types/database.ts`), `npm run typecheck`.
- Security definer funkcije: `revoke all ... from public, anon, authenticated` pa `grant execute ... to service_role` (Supabase podrazumevano daje EXECUTE svim ulogama).
- Staging i prod: kroz GitHub Actions posle odobrenja vlasnika (dodaje se u fazi 16), nikad `db push` sa lokalne mašine na prod.

## 4. Rotacija ključeva

- `TOKEN_ENCRYPTION_KEY`: dodaj `v2:` ključ u env, deploy, pokreni skriptu za reenkripciju (faza 5), ukloni `v1` kad nema redova sa `key_version = 1`.
- Gemini, Unsplash, Canva, mreže: zameni u Vercel env, redeploy, stari ključ opozovi kod provajdera.
- Supabase service role: rotiraj u dashboardu, ažuriraj Vercel i Inngest.
- Ako ključ procuri: rotiraj odmah, pregledaj `admin_audit_log`, Sentry i logove za neobične zahteve, zapiši incident u sekciju 7.

## 5. Deploy

Faza 16. Vercel: `main` → Production, PR → Preview. Checklista u ARCHITECTURE 9 i brifu 19.2.

## 6. Incidenti

- **Objave kasne**: Inngest dashboard (zaostali run-ovi), `select count(*) from post_targets where status='scheduled' and scheduled_at < now() - interval '3 minutes'`, logovi watchdog-a; ručni retry iz admin monitora (faza 13).
- **Mreža vraća 401 masovno**: isključi feature flag `platform.<mreža>`, banner korisnicima, proveri promenu API verzije.
- **Dupli tokeni ili ledger ne štima**: `select workspace_id, sum(delta) from token_ledger group by 1` naspram `sum(amount - remaining)` iz `token_grants`; razlika je bag u RPC-u, ne popravljati ručno bez zapisa.
- **Webhook plaćanja ne stiže**: provajderov dashboard → ponovno slanje; `payment_events (provider, event_id)` UNIQUE sprečava dupliranje.
- **Gemini pad**: circuit breaker preskače model 5 min; ako traje, admin u `platform_settings.allowed_models` menja primarni model bez deploya.

## 7. Dnevnik incidenata

Još nema.
