# Sova — napredak

Na početku svake sesije pročitaj ovaj fajl i [DECISIONS.md](DECISIONS.md). Režim rada: više faza zaredom bez potvrde po fazi (D-012).

## Stanje (23.10.2026)

| Faza                                     | Status      | Napomena                                                                                                                  |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1 Plan i arhitektura                     | gotovo      | odobreno 23.10.2026, odgovori u D-013                                                                                     |
| 2 Setup projekta                         | gotovo      | lokalno radi, health zelen, build prolazi, 25 unit testova, CI workflow                                                   |
| 3 Baza i bezbednost                      | gotovo      | 14 migracija, 53 tabele, RLS, RPC za tokene, trigeri, storage, seed; 24/24 testova baze                                   |
| 4 Auth i workspace                       | gotovo      | registracija, prijava, magic link, Google (uz ključeve), reset, MFA, workspace, tim, admin gate; 10 integracionih testova |
| 5 Token engine i AI jezgro               | sledeće     | treba: GEMINI_API_KEY; bez njega rade mock testovi                                                                        |
| 6 Brand Brain                            | nije počelo | test sajt: tangerineseo.rs                                                                                                |
| 7 Vizuelni pipeline                      | nije počelo | treba: Unsplash ključ, Canva integracija                                                                                  |
| 8a–8d Integracije mreža                  | nije počelo | treba: app-ovi i prijave iz INTEGRATIONS 14                                                                               |
| 9a–9b Objave, kalendar, publisher        | nije počelo |                                                                                                                           |
| 10a–10c Strategija, analitika, Autopilot | nije počelo |                                                                                                                           |
| 11 Edge case-ovi                         | nije počelo |                                                                                                                           |
| 12 Plaćanje                              | nije počelo | Stripe nalog vlasnik pravi; preskače se do tada (D-001)                                                                   |
| 13a–13b Admin                            | nije počelo | gate i placeholder postoje                                                                                                |
| 14a–14c Dizajn                           | nije počelo | treba: screenshot Dribbble reference ako link ne radi                                                                     |
| 15 Testiranje                            | nije počelo | Playwright + Chromium instalirani; `npm run test:e2e` (5 testova) prolazi                                                 |
| 16 Deploy                                | nije počelo | treba: Vercel, Supabase staging/prod, domen sovaai.rs, Upstash, Inngest, Sentry                                           |

## Faza 4 — šta je urađeno

- **Auth** (`src/lib/auth/actions.ts`, Server Actions): registracija (ime, email, lozinka ≥ 10, uslovi, Turnstile kad je podešen, blokada jednokratnih domena, rate limit 3/h po IP), prijava lozinkom (5 pokušaja / 15 min po IP+email), magic link, Google OAuth (dugme samo uz ključeve), zaboravljena i nova lozinka, ponovno slanje potvrde, odjava. Poruke Supabase-a mapirane na srpski (`messages.ts`). `/auth/callback` menja PKCE kod ili OTP hash za sesiju i vraća na proverenu `next` putanju.
- **Sesija**: `getViewer()` (cookie) i `getViewerFromRequest()` (Bearer ili cookie) vraćaju korisnika, profil, MFA nivo i Supabase klijent sa RLS pravima. `proxy.ts` osvežava sesiju (`getClaims`), štiti `/app` i `/admin`, preusmerava prijavljene sa `/login` i `/register`, šalje `x-pathname`.
- **Workspace i tim**: cookie `sova_ws` i `sova_brand` za trenutni kontekst; servisi `workspaces.ts`, `team.ts`, `brands.ts`, `plans.ts` (limiti plana iz pretplate ili besplatnog plana); pozivnice sa hash tokenom, 7 dana, email preko Resend-a ili DEV log (link se prikazuje adminu u DEV-u); prihvatanje kroz RPC uz proveru emaila; uloge i pristup po brendu; poslednji owner i owner uloga zaštićeni u bazi.
- **API rute**: `/api/workspaces` (GET, POST), `/api/workspaces/[id]` (GET, PATCH, DELETE), `/api/workspaces/[id]/members` (GET, PATCH, DELETE), `/api/invitations` (GET, POST), `/api/invitations/[id]` (DELETE), `/api/invitations/[id]/accept` (POST; `id` je token), `/api/brands` (GET, POST), `/api/brands/[id]` (GET, PATCH, DELETE), `/api/me`, `/api/auth/signout`.
- **Stranice**: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/invite/[token]`; `/app` (početna sa tokenima, brendovima, planom), `/app/onboarding` (tip naloga, radni prostor, brend, sajt), `/app/team` (članovi, uloge, uklanjanje, pozivnice), `/app/settings` (profil, radni prostor, brendovi), `/app/settings/security` (TOTP: uključivanje, potvrda koda, isključivanje); `/admin` (gate: platform_admin + MFA u sesiji, inače 404 ili preusmerenje na bezbednost).
- **E2E** (`npm run test:e2e`, Playwright, 5 testova prolazi): zaštita `/app` i `/admin` bez sesije, registracija → Mailpit link → onboarding, kreiranje radnog prostora (50 tokena, 1 brend), tim (limit plana), podešavanja, 404 za `/admin` običnom korisniku, odjava. Otkrio i ispravio: RSC petlju u layoutu (D-026), CSP nonce za next-themes, status 200 umesto 404 za admin (D-025), `nativeButton={false}` za Base UI dugmad koja renderuju linkove.
- **Testovi**: 10 integracionih (`npm run test:integration`): 401 bez sesije, 400 sa poljima, srećan put, tuđ workspace 404, pogrešan Origin 403, limit brendova i članova (PLAN_LIMIT), pozivnica → prihvatanje → vidljivost, pogrešan email 403, editor ne menja uloge, owner menja.
- Lokalni Supabase: `enable_confirmations = true`, `minimum_password_length = 10`, MFA TOTP uključen, Google provider sa env ključevima, `email_sent` limit podignut na 100/h za testiranje.

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
- Pre faze 5: nov `GEMINI_API_KEY` u `.env.local`.
- Adresa sedišta TangerineSEO LLC i merodavno pravo; email za privatnost na domenu sovaai.rs.
- GitHub → Settings → Code security: uključiti secret scanning.

## Poznati bagovi

- Nema poznatih.

## Tehnički dug

- Tekstovi stranica faze 4 su na srpskom u kodu; selidba u next-intl poruke ide uz dizajn (faza 14) kad se ekrani finalizuju.
- Prenos vlasništva radnog prostora i brisanje naloga iz aplikacije (izvoz, kaskada, opoziv tokena mreža) stižu uz GDPR deo (faza 11) i integracije (faza 8).
- Sentry `withSentryConfig` samo sa `SENTRY_DSN`; upload source mapa tek sa `SENTRY_AUTH_TOKEN`.
- CI pokreće samo unit testove; testovi baze i integracioni zahtevaju Supabase u CI-ju (faza 15).
- `complete_upload` RPC odložen za fazu 7.
