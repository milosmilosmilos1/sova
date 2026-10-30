-- Kontekst dizajnirane objave (D-108, faza 4): tema, poziv, format, stil, slajdovi, fotografije i jezik.
-- „Generiši ponovo” u odobravanju po njemu piše nov tekst i crta nove slajdove.
alter table public.posts add column if not exists design jsonb;
