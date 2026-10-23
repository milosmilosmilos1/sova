# Sova — napredak

Na početku svake sesije pročitaj ovaj fajl i [DECISIONS.md](DECISIONS.md).

## Stanje: faza 1 završena, čeka odobrenje (23.10.2026)

| Faza                                     | Status                     | Napomena                                                                      |
| ---------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| 1 Plan i arhitektura                     | **gotovo, čeka odobrenje** | ARCHITECTURE, SCHEMA, INTEGRATIONS, DECISIONS, EDGE_CASES, RUNBOOK            |
| 2 Setup projekta                         | nije počelo                | treba: GitHub secret scanning, Upstash, Inngest, Sentry, pravni podaci, domen |
| 3 Baza i bezbednost                      | nije počelo                |                                                                               |
| 4 Auth i workspace                       | nije počelo                | treba: Google OAuth klijent, Resend, Turnstile                                |
| 5 Token engine i AI jezgro               | nije počelo                | treba: GEMINI_API_KEY (nov), generisani tajni ključevi                        |
| 6 Brand Brain                            | nije počelo                | treba: test sajt                                                              |
| 7 Vizuelni pipeline                      | nije počelo                | treba: Unsplash, Canva                                                        |
| 8a–8d Integracije mreža                  | nije počelo                | treba: app-ovi i prijave iz INTEGRATIONS 14                                   |
| 9a–9b Objave, kalendar, publisher        | nije počelo                |                                                                               |
| 10a–10c Strategija, analitika, Autopilot | nije počelo                |                                                                               |
| 11 Edge case-ovi                         | nije počelo                |                                                                               |
| 12 Plaćanje                              | nije počelo                | treba: odluka D-001                                                           |
| 13a–13b Admin                            | nije počelo                |                                                                               |
| 14a–14c Dizajn                           | nije počelo                | treba: screenshot reference ako Dribbble link ne radi                         |
| 15 Testiranje                            | nije počelo                |                                                                               |
| 16 Deploy                                | nije počelo                |                                                                               |

## Šta je urađeno u fazi 1

- Pročitana aktuelna dokumentacija za Gemini (modeli, cene), Next.js 16 proxy, Instagram i Facebook publishing i tokene, LinkedIn Community Management, TikTok content sharing, X cene, YouTube kvotu, Pinterest tier-ove, GBP pristup, Canva Autofill, Unsplash smernice, Supabase HNSW, Inngest cancelOn, Stripe/Paddle/Lemon Squeezy podršku za Srbiju.
- Napisani: [ARCHITECTURE.md](ARCHITECTURE.md) (dijagram sistema, 5 tokova, ERD, bezbednost, 30 Inngest funkcija, 70+ ruta, ekonomija tokena, rizici, šta treba od tebe), [SCHEMA.md](SCHEMA.md) (52 tabele sa DDL-om, enumi, pomoćne funkcije, RLS matrica, 14 RPC funkcija, trigeri, state machine, storage, seed, 12 testova baze), [INTEGRATIONS.md](INTEGRATIONS.md) (interfejs, 8 mreža + Canva + Unsplash + Gemini, checklista prijava, izvori), [DECISIONS.md](DECISIONS.md) (12 odluka), [EDGE_CASES.md](EDGE_CASES.md) (seed liste), [RUNBOOK.md](RUNBOOK.md) (skelet).

## Otvorena pitanja (čekaju tvoj odgovor)

Vidi izveštaj faze 1 (poruka u sesiji 23.10.2026) i sekciju „Otvorena pitanja” ispod; odgovori se upisuju u DECISIONS.md.

1. Provajder plaćanja i pravno lice (D-001).
2. Pravni podaci i domen za stranice Privatnost/Uslovi/Brisanje i OAuth prijave.
3. Instagram samo kroz Facebook Login u prvoj verziji (D-003).
4. Test sajt(ovi) za Brand Brain i test nalozi na mrežama.
5. Obraćanje u UI: „ti” ili „Vi”.
6. Modeli: 3.8-flash i 3.1-flash-image kao polazni, poređenje sa nano-banana-2.1 u fazi 5 (D-002).
7. Supabase: nalog, plan, da li staging ide kao branch ili poseban projekat.
8. Režim rada od faze 2: po fazi sa potvrdom (brif) ili više faza zaredom (kao ranije).
9. X u prvoj verziji da ili ne; cena X objave sa linkom (3 ili 6 tokena).
10. Canva plan koji imaš (za Autofill) i da li Unsplash production prijavu podnosiš ti ili ja pripremam tekst.

## Poznati bagovi

Nema koda.

## Tehnički dug

Nema koda. Napomena iz prethodne verzije koja ostaje važeća: Docker volumeni starog lokalnog Supabase-a (`supabase_*_Social Media Automatizacija`) treba obrisati kad Docker proradi, pre `npx supabase start` u fazi 2.
