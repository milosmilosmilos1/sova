-- Uvod u sedam koraka i glas brenda (D-108, faza 5).
-- Glas brenda su reči vlasnika (šta prodaje, publika, ton, po čemu je poseban, šta izbegava, glavne teme);
-- imaju prednost nad onim što je analiza zaključila sa sajta. Uvod se završava jednom po brendu.
alter table public.brands add column if not exists voice jsonb not null default '{}'::jsonb;
alter table public.brands add column if not exists setup_completed_at timestamptz;

-- dokument o brendu (PDF): tekst ide u bazu znanja (knowledge_chunks, source_type 'manual');
-- čita ga pozadinski posao, pa red počinje kao 'processing'
create table public.brand_documents (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null,
  size_bytes integer not null check (size_bytes > 0),
  pages integer,
  chars integer not null default 0,
  chunks integer not null default 0,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index brand_documents_brand on public.brand_documents (brand_id, created_at desc) where deleted_at is null;

alter table public.brand_documents enable row level security;
create policy brand_documents_select on public.brand_documents for select to authenticated
  using (deleted_at is null and public.has_brand_access(brand_id));

-- PDF se čuva u brand-assets (do 10 MB), uz logo i fontove brenda
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
 where id = 'brand-assets' and not ('application/pdf' = any(allowed_mime_types));
