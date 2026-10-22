# Sova — plan razvoja i arhitektura

Verzija 1, 22.10.2026. Ovo je faza 1. Ništa od koda još ne postoji; ovaj dokument je osnova za faze 2–11.

## 1. Šta pravimo

SaaS za male biznise. Korisnik se registruje, unese podatke o svom biznisu, i onda pravi tri vrste sadržaja za društvene mreže:

| Funkcija | Ulaz | Izlaz | Cena |
|---|---|---|---|
| Slika iz fotografije | fotografija + opis šta želi | nova slika | 8 tokena |
| Tekst za objavu | opis (+ opciono fotografija) | tekst objave | 2 tokena |
| Slika iz opisa | opis | nova slika | 8 tokena |

Novi korisnik dobija 50 tokena. Mesečni plan 39 $ / 500 tokena. Godišnji 199 $ / 6000 tokena.

## 2. Stek i verzije

| Sloj | Izbor | Zašto |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | zahtev je 14+, 16 je trenutna stabilna; `proxy.ts` umesto `middleware.ts` |
| Stil | Tailwind CSS v4 + shadcn/ui komponente | ulepšavanje tek u fazi 9 |
| Baza, auth, storage | Supabase (Postgres + RLS + Auth + Storage) | jedan servis za sve tri stvari |
| AI | Google Gemini preko `@google/genai` SDK-a | tekst, slika iz opisa, slika iz slike, sve isti SDK |
| Plaćanje | Stripe Checkout + Customer Portal + webhook | bez sopstvene forme za karticu |
| Validacija | zod | svaki ulaz iz browsera prolazi kroz šemu |
| Obrada slika | sharp | provera formata po bajtovima, smanjivanje, EXIF rotacija |
| Toast | sonner | faza 9 |
| Testovi | Vitest (jedinični) + Playwright (tokovi u browseru) | faza 10 |
| Hosting | Vercel, povezan na GitHub repo `milosmilosmilos1/sova` | faza 11 |

Dve odvojene sredine od prvog dana:

| | DEV | PROD |
|---|---|---|
| Supabase projekat | lokalni Docker (`npx supabase start`) | `sova-prod` |
| Stripe | test ključevi | live ključevi |
| Vercel okruženje | Preview + Development | Production |
| Env fajl lokalno | `.env.local` | nikad lokalno, samo u Vercel-u |

Migracije baze žive u `supabase/migrations/*.sql` i primenjuju se Supabase CLI-jem na obe sredine, iste SQL skripte.

## 3. Struktura foldera

```
sova/
  app/
    (marketing)/
      page.tsx                 landing: opis, cene, CTA
      terms/page.tsx           uslovi (Stripe traži za live)
      privacy/page.tsx
    (auth)/
      login/page.tsx
      register/page.tsx
      forgot-password/page.tsx
      reset-password/page.tsx
      check-email/page.tsx     "proveri mejl" posle registracije
      auth/callback/route.ts   potvrda mejla, reset lozinke
    (app)/                     sve ispod traži prijavu
      layout.tsx               navigacija, baner "gledaš kao ..." pri impersonaciji
      onboarding/page.tsx
      dashboard/page.tsx
      create/photo/page.tsx    slika iz fotografije
      create/text/page.tsx
      create/image/page.tsx    slika iz opisa
      history/page.tsx
      history/[id]/page.tsx
      stats/page.tsx
      settings/page.tsx        tabovi: biznis, nalog, pretplata
      billing/success/page.tsx
      billing/cancel/page.tsx
      blocked/page.tsx
    (admin)/admin/             samo role = admin
      page.tsx                 statistike
      users/page.tsx
      users/[id]/page.tsx
      audit/page.tsx
    api/                       vidi odeljak 6
    error.tsx, global-error.tsx, not-found.tsx, loading.tsx
  components/
    ui/                        shadcn
    forms/
    generation/
    admin/
  lib/
    supabase/
      client.ts                browser, anon ključ
      server.ts                server komponente i rute, anon ključ + cookies, RLS važi
      admin.ts                 service role, samo server, samo gde mora
    auth/
      get-user.ts              vraća pravog korisnika ili impersoniranog
      impersonation.ts         potpisan cookie
      require-admin.ts
    ai/
      gemini.ts                klijent
      text.ts, image.ts, image-edit.ts
      retry.ts                 3 pokušaja, eksponencijalno čekanje
      fallback.ts              rezervni model
      prompts.ts               sistemski promptovi, prompt za biznis
    tokens.ts                  reserve / commit / release
    rate-limit.ts
    stripe/
      client.ts, plans.ts, webhook-handlers.ts
    storage.ts                 upload, signed URL, brisanje
    validation/                zod šeme po ruti
    errors.ts                  AppError + kodovi
    api.ts                     omotač za rute: auth → validacija → handler → format odgovora
  supabase/
    migrations/
    seed.sql
  types/
    database.ts                generisano iz Supabase šeme
  proxy.ts                     zaštita ruta, osvežavanje sesije
  .env.example
```

## 4. Baza podataka

