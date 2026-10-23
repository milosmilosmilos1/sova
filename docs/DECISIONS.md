# Sova — odluke

Format: broj, datum, status (predlog / usvojeno / odbačeno / zamenjeno), odluka, alternative, razlog. Nove odluke idu na kraj. Status „predlog” znači da čeka tvoju potvrdu.

## D-001 · 23.10.2026 · predlog · Provajder plaćanja: PaymentProvider interfejs, prva implementacija zavisi od pravnog lica

Odluka: `PaymentProvider` interfejs (`createCheckout`, `createTopupCheckout`, `createPortalSession`, `handleWebhook`, `getSubscription`) od faze 3 (tabele su provajder-neutralne: `provider`, `provider_customer_id`, `provider_price_ids`). Prva implementacija: **Paddle** ako se naplaćuje kroz firmu u Srbiji, **Stripe** ako postoji pravno lice u podržanoj zemlji.
Alternative: Stripe (brif), Lemon Squeezy, Polar, Paddle.
Razlog: Stripe-ova zvanična lista podržanih zemalja (stripe.com/global, 23.10.2026) nema Srbiju; prethodna verzija projekta to je već potvrdila u praksi. Paddle izričito podržava prodavce „bilo gde u svetu” osim sankcionisanih zemalja (Srbija nije na toj listi) i kao Merchant of Record rešava PDV u EU i UK. Lemon Squeezy ima Srbiju na listi isplata na račun, ali su mu tier-ovi i budućnost nejasniji. Paddle Billing ima Checkout, Customer Portal, webhook-e sa potpisom i sandbox, što pokriva sve iz brifa. Ako ostane Stripe: Stripe Checkout, Customer Portal, Stripe Tax kako je u brifu.

## D-002 · 23.10.2026 · predlog · Gemini modeli

Odluka: tekst `gemini-3.8-flash` (primarni) i `gemini-3.5-flash-lite` (fallback); slike `gemini-3.1-flash-image` (standard), `gemini-3-pro-image` (premium), `gemini-3.1-flash-lite-image` (fallback); embeddings `gemini-embedding-2` sa 1536 dimenzija. Svi nazivi samo u env-u.
Alternative: `gemini-3.6-flash` (ista cena do kraja 2026, starija generacija), `gemini-nano-banana-2.1` kao standardni model za slike ($0.0336 po 1K slici, upola jeftinije, bolja tipografija po Google-u).
Razlog: na stranici modela 23.10.2026 `gemini-3.5-flash` je deprecated (preusmerava na 3.6), 3.8 Flash je najnoviji stabilan, Flash-Lite je najjeftiniji stabilan tekstualni model. Za slike brif traži 3.1-flash-image; nano-banana-2.1 treba uporediti u fazi 5 na istim promptovima pre promene. 1536 dimenzija staje u pgvector `vector` tip sa HNSW indeksom (limit 2.000), 3072 bi tražilo `halfvec` i duplo mesta.

## D-003 · 23.10.2026 · predlog · Instagram kroz Facebook Login

Odluka: faza 8a implementira „Instagram API with Facebook Login” (graph.facebook.com, scope `instagram_content_publish`), jedan OAuth tok za Facebook stranicu i povezan Instagram Business/Creator nalog. „Instagram API with Instagram Login” (bez Facebook stranice) ide iza feature flaga `platform.instagram_login` u kasnijoj podfazi.
Alternative: samo Instagram Login; oba odmah.
Razlog: Sova ionako objavljuje na Facebook stranice; Page token nema fiksan istek (Instagram Login token traje 60 dana i mora da se osvežava); jedan App Review pokriva obe mreže. Mana: korisnik bez Facebook stranice ne može da poveže Instagram dok ne dođe druga varijanta.

## D-004 · 23.10.2026 · predlog · Inngest za sve što traje ili mora da preživi pad

Odluka: Inngest Cloud (free plan za DEV/STAGING, plaćeni za PROD po potrebi) sa funkcijama iz ARCHITECTURE sekcija 6. Vercel Cron se ne koristi.
Alternative: Vercel Cron + sopstveni red u Postgresu; Supabase Edge Functions + pg_cron; Trigger.dev; BullMQ na posebnom serveru.
Razlog: brif ga traži; `step.sleepUntil` + `cancelOn` rešavaju zakazivanje i pomeranje objava bez sopstvenog scheduler-a; koraci su idempotentni i vidljivi u dashboardu; nema infrastrukture za održavanje. Rizik: zavisnost od trećeg servisa — watchdog cron i `post_targets.scheduled_at` indeks omogućavaju ručni oporavak.

## D-005 · 23.10.2026 · predlog · Rezervacija tokena kroz RPC sa `FOR UPDATE`, ledger samo pri potvrdi

