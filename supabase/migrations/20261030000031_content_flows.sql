-- Tokovi automatizacije (D-108, faza 3): jedna tema po toku, format i stil, raspored pripreme po danima.
-- Nacrt iz toka uvek ide na odobravanje. Upis samo kroz service role (servis tokova i Inngest).

create table public.content_flows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  topic text not null check (char_length(topic) between 3 and 2000),
  cta text check (char_length(cta) <= 300),
  -- poziv na kraju objave: bez DM-a (link u biu, sajt) ili poziv da se piše u poruke (DM automatizacija)
  cta_mode text not null default 'none' check (cta_mode in ('none', 'dm')),
  format text not null default 'carousel' check (format in ('carousel', 'single', 'story')),
  -- null = vrednost iz dizajna brenda (brands.design)
  style_id text,
  slides smallint check (slides between 1 and 10),
  photo_source text check (photo_source in ('none', 'stock', 'gallery')),
  locale text check (locale in ('sr-Latn', 'sr-Cyrl', 'en', 'uk')),
  -- mreže: sve povezane koje primaju format (i one povezane kasnije) ili izabrani nalozi
  auto_accounts boolean not null default true,
  account_ids uuid[] not null default '{}',
  -- dani pripreme (0 = nedelja … 6 = subota) i vreme u zoni brenda
  days smallint[] not null default '{1,3,5}'
    check (cardinality(days) between 1 and 7 and days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  time_local time not null default '10:00',
  -- Sova sama bira stabilan termin između 07:00 i 21:45, da tokovi ne kreću u isti minut
  auto_time boolean not null default false,
  collaborators text[] not null default '{}' check (cardinality(collaborators) <= 3),
  active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index content_flows_brand on public.content_flows (brand_id, created_at) where deleted_at is null;
create index content_flows_due on public.content_flows (next_run_at) where active and deleted_at is null;

create table public.content_flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.content_flows(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- termin pripreme; isti tok i isti termin se ne pripremaju dvaput
  slot_at timestamptz not null,
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  -- korak za prozor napretka: copy → check → images → done
  step text check (step in ('copy', 'check', 'images', 'done')),
  post_id uuid references public.posts(id) on delete set null deferrable initially deferred,
  tokens integer not null default 0 check (tokens >= 0),
  error text,
  triggered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (flow_id, slot_at)
);
create index content_flow_runs_flow on public.content_flow_runs (flow_id, created_at desc);

-- nacrt zna iz kog je toka (odobravanje prikazuje „Tok: …”)
alter table public.posts
  add column if not exists flow_id uuid references public.content_flows(id) on delete set null deferrable initially deferred;
create index posts_flow on public.posts (flow_id, created_at desc) where flow_id is not null and deleted_at is null;

alter table public.content_flows enable row level security;
create policy content_flows_select on public.content_flows for select to authenticated
  using (deleted_at is null and public.has_brand_access(brand_id));

alter table public.content_flow_runs enable row level security;
create policy content_flow_runs_select on public.content_flow_runs for select to authenticated
  using (public.has_brand_access(brand_id));
