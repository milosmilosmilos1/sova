-- Dizajn brenda (D-108): stil objava, format, izvor fotografija, boje i nalog na slajdovima.
-- Prazno znači podrazumevano iz profila brenda; aplikacija čuva samo ono što je korisnik izabrao.
alter table public.brands add column if not exists design jsonb not null default '{}'::jsonb;