Odluka: `reserve_tokens` zaključava grantove workspace-a, alocira iz onih koji najranije ističu, piše `token_reservations`; `confirm_reservation` u istoj transakciji smanjuje grantove, piše ledger i označava generaciju uspešnom. Rezervacije ističu za 15 min.
Alternative: jedna `balance` kolona sa dekrementom (brzo, ali ne zna koji grant ističe); optimistički update bez locka; Redis brojač.
Razlog: brif traži da dva istovremena klika ne potroše iste tokene i da neuspelo generisanje ne košta; FOR UPDATE po workspace-u je dovoljno brz (desetine zahteva u sekundi po workspace-u je nerealno). Ledger ostaje čist audit trag bez „rezervisano pa vraćeno” šuma.

## D-006 · 23.10.2026 · predlog · Impersonacija: JWT za ciljnog korisnika + read-only u RLS-u

Odluka: server tokom impersonacije koristi Supabase klijent sa kratkotrajnim JWT-om za ciljnog korisnika koji nosi claim `imp: { sid, ro }`; politike za pisanje sadrže `not is_impersonation_readonly()`. Cookie sesije impersonacije je potpisan HMAC-om, 30 min, sve se loguje.
Alternative: aplikacijska impersonacija (service role + ručna provera); Supabase `generateLink` i prava prijava kao korisnik.
Razlog: read-only garantuje baza, ne kod; nema korisnikove lozinke ni prave sesije koja bi preživela admina. Uslov: HS256 JWT secret dostupan serveru. Ako projekat koristi samo asimetrične ključeve bez mogućnosti potpisivanja, pada se na aplikacijsku varijantu. Proverava se u fazi 13 pre koda.

## D-007 · 23.10.2026 · predlog · Dokumentacija podeljena: ARCHITECTURE + SCHEMA + INTEGRATIONS

Odluka: ERD, dijagrami, tokovi, rute, Inngest i rizici u ARCHITECTURE.md; puna šema sa DDL-om i RLS politikama u SCHEMA.md; činjenice o mrežama u INTEGRATIONS.md.
Alternative: sve u ARCHITECTURE.md kako brif navodi.
Razlog: šema je sama po sebi 700+ linija; u jednom fajlu bi arhitektura bila nečitljiva. ARCHITECTURE.md i dalje sadrži sve što brif traži, u sažetom obliku, sa linkovima.

## D-008 · 23.10.2026 · predlog · TikTok mediji kroz FILE_UPLOAD

Odluka: za TikTok publisher šalje video u chunkovima (`FILE_UPLOAD`) iz Inngest koraka; `PULL_FROM_URL` tek ako se uvede proxy ruta za medije na našem domenu i verifikuje URL property.
Alternative: javni Storage bucket na našem poddomenu (CNAME ka Supabase nije podržan za Storage bez Pro plana i custom domena).
Razlog: TikTok prihvata `PULL_FROM_URL` samo sa verifikovanog domena; potpisani Supabase URL-ovi su na `supabase.co`.

## D-009 · 23.10.2026 · predlog · Dodatne tabele van brifa

Odluka: `oauth_states`, `idempotency_keys`, `brand_site_checks`, `insights`, `reports`, `holidays`, `user_flags`, `account_deletion_requests`, `data_exports`.
Razlog: svaka pokriva zahtev iz brifa koji nema gde da živi (PKCE i state, Idempotency-Key header, nedeljna provera sajta, AI uvidi, PDF izveštaji, praznici kao predlozi kampanja, oznaka za admina pri zloupotrebi, Meta data deletion callback sa kodom potvrde, izvoz podataka).

## D-010 · 23.10.2026 · predlog · Realtime samo na tri tabele

Odluka: Supabase Realtime `postgres_changes` uključen samo za `ai_generations`, `website_crawls`, `post_targets` (status i progress) i `notifications`, sa filterom po `workspace_id` ili `user_id`.
Alternative: Realtime na svemu; polling.
Razlog: Realtime prolazi kroz RLS i ima limite po planu; ostatak UI-ja koristi TanStack Query sa invalidacijom.

## D-011 · 23.10.2026 · predlog · Port 3001 lokalno i Supabase CLI kroz Docker

Odluka: `next dev -p 3001`; lokalni Supabase kroz `npx supabase start`; Inngest dev server na 8288.
Razlog: port 3000 drži drugi projekat na ovoj mašini; CLI daje identičnu bazu kao produkcija i `db reset` za testove.

## D-012 · 23.10.2026 · predlog · Faza po faza, sa potvrdom

Odluka: faza 1 staje ovde i čeka odobrenje plana, kako brif traži. Za dalje faze važi režim iz tvog odgovora na pitanje 8 (po fazi, ili više faza zaredom kao u prethodnoj verziji).
