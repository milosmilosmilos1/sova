-- Faza 3 · 6/14 · AI i analitika

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  type public.ai_generation_type not null,
  status public.ai_generation_status not null default 'queued',
  provider text not null default 'gemini',
  model text,
  fallback_used boolean not null default false,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  output_asset_id uuid references public.media_assets(id) on delete set null,
  progress jsonb,
  error_code text,
  error_message text,
  duration_ms integer,
  provider_input_tokens integer,
  provider_output_tokens integer,
  provider_images integer,
  cost_usd numeric(10, 6),
  tokens_charged integer not null default 0,
  token_reservation_id uuid,
  idempotency_key text,
  request_id text,
  inngest_run_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (workspace_id, idempotency_key)
);
create index ai_generations_ws on public.ai_generations (workspace_id, created_at desc);
create index ai_generations_brand on public.ai_generations (brand_id, created_at desc);
create index ai_generations_active on public.ai_generations (status) where status in ('queued', 'running');

alter table public.website_crawls
  add constraint website_crawls_gen_fk foreign key (ai_generation_id) references public.ai_generations(id) on delete set null;
alter table public.strategies
  add constraint strategies_gen_fk foreign key (ai_generation_id) references public.ai_generations(id) on delete set null;
alter table public.media_assets
  add constraint media_assets_gen_fk foreign key (ai_generation_id) references public.ai_generations(id) on delete set null;

-- View bez ulaza (input) za approver/viewer uloge
create view public.ai_generations_public
with (security_invoker = true) as
  select id, workspace_id, brand_id, user_id, type, status, model, fallback_used, output_asset_id, progress,
         error_code, error_message, duration_ms, tokens_charged, created_at, started_at, finished_at
  from public.ai_generations;

create table public.post_metrics_snapshots (
  id bigserial primary key,
  target_id uuid not null references public.post_targets(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  horizon text not null check (horizon in ('1h', '24h', '7d', '30d', 'adhoc')),
  captured_at timestamptz not null default now(),
  impressions integer,
  reach integer,
  reactions integer,
  comments integer,
  shares integer,
  saves integer,
  link_clicks integer,
  video_views integer,
  engagement_rate numeric(8, 5),
  raw jsonb
);
create unique index post_metrics_once_per_horizon on public.post_metrics_snapshots (target_id, horizon) where horizon <> 'adhoc';
create index post_metrics_brand on public.post_metrics_snapshots (brand_id, captured_at desc);

create table public.account_metrics_daily (
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  date date not null,
  followers integer,
  following integer,
  reach integer,
  impressions integer,
  profile_views integer,
  website_clicks integer,
  raw jsonb,
  captured_at timestamptz not null default now(),
  primary key (social_account_id, date)
);
create index account_metrics_brand on public.account_metrics_daily (brand_id, date desc);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  items jsonb not null,
  ai_generation_id uuid references public.ai_generations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index insights_brand on public.insights (brand_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'queued' check (status in ('queued', 'ready', 'failed', 'sent')),
  storage_path text,
  sent_to extensions.citext[],
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index reports_brand on public.reports (brand_id, created_at desc);
