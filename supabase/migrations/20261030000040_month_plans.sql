-- Mesečni plan na klik (D-119): Sova bira teme i vrste objava za ceo mesec, korisnik izbaci šta ne
-- želi, pa jednim klikom nastaju svi nacrti (tekst, slajdovi, fotografije, video). Upis ide kroz API
-- i pozadinski posao (service role); korisnici brenda čitaju.
create table public.month_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade deferrable initially deferred,
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  month date not null check (extract(day from month) = 1),
  period_start date not null,
  period_end date not null,
  status text not null default 'planning' check (status in ('planning', 'ready', 'generating', 'done', 'failed')),
  settings jsonb not null default '{}'::jsonb,
  error text,
  tokens_charged integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index month_plans_brand on public.month_plans (brand_id, month desc, created_at desc);

create table public.month_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.month_plans(id) on delete cascade deferrable initially deferred,
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  position smallint not null,
  scheduled_for timestamptz not null,
  format text not null check (format in ('text', 'image', 'carousel', 'video', 'story', 'link')),
  platforms text[] not null check (cardinality(platforms) between 1 and 8),
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  brief text not null default '' check (char_length(brief) <= 1000),
  goal text not null default 'engagement' check (goal in ('awareness', 'engagement', 'sales', 'education')),
  pillar text check (pillar is null or char_length(pillar) <= 60),
  cta text check (cta is null or char_length(cta) <= 200),
  status text not null default 'planned' check (status in ('planned', 'generating', 'done', 'failed')),
  post_id uuid references public.posts(id) on delete set null deferrable initially deferred,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index month_plan_items_plan on public.month_plan_items (plan_id, scheduled_for);

alter table public.month_plans enable row level security;
alter table public.month_plan_items enable row level security;
create policy month_plans_select on public.month_plans for select to authenticated
  using (public.has_brand_access(brand_id));
create policy month_plan_items_select on public.month_plan_items for select to authenticated
  using (public.has_brand_access(brand_id));

-- plan za mesec (Gemini bira teme i uglove za sve termine)
alter type public.ai_generation_type add value if not exists 'month_plan';