Sve tabele su u šemi `public`. Svaka ima RLS uključen. `auth.users` je Supabase-ova tabela; naša `profiles` je 1:1 sa njom.

### 4.1 profiles

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | = auth.users.id, on delete cascade |
| email | text not null | kopija radi pretrage u adminu |
| full_name | text | |
| role | text not null default 'user' | check: 'user' ili 'admin' |
| token_balance | int not null default 0 | check >= 0, nikad negativno |
| is_blocked | bool not null default false | blokiran korisnik ne može ništa |
| onboarding_completed | bool not null default false | |
| created_at, updated_at | timestamptz | |

Trigger `handle_new_user` na `auth.users` insert: pravi red u profiles sa 50 tokena i upisuje `welcome` transakciju u ledger.

### 4.2 businesses (podaci o biznisu, 1 po korisniku)

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null unique → profiles | cascade |
| name | text not null | max 100 |
| industry | text | npr. kafić, frizer, teretana |
| description | text | max 1000, ide u svaki prompt |
| target_audience | text | max 500 |
| tone_of_voice | text | prijateljski / profesionalan / duhovit / luksuzan |
| language | text not null default 'sr' | 'sr' ili 'en', jezik generisanog teksta |
| website, instagram | text | |
| logo_path | text | putanja u bucket-u `logos` |
| brand_colors | text[] | hex vrednosti, za promptove slika |
| default_hashtags | text[] | |
| created_at, updated_at | timestamptz | |

### 4.3 generations (sve što je korisnik napravio)

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null → profiles | cascade |
| type | text not null | 'text', 'image_from_prompt', 'image_from_photo' |
| status | text not null default 'pending' | pending → processing → completed / failed |
| prompt | text not null | max 1000 znakova |
| platform | text | instagram / facebook / linkedin / tiktok / x / general |
| tone | text | po želji, inače iz businesses |
| input_image_path | text | bucket `uploads` |
| output_text | text | za type = text |
| output_image_path | text | bucket `generated` |
| tokens_cost | int not null | 2 ili 8, zapisano u trenutku zahteva |
| provider | text | 'gemini' |
| model | text | tačan model koji je odgovorio (primarni ili rezervni) |
| attempts | int default 0 | koliko puta smo zvali AI |
| error_code, error_message | text | kad je failed |
| duration_ms | int | |
| idempotency_key | text | unique(user_id, idempotency_key), štiti od duplog klika |
| metadata | jsonb default '{}' | dimenzije slike, safety ocena, itd. |
| created_at, completed_at | timestamptz | |

Indeksi: (user_id, created_at desc), (user_id, type), (status).

### 4.4 token_transactions (ledger, samo se dopisuje)

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null → profiles | cascade |
| amount | int not null | negativno = trošenje, pozitivno = dodavanje |
| balance_after | int not null | stanje posle ove stavke |
| type | text not null | welcome / purchase / spend / refund / admin_adjust / chargeback |
| status | text not null default 'completed' | za spend: reserved → completed ili released |
| generation_id | uuid → generations | set null |
| stripe_invoice_id | text | unique gde nije null, to je idempotentnost plaćanja |
| admin_id | uuid → profiles | ko je ručno menjao |
| note | text | |
| created_at | timestamptz | |

Stanje tokena se čita iz `profiles.token_balance` (brzo), a ledger je istina za reviziju. Oba se menjaju u istoj transakciji kroz funkcije ispod, nikad direktnim UPDATE-om iz aplikacije.

### 4.5 rate_limits

| Kolona | Tip |
|---|---|
| key | text (npr. `uid:generate`) |
| window_start | timestamptz |
| count | int |
| PK (key, window_start) | |

Funkcija `check_rate_limit(key, limit, window_seconds)` radi fiksni prozor i vraća true/false. Bez Redis-a, bez dodatnog servisa. Stari redovi se brišu u istoj funkciji povremeno.

### 4.6 stripe_customers

| Kolona | Tip |
|---|---|
| user_id | uuid PK → profiles |
| stripe_customer_id | text not null unique |
| created_at | timestamptz |

### 4.7 subscriptions

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null → profiles | |
| stripe_subscription_id | text not null unique | |
| stripe_price_id | text not null | |
| plan | text not null | 'monthly' ili 'yearly' |
| status | text not null | Stripe status: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired, paused |
| current_period_start, current_period_end | timestamptz | |
| cancel_at_period_end | bool default false | |
| canceled_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### 4.8 payments

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → profiles | set null |
| stripe_invoice_id | text not null unique | |
| stripe_subscription_id | text | |
| amount_paid | int | u centima |
| currency | text | |
| status | text | paid / open / void / uncollectible / refunded |
| billing_reason | text | subscription_create / subscription_cycle / subscription_update |
| tokens_granted | int default 0 | |
| paid_at, created_at | timestamptz | |

### 4.9 stripe_events (idempotentnost webhook-a)

| Kolona | Tip |
|---|---|
| id | text PK (Stripe `evt_...`) |
| type | text not null |
| payload | jsonb not null |
| status | text: received / processed / failed |
| error | text |
| received_at, processed_at | timestamptz |

