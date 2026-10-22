# Sova

Web aplikacija za male biznise: slike i tekstovi za objave na društvenim mrežama.

Plan, arhitektura, tabele i rute: [PLAN.md](PLAN.md).

## Stek

Next.js 16 (App Router, TypeScript), Tailwind v4, Supabase (baza, auth, storage), Google Gemini, Stripe, Vercel.

## Pokretanje lokalno

Treba Node 20+ i Docker Desktop.

```
npm install
cp .env.example .env.local        # popuni ključeve
npx supabase start                # lokalna baza, auth, storage (Docker)
npx supabase status               # URL i ključevi za .env.local
npm run dev                       # http://localhost:3000
```

Provera Gemini ključa i modela:

```
node --env-file=.env.local scripts/check-gemini.mjs
```

Test baze (RLS, tokeni, rate limit, storage; pravi i briše dva test korisnika):

```
node --env-file=.env.local scripts/test-db.mjs
```

Posle promene migracija: `npx supabase db reset` pa `npx supabase gen types typescript --local > types/database.ts`.

Supabase Studio lokalno: http://127.0.0.1:54323. Mejlovi koje lokalni auth šalje: http://127.0.0.1:54324.

## Sredine

| | DEV | PROD |
|---|---|---|
| Baza | lokalni Supabase (Docker) ili `sova-dev` projekat | `sova-prod` projekat |
| Stripe | test ključevi | live ključevi |
| Env | `.env.local` | samo Vercel Production |

Migracije su u `supabase/migrations/` i iste se primenjuju na obe sredine.
