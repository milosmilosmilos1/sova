-- Galerija (D-114): kategorije fotografija brenda, opis koji pomaže pri izboru vizuala, rotacija
-- (poslednja upotreba) i tok koji uzima fotografije iz jedne kategorije.
create table public.gallery_categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index gallery_categories_brand_name on public.gallery_categories (brand_id, lower(btrim(name)));

alter table public.gallery_categories enable row level security;
create policy gallery_categories_select on public.gallery_categories for select to authenticated
  using (public.has_brand_access(brand_id));

alter table public.media_assets add column if not exists category_id uuid
  references public.gallery_categories(id) on delete set null;
alter table public.media_assets add column if not exists description text
  check (description is null or char_length(description) <= 500);
alter table public.media_assets add column if not exists last_used_at timestamptz;
create index if not exists media_assets_gallery on public.media_assets (brand_id, category_id)
  where deleted_at is null and kind = 'image';

alter table public.content_flows add column if not exists gallery_category_id uuid
  references public.gallery_categories(id) on delete set null;

-- D-079 za nove tabele (031, 033 i ova): strani ključevi sa CASCADE ili SET NULL se proveravaju na
-- kraju transakcije, inače brisanje naloga pada kad kaskada dva puta menja isti red
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and c.confdeltype in ('c', 'n')
      and not c.condeferrable
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred', r.tbl, r.conname);
  end loop;
end
$$;
