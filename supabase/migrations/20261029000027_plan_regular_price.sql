-- Redovna cena plana (D-106): landing i Naplata je prikazuju precrtanu pored uvodne cene (`price_cents`).
-- Prazno znači da plan nema uvodnu cenu; prikazuje se samo kad je veća od `price_cents`.

alter table public.plans
  add column regular_price_cents integer check (regular_price_cents is null or regular_price_cents > 0);

comment on column public.plans.regular_price_cents is
  'Redovna cena posle uvodnog perioda, u centima iste valute; prikazuje se precrtana kad je veća od price_cents (D-106).';
