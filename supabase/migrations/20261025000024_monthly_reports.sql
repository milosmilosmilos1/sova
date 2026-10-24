-- Faza 14 · mesečni PDF izveštaj (D-094): adrese klijenta koje izveštaj dobijaju emailom i jedan
-- izveštaj po brendu i mesecu (novo pravljenje istog meseca zamenjuje stari fajl).

alter table public.brands
  add column report_emails extensions.citext[] not null default '{}'
  constraint brands_report_emails_max check (cardinality(report_emails) <= 5);

create unique index reports_brand_period on public.reports (brand_id, period_start, period_end);