Prvi korak u webhook-u je `insert ... on conflict do nothing`. Ako red već postoji, odgovaramo 200 i ništa ne radimo. Isti event dva puta = tokeni jednom.

### 4.10 admin_audit_log

| Kolona | Tip |
|---|---|
| id | bigserial PK |
| admin_id | uuid not null → profiles |
| action | text not null: tokens_adjust / impersonate_start / impersonate_stop / user_block / user_unblock / role_change / user_delete / generation_delete |
| target_user_id | uuid → profiles, set null |
| details | jsonb |
| ip, user_agent | text |
| created_at | timestamptz |

Samo insert. Nema update i delete politike ni za admina.

### 4.11 Storage bucket-i

| Bucket | Sadržaj | Pristup |
|---|---|---|
| uploads | fotografije koje korisnik pošalje | privatan |
| generated | slike koje je AI napravio | privatan |
| logos | logo biznisa | privatan |

Putanja je uvek `{user_id}/{uuid}.{ext}`. Politika na `storage.objects`: korisnik čita i piše samo u folder čije je ime njegov `auth.uid()`; admin sve. Browser dobija potpisane URL-ove koji traju 1 sat.

### 4.12 Funkcije u bazi

| Funkcija | Ko zove | Šta radi |
|---|---|---|
| `is_admin()` | RLS politike | true ako je `profiles.role = 'admin'` za `auth.uid()` |
| `handle_new_user()` | trigger | profil + 50 tokena + welcome stavka |
| `reserve_tokens(user, amount, generation_id)` | API, service role | `UPDATE profiles SET token_balance = token_balance - amount WHERE id = user AND token_balance >= amount`; ako 0 redova → greška INSUFFICIENT_TOKENS; upisuje spend stavku sa status reserved. Jedna naredba, pa dva paralelna zahteva ne mogu oba da prođu sa poslednjih 8 tokena |
| `commit_tokens(transaction_id)` | API | reserved → completed |
| `release_tokens(transaction_id)` | API | reserved → released, vraća iznos na balance, upisuje refund stavku |
| `grant_tokens(user, amount, type, stripe_invoice_id, note)` | webhook | dodaje tokene; unique na stripe_invoice_id čini ponovni poziv bezopasnim |
| `admin_adjust_tokens(target, amount, note)` | admin API | proverava is_admin, ne dozvoljava da stanje ode ispod 0, upisuje ledger i audit |
| `check_rate_limit(key, limit, window)` | API | vidi 4.5 |
| `get_user_stats(user)` | stats strana | broj po tipu (ukupno i ovaj mesec), tokeni potrošeni, serija po danu za 30 dana |
| `get_admin_stats()` | admin | ukupno korisnika, novi za 30 dana, aktivne pretplate po planu, MRR, prihod 30 dana, generacije po tipu, tokeni potrošeni |

Funkcije za tokene su `security definer` i izvršavanje je dozvoljeno samo `service_role` ulozi. Browser ne može da ih pozove.

## 5. Bezbednosne politike (RLS)

Pravilo za sve: korisnik vidi i menja samo redove gde je `user_id = auth.uid()`. Admin (`is_admin()`) vidi sve. Ledger, plaćanja i audit log korisnik može samo da čita (svoje), piše ih isključivo server sa service role ključem.

| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| profiles | svoj red ili admin | niko (trigger) | svoj red, ali ne kolone role / token_balance / is_blocked (trigger ih štiti); admin sve | niko iz aplikacije |
| businesses | svoj ili admin | svoj | svoj ili admin | svoj |
| generations | svoj ili admin | svoj ili admin (impersonacija) | svoj ili admin | svoj ili admin |
| token_transactions | svoj ili admin | niko (funkcije) | niko | niko |
| rate_limits | niko | niko (funkcija) | niko | niko |
| stripe_customers | svoj ili admin | niko (server) | niko | niko |
| subscriptions | svoj ili admin | niko (webhook) | niko | niko |
| payments | svoj ili admin | niko (webhook) | niko | niko |
| stripe_events | niko | niko | niko | niko |
| admin_audit_log | admin | admin (kroz funkciju) | niko | niko |

Dodatna zaštita koja nije RLS:

- Service role ključ postoji samo na serveru. Ne ulazi ni u jedan fajl koji se šalje browseru (lint pravilo u fazi 2 proverava da `lib/supabase/admin.ts` nije uvezen iz klijentskih komponenti).
- Svaka admin ruta ponovo proverava rolu na serveru, ne oslanja se samo na layout.
- Putanja u storage-u se proverava u kodu: mora da počinje sa `{effective_user_id}/`.
- Potpisani URL-ovi ističu posle 1 sata.
- Trigger na `profiles` odbija promenu `role`, `token_balance`, `is_blocked` ako poziv nije iz service role konteksta.

## 6. API rute

