# Sova — deploy (faza 11)

Kod je spreman: `npm run build` prolazi, svi testovi prolaze lokalno. Ostaje ono što traži tvoje naloge: Supabase projekat, Stripe, Vercel. Redosled ispod je takav da ništa ne radi "na pola".

## 1. Supabase produkcija (`sova-prod`)

1. supabase.com → New project → ime `sova-prod`, region Frankfurt (eu-central-1), jaka lozinka baze (sačuvaj je).
2. Lokalno, iz foldera projekta:
   ```
   npx supabase login
   npx supabase link --project-ref <ref iz URL-a projekta>
   npx supabase db push
   ```
   To primeni sve 4 migracije iz `supabase/migrations/` (tabele, RLS, funkcije, bucket-i).
3. Dashboard → Authentication → URL Configuration:
   - Site URL: `https://<tvoj-domen>`
   - Redirect URLs: `https://<tvoj-domen>/auth/callback`, `https://<tvoj-domen>/**`
4. Authentication → Providers → Email: **Confirm email: ON** (u produkciji tražimo potvrdu mejla).
5. Authentication → Emails → SMTP: podesi sopstveni SMTP (Resend, Postmark, SES). Bez toga Supabase šalje najviše par mejlova na sat i stižu u spam.
   - Resend: napravi nalog, verifikuj domen, API ključ; u Supabase SMTP: host `smtp.resend.com`, port 465, user `resend`, pass = API ključ, sender `Sova <noreply@tvoj-domen>`.
6. Settings → API: prepiši `Project URL`, `anon` (ili `sb_publishable_…`) i `service_role` (ili `sb_secret_…`) ključ. Idu u Vercel, nikad u repo.
7. Posle prvog deploya: registruj svoj nalog u aplikaciji, pa ga postavi za admina:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role> node scripts/make-admin.mjs tvoj@mejl.rs
   ```
   (ili u SQL editoru: `update public.profiles set role = 'admin' where email = 'tvoj@mejl.rs';`)

## 2. Stripe

Pre svega: Stripe ne otvara naloge za firme registrovane u Srbiji. Za test režim ovo ne smeta. Za live naplatu treba entitet u podržanoj zemlji (Stripe Atlas, EU firma) ili zamena koja je merchant of record (Paddle, Lemon Squeezy). Ako ideš na zamenu, `lib/stripe/` i webhook se menjaju, ostalo ne.

1. dashboard.stripe.com → Product catalog → dva proizvoda:
   - **Sova Monthly**: 39,00 USD, recurring monthly → prepiši `price_…` id.
   - **Sova Yearly**: 199,00 USD, recurring yearly → prepiši `price_…` id.
   Napravi ih i u Test i u Live režimu (ID-jevi su različiti).
2. Developers → API keys → `sk_test_…` (za Preview) i `sk_live_…` (za Production).
3. Developers → Webhooks → Add endpoint:
   - URL: `https://<tvoj-domen>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`
   - prepiši `whsec_…` (signing secret).
4. Settings → Customer portal: uključi otkazivanje, promenu plana (između Monthly i Yearly) i ažuriranje kartice. Dodaj linkove na `/terms` i `/privacy`.
5. Settings → Public details: ime, sajt, podrška. Stripe traži javne uslove korišćenja; `/terms` i `/privacy` su nacrt, pravnik da pregleda pre live-a.

Lokalni test webhook-a sa pravim test ključevima (umesto lažnih iz `.env.local`):
```
stripe login
stripe listen --forward-to localhost:3001/api/stripe/webhook   # ispiše whsec_… za .env.local
stripe trigger invoice.paid
```

## 3. Vercel

1. vercel.com → Add New → Project → Import `milosmilosmilos1/sova`. Framework: Next.js (prepozna sam). Root: `/`.
2. Settings → Environment Variables. Za **Production** i posebno za **Preview** (Preview koristi `sova-dev` ili lokalne vrednosti i Stripe test ključeve):

   | Promenljiva | Odakle |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://<tvoj-domen>` |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | isto |
   | `SUPABASE_SERVICE_ROLE_KEY` | isto, service role |
   | `GEMINI_API_KEY` | aistudio.google.com (rotiraj onaj iz chata) |
   | `GEMINI_TEXT_MODEL` | `gemini-3.6-flash` |
   | `GEMINI_TEXT_FALLBACK_MODEL` | `gemini-3.5-flash-lite` |
   | `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-image` |
   | `GEMINI_IMAGE_FALLBACK_MODEL` | `gemini-3.1-flash-lite-image` |
   | `STRIPE_SECRET_KEY` | `sk_live_…` / `sk_test_…` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` sa webhook endpointa |
   | `STRIPE_PRICE_MONTHLY` | `price_…` |
   | `STRIPE_PRICE_YEARLY` | `price_…` |
   | `IMPERSONATION_SECRET` | `openssl rand -hex 32` (drugačiji od DEV) |
   | `CRON_SECRET` | `openssl rand -hex 16`; Vercel ga sam šalje cron-u |

3. Deploy. Vercel čita `vercel.json`: cron `/api/cron/cleanup` svaki dan u 03:30 UTC.
4. Settings → Functions: proveri da je **Fluid Compute** uključen (podrazumevano za nove projekte). Rute za slike traže `maxDuration = 300`; na Hobby planu limit je 300 s uz Fluid Compute, pa staje. Ako build upozori na maxDuration, smanji na 300 u `app/api/generate/image/route.ts` i `photo/route.ts` (već je 300).
5. Domen: Settings → Domains → dodaj domen, DNS po uputstvu. Onda ažuriraj `NEXT_PUBLIC_APP_URL`, Supabase Site URL i Stripe webhook URL ako si prvo radio na `*.vercel.app`.
6. Google Gemini ključ: u Google konzoli ograniči ključ (API restrictions → Generative Language API) i postavi mesečni budžet.

## 4. Provera posle deploya

Redom, na pravom domenu:

1. `https://<domen>/api/health` → `{"ok":true,"db":"ok"}`.
2. Registracija → stiže mejl → klik → `/onboarding` → dashboard pokazuje 50 tokena.
3. Tekst za objavu → rezultat, stanje 48. Slika iz opisa → rezultat za ~1 min, stanje 40.
4. Podešavanja → Pretplata → Mesečni → Stripe Checkout (test kartica `4242 4242 4242 4242`) → `/billing/success` → za par sekundi stanje +500. U Stripe Dashboard → Webhooks: svi događaji 200.
5. Portal → otkaži → u Podešavanjima piše "Ističe <datum>".
6. Admin: `/admin` radi za tvoj nalog, 404 za drugi.
7. Cron: Vercel → Cron Jobs → Run → log pokazuje `{"stuckFailed":0,...}`.

## 5. Šta ostaje posle lansiranja

- Pravnik: `/terms` i `/privacy`.
- Monitoring: Vercel Logs + Supabase Logs; pogledaj `generations` sa `status = 'failed'` i `stripe_events` sa `status = 'failed'` jednom nedeljno (admin panel pokazuje neuspela generisanja).
- Backup: Supabase Pro plan ima dnevne backup-e; na Free planu uradi `supabase db dump` povremeno.
- Preview okruženje: ako hoćeš odvojen `sova-dev` hostovani projekat, isti postupak kao gore sa test Stripe ključevima; Vercel Preview env promenljive pokazuju na njega.