Svaka ruta vraća isti oblik:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "INSUFFICIENT_TOKENS", "message": "Nemaš dovoljno tokena. Treba 8, imaš 3." } }
```

Kodovi grešaka i HTTP status:

| Kod | Status |
|---|---|
| UNAUTHORIZED | 401 |
| BLOCKED | 403 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| VALIDATION_ERROR | 400 |
| FILE_TOO_LARGE | 413 |
| UNSUPPORTED_FORMAT | 415 |
| INSUFFICIENT_TOKENS | 402 |
| RATE_LIMITED | 429 |
| AI_REJECTED (safety blok, prazan odgovor) | 422 |
| AI_UNAVAILABLE | 503 |
| INTERNAL | 500 |

### 6.1 Generisanje

| Metod | Ruta | Telo | Vraća |
|---|---|---|---|
| POST | /api/generate/text | prompt, platform, tone?, input_image_path?, idempotency_key | generation (sa output_text) |
| POST | /api/generate/image | prompt, aspect_ratio (1:1, 4:5, 9:16, 16:9), idempotency_key | generation (sa potpisanim URL-om slike) |
| POST | /api/generate/photo | prompt, input_image_path, aspect_ratio?, idempotency_key | generation |

Obavezan redosled u svakoj od tri rute:

1. Ko je ulogovan? Nema sesije → 401. Blokiran → 403.
2. Validacija tela (zod) → 400.
3. Rate limit `uid:generate`, 10 u minutu → 429.
4. Idempotency key već postoji za tog korisnika → vrati postojeću generaciju, ne radi ništa.
5. Upiši red u `generations`, status pending.
6. `reserve_tokens` → ako nema dovoljno: red ide u failed, vrati 402. Ovo je tačka "proveri da li ima tokene"; rezervacija je jedini način da dva paralelna zahteva ne potroše iste tokene.
7. Pozovi AI (status processing). Retry do 3 puta, pa rezervni model.
8. Sačuvaj rezultat: slika u bucket `generated`, tekst u red; status completed.
9. `commit_tokens`. Tek sad su tokeni skinuti za stalno.
10. Vrati rezultat.

Ako korak 7 ili 8 padnu: `release_tokens`, status failed, error_code, odgovor 503 ili 422 sa porukom koju korisnik razume. Tokeni se vraćaju automatski.

### 6.2 Upload

| Metod | Ruta | Šta radi |
|---|---|---|
| POST | /api/uploads | multipart; proverava veličinu (max 10 MB), tip po magičnim bajtovima (jpg, png, webp), smanjuje na max 2048 px duže strane, ispravlja EXIF rotaciju, upisuje u `uploads/{uid}/{uuid}.jpg`, vraća putanju i potpisani URL. Rate limit 20 u minutu |
| POST | /api/uploads/logo | isto, bucket `logos`, max 2 MB, upisuje `businesses.logo_path` |

### 6.3 Podaci korisnika

| Metod | Ruta | Šta radi |
|---|---|---|
| GET | /api/generations?cursor=&type=&limit= | istorija, kursor paginacija, 20 po strani, sa potpisanim URL-ovima |
| GET | /api/generations/[id] | jedna generacija |
| DELETE | /api/generations/[id] | briše red i fajlove iz storage-a |
| GET | /api/business | podaci o biznisu |
| PUT | /api/business | upis/izmena (onboarding i podešavanja koriste istu rutu) |
| GET | /api/tokens | stanje + poslednjih 50 stavki ledgera |
| GET | /api/stats | poziva get_user_stats |
| PATCH | /api/account | ime, lozinka |
| DELETE | /api/account | briše nalog: otkazuje Stripe pretplatu, briše fajlove, briše auth.users red (cascade sve ostalo), audit |

### 6.4 Stripe

| Metod | Ruta | Šta radi |
|---|---|---|
| POST | /api/stripe/checkout | telo: plan (monthly/yearly). Ako već ima aktivnu pretplatu → vraća URL portala umesto checkout-a. Pravi/nalazi Stripe customer, pravi Checkout sesiju (mode subscription), vraća URL. Rate limit 5 u minutu. Zabranjeno tokom impersonacije |
| POST | /api/stripe/portal | vraća URL Customer Portal-a (promena kartice, otkazivanje, promena plana) |
| POST | /api/stripe/webhook | bez auth sesije, proverava Stripe potpis. Obrađuje: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded` |

Dodela tokena ide isključivo na `invoice.paid`. To pokriva i prvu uplatu i svako obnavljanje. Pravilo: za svaku stavku računa čiji je `price` u našoj mapi (monthly → 500, yearly → 6000) i čiji je iznos > 0, dodaj tokene. Ključ idempotentnosti je `stripe_invoice_id` (unique u ledgeru) plus `stripe_events.id`.

`charge.refunded` → skida onoliko tokena koliko je taj račun dodelio, ali ne ispod 0, upisuje chargeback stavku, i obaveštava admina.

### 6.5 Admin

Sve rute prvo zovu `requireAdmin()`. Svaka akcija koja nešto menja upisuje red u `admin_audit_log`.

| Metod | Ruta | Šta radi |
|---|---|---|
| GET | /api/admin/stats | get_admin_stats |
| GET | /api/admin/users?q=&cursor=&status= | pretraga po mejlu i imenu, filter: pretplaćeni / besplatni / blokirani |
| GET | /api/admin/users/[id] | profil, biznis, pretplata, poslednje generacije, ledger |
| POST | /api/admin/users/[id]/tokens | amount (+/−), note → admin_adjust_tokens |
| PATCH | /api/admin/users/[id] | is_blocked, role. Admin ne može sebi da skine rolu; ne može da blokira sebe |
| POST | /api/admin/users/[id]/impersonate | vidi 7.3 |
| POST | /api/admin/impersonate/stop | |
| DELETE | /api/admin/generations/[id] | |
| GET | /api/admin/audit?cursor=&admin=&action= | |

## 7. Autentifikacija i uloge

### 7.1 Tok

- Registracija: ime, mejl, lozinka (min 8 znakova). Supabase Auth, email + lozinka. Trigger pravi profil sa 50 tokena.
- Potvrda mejla: u PROD uključena. U DEV isključena da bi testiranje bilo brzo (Supabase besplatni plan šalje par mejlova na sat bez sopstvenog SMTP-a). Za PROD ide Resend kao SMTP, podešava se u fazi 11.
- Login, logout, zaboravljena lozinka, reset lozinke: Supabase, standardne rute.
- `proxy.ts` osvežava sesiju na svakom zahtevu i radi redirekcije: nije ulogovan → `/login?next=...`; ulogovan a nije prošao onboarding → `/onboarding`; blokiran → `/blocked`; nije admin a traži `/admin` → 404 (ne otkrivamo da panel postoji).

### 7.2 Uloge

`profiles.role`: `user` ili `admin`. Prvi admin se postavlja jednom SQL naredbom posle registracije tvog naloga. Posle toga admin može da unapredi druge iz panela. Sistem ne dozvoljava da ostane 0 admina.

### 7.3 Impersonacija

Admin klikne "Uđi kao korisnik". Server proveri rolu, upiše `impersonate_start` u audit, i postavi httpOnly cookie `sova_imp` sa potpisanim tokenom {admin_id, user_id, ističe za 1 sat}. Svaki helper koji vraća "trenutnog korisnika" proverava: ima li taj cookie, da li je potpis dobar, da li je sesija zaista admin. Ako jeste, efektivni korisnik je onaj iz cookie-ja. Admin vidi istoriju, statistike, podešavanja i može da generiše kao taj korisnik (troši njegove tokene, sve se beleži). Na vrhu stoji žuti baner "Gledaš kao marko@..., izađi". Dok traje impersonacija: nema checkout-a, nema portala, nema brisanja naloga, nema promene lozinke. Izlaz briše cookie i upisuje `impersonate_stop`.

## 8. AI sloj

### 8.1 Modeli

Imena modela su u env promenljivama, ne u kodu, jer se menjaju:

| Namena | Primarni | Rezervni |
|---|---|---|
| Tekst | `gemini-3.6-flash` | `gemini-3.5-flash-lite` |
| Slika iz opisa | `gemini-3.1-flash-image` | `gemini-3.1-flash-lite-image` |
| Slika iz fotografije | isti kao gore, sa slikom kao ulazom | isti rezervni |
| Tekst uz fotografiju | `gemini-3.6-flash` sa slikom kao ulazom | `gemini-3.5-flash-lite` |

Imena su potvrđena 22.10.2026 živim pozivima (faza 2): `gemini-2.5-flash` Google više ne daje novim nalozima, `gemini-3.8-flash` stalno vraća 503. Slika traje 40–75 s po pozivu. Ključ koji si poslao počinje sa `AQ.`, što liči na novi Google Cloud format, a ne na AI Studio format (`AIza...`). SDK podržava oba, ali u fazi 2 prvo proveravamo na koji endpoint ključ prolazi. Ključ ide samo u `.env.local` i Vercel, nikad u kod ni u repo. Pošto je prošao kroz chat, predlažem da ga posle faze 2 rotiraš u Google konzoli.

### 8.2 Prompt

Svaki poziv dobija sistemski deo koji sastavljamo iz `businesses`: ime, delatnost, opis, publika, ton, jezik, hashtag-ovi. Za slike dodajemo boje brenda ako postoje. Korisnikov tekst ide kao odvojen blok, pa pokušaj "ignoriši prethodna uputstva" nema efekat na sistemski deo. Za tekst tražimo odgovor u JSON formatu (caption, hashtags[], cta) da bi UI mogao da prikaže delove odvojeno.

### 8.3 Retry i fallback

- Do 3 pokušaja na primarnom modelu, čekanje 0,5 s → 1,5 s → 4 s, sa malo nasumičnosti.
- Ponavljamo samo na: 429, 500, 503, timeout, prekinuta veza. Ne ponavljamo na 400 (loš zahtev) i safety blok, jer bi isti ulaz opet pao.
- Posle 3 neuspeha ide 1 pokušaj na rezervnom modelu.
- Timeout po pokušaju: tekst 30 s, slika 45 s. Ruta za slike ima `maxDuration = 180`.
- Ako i rezervni padne: tokeni se vraćaju, red je failed, korisnik vidi "AI servis trenutno ne radi, tokeni ti nisu skinuti, probaj za par minuta". Admin dobija zapis u logu (Vercel log + `generations.error_code`).
- Ako je ključ nevažeći (401/403 od Google-a): ne ponavljamo, isti tretman kao gore, plus jasna poruka u serverskom logu.

### 8.4 Cena po pozivu (orijentaciono)

Slika na Gemini 2.5 Flash Image košta oko 0,04 $; korisnik je plaća 8 tokena, što je po mesečnom planu oko 0,62 $. Tekst košta delić centa. Margina je u redu, besplatnih 50 tokena je najviše 6 slika, što je oko 0,25 $ po registrovanom korisniku.

## 9. Ekrani

Šta korisnik vidi i radi. Svaki ekran u aplikaciji ima 4 stanja: učitavanje, podaci, greška, prazno.

| Ekran | Šta radi |
|---|---|
| Landing `/` | šta je Sova, 3 funkcije sa primerima, cene (besplatno 50 / 39 $ / 199 $), FAQ, dugme "Počni besplatno" |
| Registracija | ime, mejl, lozinka; posle: "proveri mejl" (PROD) ili odmah onboarding (DEV) |
| Login | mejl, lozinka, link za zaboravljenu lozinku |
| Zaboravljena / reset lozinke | standardno |
| Onboarding | 3 koraka: o biznisu (ime, delatnost, opis), publika i ton, jezik i hashtag-ovi + logo. Može da se preskoči korak, ne može cela stvar |
| Početna `/dashboard` | stanje tokena, 3 velike kartice (slika iz fotografije, tekst, slika iz opisa), poslednjih 6 stvari, CTA za plan ako je besplatan |
| Slika iz fotografije | upload zona (drag & drop), polje "kakvu sliku želiš", izbor formata (1:1, 4:5, 9:16), dugme Generiši (piše "8 tokena"), rezultat sa download i "napravi tekst za ovu sliku" |
| Tekst | polje za opis, izbor mreže, izbor tona, opcioni upload fotografije, dugme Generiši (2 tokena); rezultat: caption, hashtag-ovi, CTA, dugme kopiraj, "generiši ponovo" |
| Slika iz opisa | polje za opis, format, dugme Generiši (8 tokena), rezultat sa download |
| Istorija | lista sa filterom po tipu, beskonačno skrolovanje, klik otvara detalj; detalj ima prompt, rezultat, model, vreme, obriši |
| Statistike | broj po tipu ukupno i ovaj mesec, tokeni potrošeni, grafikon 30 dana, stanje tokena |
| Podešavanja → Biznis | isti podaci kao onboarding |
| Podešavanja → Nalog | ime, promena lozinke, brisanje naloga |
| Podešavanja → Pretplata | trenutni plan, period, dugme "Upravljaj pretplatom" (portal) ili izbor plana (checkout); ledger tokena |
| Billing success / cancel | "Hvala, tokeni stižu za koji sekund" (osvežava stanje) / "Nisi završio plaćanje" |
| Admin → Statistike | korisnici, pretplate, MRR, prihod, generacije, tokeni |
| Admin → Korisnici | pretraga, filteri, tabela |
| Admin → Korisnik | sve o njemu, dodaj/oduzmi tokene uz napomenu, blokiraj, promeni rolu, uđi kao korisnik |
| Admin → Audit | ko je šta uradio i kad |
| Blocked | "Nalog je blokiran, javi se na mejl" |
| 404 / error | nikad prazna strana; dugme nazad na početnu |

## 10. Monetizacija i Stripe tok

- Dva Stripe proizvoda sa po jednom cenom: Sova Monthly 39 $/mesec, Sova Yearly 199 $/godina. ID-jevi cena u env promenljivama (različiti za test i live).
- Checkout je Stripe-ov hostovani. Metadata na sesiji nosi `user_id`. Customer se pravi jednom i pamti u `stripe_customers`.
- Godišnji plan daje svih 6000 tokena odjednom pri uplati.
- Tokeni se ne brišu i ne ističu. Kad se pretplata otkaže, stanje ostaje, samo nema novih tokena.
- Promena plana ide kroz portal. Stripe izda račun; tokeni se dodeljuju po stavkama tog računa (vidi 6.4).
- Neuspela naplata obnove: pretplata ide u past_due, nema tokena, korisnik vidi upozorenje na dashboard-u sa linkom na portal.
- Lokalno se webhook testira sa Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`). CLI treba instalirati u fazi 7.

Jedna stvar za tebe: Stripe ne otvara naloge firmama registrovanim u Srbiji. Za test režim ovo ne smeta i ceo razvoj ide normalno. Za live naplatu treba entitet u podržanoj zemlji (Stripe Atlas, EU firma, ili Paddle / Lemon Squeezy kao zamena koja radi kao merchant of record). Ovo nije blokada za faze 2–10, ali je odluka pre faze 11.

## 11. Edge case-ovi i kako ih pokrivamo

### Auth i nalog
- Mejl već postoji → poruka, link na login. Supabase ne otkriva da li mejl postoji pri resetu lozinke (isto ponašanje i za nas).
- Slaba lozinka → poruka pre slanja.
- Login pre potvrde mejla (PROD) → poruka "potvrdi mejl" + dugme pošalji ponovo.
- Istekao link za reset → poruka i nov zahtev.
- Sesija istekla usred rada → API vrati 401, klijent prebacuje na login sa `next=` da se vrati gde je bio.
- Blokiran korisnik → 403 na svakoj ruti, `/blocked` strana, Stripe webhook i dalje radi (ako plati dok je blokiran, tokeni se upisuju, pristup i dalje nema).
- Nalog obrisan dok je tab otvoren → 401 → login.
- Admin pokuša da skine sebi rolu ili da blokira sebe → 400. Poslednji admin ne može da bude degradiran.

### Tokeni
- Tačno dovoljno tokena (8 kad ima 8) → prolazi. 7 → 402 sa "treba 8, imaš 7".
- Dupli klik / dva taba → idempotency_key iz klijenta (uuid po pokušaju) + dugme onemogućeno dok traje + atomska rezervacija u bazi. Najgore što može: isti rezultat dva puta, ne dva računa.
- AI padne posle rezervacije → release, 0 štete.
- AI uspe, upis u storage padne → ponovi upload 2 puta; ako i dalje ne ide, release + failed. Ne naplaćujemo ono što korisnik nije dobio.
- Stanje nikad ispod 0: CHECK u bazi je poslednja brana.
- Admin oduzima više nego što ima → funkcija odbija.

### Upload
- Preko 10 MB → 413 pre čitanja celog fajla (gledamo Content-Length, pa i stvarnu veličinu).
- gif, heic, svg, pdf preimenovan u .jpg → sharp čita bajtove, 415.
- Oštećen fajl → sharp baci grešku → 415 "slika ne može da se otvori".
- Ogromne dimenzije (npr. 12000 px) → smanjujemo na 2048 px, čuvamo smanjeno.
- EXIF rotacija (telefon) → `.rotate()` pre upisa.
- 0 bajtova, prazan naziv, unicode u nazivu → ime fajla ignorišemo, koristimo uuid.
- Upload uspeo, generisanje nikad nije pokrenuto → fajl ostaje; čišćenje siročića starijih od 7 dana je zadatak u fazi 10 (Vercel cron).

### Prompt i AI
- Prazan opis → 400. Preko 1000 znakova → 400 sa brojačem u UI-ju.
- Safety blok ili prazan odgovor → 422 "AI nije hteo da napravi ovo, promeni opis", tokeni vraćeni.
- Odgovor nema sliku iako je status OK → tretira se kao neuspeh, ide retry.
- Tekst nije validan JSON → jedan pokušaj popravke (traži od modela samo JSON), ako ne uspe, vraćamo ceo tekst kao caption.
- Model ukinut (404 od Google-a) → odmah rezervni model, plus log sa jasnom porukom za nas.
- Kvota potrošena (429 trajno) → posle retry-a rezervni; ako i on 429 → AI_UNAVAILABLE.
- Korisnik osveži stranu usred generisanja → serverski zahtev se završava do kraja, rezultat se vidi u istoriji; UI pri povratku prikazuje "u toku" dok ne postane completed.

### Stripe
- Webhook stigne pre nego što se korisnik vrati sa checkout-a → normalno, success strana samo osvežava stanje.
- Isti event dva puta → stripe_events PK, drugi put 200 bez posla.
- Eventi stignu u pogrešnom redosledu (updated pre created) → upsert po stripe_subscription_id.
- Checkout napušten → ništa se ne upisuje.
- Korisnik već pretplaćen klikne na plan → šaljemo ga u portal, ne pravimo drugu pretplatu.
- Customer već postoji u Stripe-u (ponovna registracija istim mejlom) → tražimo po mejlu pre nego što pravimo novog.
- Loš potpis webhook-a → 400, ništa ne radimo.
- Webhook obrada baci grešku → stripe_events.status = failed sa porukom, odgovaramo 500 da Stripe ponovi; ponovni pokušaj radi jer je upis atomski.
- Povraćaj novca → chargeback stavka, tokeni se skidaju do 0.
- Test i live ključevi pomešani → webhook potpis ne prolazi, vidi se odmah.
- Brisanje naloga sa aktivnom pretplatom → prvo otkazujemo pretplatu u Stripe-u, pa brišemo.

### Admin
- Impersonacija + plaćanje → 403.
- Impersonacioni cookie bez admin sesije (npr. ukraden) → ignorisan jer proveravamo i sesiju.
- Audit log se ne može menjati ni brisati.

### Frontend
- Spor net → dugmad sa spinnerom, drugi klik ne prolazi.
- Greška u komponenti → `error.tsx` sa porukom i "pokušaj ponovo", nikad bela strana.
- Nepostojeća ruta → `not-found.tsx`.
- Prazna istorija → ilustracija + dugme "napravi prvu objavu".
- Telefon → sve forme u jednoj koloni, upload zona radi na dodir.
- Potpisani URL istekao u otvorenom tabu → slika ne učita → klijent zatraži novi URL.

### Bezbednost
- Service role samo na serveru; lint proverava uvoze.
- Svaki ulaz kroz zod, i telo i query parametri.
- Putanje fajlova se proveravaju u odnosu na korisnika; nema čitanja tuđih fajlova ni kroz API.
- Route handler-i prihvataju samo `Content-Type: application/json` ili multipart, i proveravaju `Origin` za mutacije.
- Rate limit po korisniku na generisanje, upload, checkout. Registracija i login imaju Supabase-ov sopstveni limit.
- Lozinke, ključevi i tokeni se ne loguju.

## 12. Env promenljive

```
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY        (ili sb_publishable_... u novom formatu)
SUPABASE_SERVICE_ROLE_KEY            (ili sb_secret_...)
GEMINI_API_KEY
GEMINI_TEXT_MODEL, GEMINI_TEXT_FALLBACK_MODEL
GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY
IMPERSONATION_SECRET                 (32+ nasumičnih znakova)
```

`.env.example` ima sva imena bez vrednosti i ide u repo. `.env.local` je već u `.gitignore`.

## 13. Faze

| Faza | Šta se pravi | Šta testiraš |
|---|---|---|
| 1 | ovaj plan | čitaš i potvrđuješ |
| 2 | Next.js projekat, Tailwind, Supabase CLI init, `sova-dev` projekat, env fajlovi, provera Gemini ključa (`models.list`), provera da `npm run dev` radi | otvara se localhost:3000, u terminalu vidiš listu modela |
| 3 | migracije za sve tabele iz odeljka 4, RLS iz 5, funkcije, bucket-i, seed | u Supabase dashboard-u vidiš tabele; SQL test da korisnik A ne vidi redove korisnika B |
| 4 | registracija, login, logout, reset lozinke, proxy zaštita, onboarding forma (sirova), prvi admin | registruješ se, dobiješ 50 tokena, ne možeš na /dashboard bez prijave, ne možeš na /admin kao user |
| 5 | tri generate rute, upload ruta, tokeni (reserve/commit/release), retry, fallback, rate limit, istorija i stats rute; sirove forme da se može kliknuti | napraviš tekst (−2), sliku (−8), sliku iz fotografije (−8); 11. klik u minutu vraća 429; sa 1 tokenom dobiješ 402 |
| 6 | svi edge case-ovi iz 11 koji nisu već pokriveni, error.tsx, not-found, validacija, poruke | pošalješ gif, 15 MB fajl, prazan prompt, dupli klik; isključiš Gemini ključ i vidiš poruku a tokeni ostaju |
| 7 | Stripe proizvodi (test), checkout, portal, webhook, idempotentnost, Stripe CLI lokalno | platiš test karticom 4242…, dobiješ 500 tokena; ponovo pošalješ isti event iz CLI-ja, stanje se ne menja; otkažeš u portalu |
| 8 | admin: stats, korisnici, tokeni, blokiranje, impersonacija, audit | kao admin dodaš tokene drugom nalogu, uđeš kao on, vidiš njegovu istoriju, izađeš, u auditu su obe akcije |
| 9 | dizajn: plava paleta po Dribbble referenci, shadcn, responsive, spinneri, toast, prazna stanja, animacije | prolaziš sve ekrane na desktopu i telefonu |
| 10 | Playwright tokovi (registracija → generisanje → plaćanje → admin), Vitest za tokene i webhook, cron za siročiće, provere performansi | `npm test` zelen |
| 11 | `sova-prod` Supabase, Stripe live (ako ima entitet), Vercel projekat, env po okruženju, webhook endpoint, SMTP, domen | prava registracija na pravom domenu |

## 14. Odluke koje sam doneo umesto tebe

Promeni bilo šta pre nego što potvrdiš fazu:

1. Next.js 16, ne 14.
2. Godišnji plan daje 6000 tokena odjednom.
3. Tokeni nikad ne ističu, ostaju i posle otkazivanja.
4. Upload: max 10 MB, jpg/png/webp, smanjujemo na 2048 px.
5. Rate limit: 10 generisanja u minutu, 20 upload-a, 5 checkout-a.
6. Potvrda mejla: isključena u DEV, uključena u PROD.
7. DEV baza je lokalni Supabase u Docker-u (`npx supabase start`); hostovani `sova-dev` dolazi uz deploy. Promenjeno u fazi 2 jer Supabase CLI nije bio prijavljen.
8. UI je na srpskom (latinica); generisani tekst na jeziku koji korisnik izabere (sr/en).
9. Stripe Checkout i Portal su hostovani kod Stripe-a, bez sopstvene forme za karticu.
10. Rate limit u Postgres-u, bez Redis-a.
11. "Slika iz fotografije" nije lažni prototip: ide pravi Gemini poziv sa slikom kao ulazom, isti model kao za sliku iz opisa.
