-- Faza 3 · 5/14 · sadržaj i objavljivanje

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  kind public.media_kind not null,
  source public.media_source not null,
  bucket text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer,
  height integer,
  duration_ms integer,
  sha256 text,
  alt_text text,
  tags text[] not null default '{}',
  attribution jsonb,
  source_data jsonb,
  is_ai_generated boolean not null default false,
  exif_stripped boolean not null default true,
  ai_generation_id uuid,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (bucket, storage_path)
);
create index media_assets_brand on public.media_assets (brand_id, created_at desc) where deleted_at is null;
create index media_assets_sha on public.media_assets (workspace_id, sha256);

alter table public.brands
  add constraint brands_logo_fk foreign key (logo_asset_id) references public.media_assets(id) on delete set null;

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  version integer not null default 1,
  status public.strategy_status not null default 'draft',
  goals jsonb not null default '[]'::jsonb,
  network_mix jsonb not null default '{}'::jsonb,
  weekly_themes jsonb not null default '[]'::jsonb,
  hashtag_strategy jsonb not null default '{}'::jsonb,
  best_times jsonb not null default '{}'::jsonb,
  uses_assumptions boolean not null default true,
  summary text,
  assumptions jsonb not null default '[]'::jsonb,
  ai_generation_id uuid,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  unique (brand_id, period_start, version)
);
create trigger strategies_updated_at before update on public.strategies
  for each row execute function public.set_updated_at();

create table public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  description text,
  share_percent smallint check (share_percent is null or share_percent between 0 and 100),
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);
create index content_pillars_brand on public.content_pillars (brand_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  name text not null check (char_length(name) between 1 and 150),
  goal text,
  starts_on date,
  ends_on date,
  key_message text,
  offer text,
  cta text,
  utm_campaign text,
  created_at timestamptz not null default now()
);
create index campaigns_brand on public.campaigns (brand_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text check (title is null or char_length(title) <= 200),
  master_text text not null default '' check (char_length(master_text) <= 20000),
  status public.post_status not null default 'draft',
  source public.post_source not null default 'manual',
  pillar_id uuid references public.content_pillars(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  strategy_id uuid references public.strategies(id) on delete set null,
  suggestion_id uuid,
  parent_post_id uuid references public.posts(id) on delete set null,
  is_evergreen boolean not null default false,
  evergreen_interval_days integer check (evergreen_interval_days is null or evergreen_interval_days between 7 and 365),
  first_comment text check (first_comment is null or char_length(first_comment) <= 2200),
  link_url text,
  utm jsonb,
  language text,
  scheduled_for timestamptz,
  version integer not null default 1,
  locked_at timestamptz,
  similarity_warning jsonb,
  qa_report jsonb,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index posts_brand_status on public.posts (brand_id, status) where deleted_at is null;
create index posts_calendar on public.posts (brand_id, scheduled_for) where deleted_at is null;
create index posts_workspace on public.posts (workspace_id);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform public.social_platform not null,
  text_content text not null default '' check (char_length(text_content) <= 20000),
  options jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status public.target_status not null default 'pending',
  idempotency_key text not null unique default gen_random_uuid()::text,
  external_post_id text,
  permalink text,
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  last_attempt_at timestamptz,
  published_at timestamptz,
  publish_latency_ms integer,
  inngest_run_id text,
  assisted boolean not null default false,
  assisted_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, social_account_id)
);
create index post_targets_due on public.post_targets (scheduled_at) where status = 'scheduled';
create index post_targets_account on public.post_targets (social_account_id, scheduled_at);
create index post_targets_brand on public.post_targets (brand_id);
-- date_trunc nad timestamptz nije IMMUTABLE (zavisi od zone); epoha ne zavisi, pa je wrapper bezbedno immutable.
create or replace function public.minute_bucket(ts timestamptz)
returns bigint
language sql immutable
set search_path = ''
as $$
  select floor(extract(epoch from ts) / 60)::bigint;
$$;
create unique index post_targets_no_same_minute
  on public.post_targets (social_account_id, (public.minute_bucket(scheduled_at)))
  where status in ('scheduled', 'publishing');
create trigger post_targets_updated_at before update on public.post_targets
  for each row execute function public.set_updated_at();

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  target_id uuid references public.post_targets(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  sort_order integer not null default 0,
  crop jsonb
);
create unique index post_media_unique on public.post_media (post_id, media_asset_id, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index post_media_asset on public.post_media (media_asset_id);

create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  change_summary text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, version)
);

create table public.approval_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  token_hash text not null unique,
  post_ids uuid[] not null,
  client_label text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_links_brand on public.approval_links (brand_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  approval_link_id uuid references public.approval_links(id) on delete set null,
  author_name text,
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index post_comments_post on public.post_comments (post_id, created_at);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  step smallint not null default 1 check (step in (1, 2)),
  requested_by uuid references public.profiles(id) on delete set null,
  approver_id uuid references public.profiles(id) on delete set null,
  approval_link_id uuid references public.approval_links(id) on delete set null,
  decision public.approval_decision,
  comment text,
  post_version integer not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index approvals_post on public.approvals (post_id, created_at desc);

create table public.publish_attempts (
  id bigserial primary key,
  target_id uuid not null references public.post_targets(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  attempt_no integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('success', 'retryable_error', 'permanent_error', 'skipped')),
  http_status integer,
  error_code text,
  error_message text,
  response_excerpt jsonb,
  inngest_run_id text
);
create index publish_attempts_target on public.publish_attempts (target_id);

create table public.queue_slots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  time_local time not null,
  source text not null default 'manual' check (source in ('manual', 'best_time')),
  is_active boolean not null default true,
  unique (social_account_id, weekday, time_local)
);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source public.suggestion_source not null,
  kind text not null,
  title text not null check (char_length(title) <= 200),
  body text,
  payload jsonb not null default '{}'::jsonb,
  evidence jsonb,
  score numeric(5, 2),
  status public.suggestion_status not null default 'new',
  expires_at timestamptz,
  accepted_post_id uuid references public.posts(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index suggestions_inbox on public.suggestions (brand_id, created_at desc) where status = 'new';
alter table public.posts
  add constraint posts_suggestion_fk foreign key (suggestion_id) references public.suggestions(id) on delete set null;

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  date date not null,
  name text not null,
  kind text not null default 'public' check (kind in ('public', 'religious', 'observance', 'commercial')),
  unique (country, date, name)
);
create index holidays_country_date on public.holidays (country, date);

-- Matrica dozvoljenih prelaza statusa (druga linija odbrane posle TypeScript state machine-a)
create table public.status_transitions (
  scope text not null check (scope in ('post', 'target')),
  from_status text not null,
  to_status text not null,
  service_only boolean not null default false,
  primary key (scope, from_status, to_status)
);

insert into public.status_transitions (scope, from_status, to_status, service_only) values
  ('post', 'draft', 'in_review', false),
  ('post', 'draft', 'scheduled', false),
  ('post', 'draft', 'canceled', false),
  ('post', 'in_review', 'approved', false),
  ('post', 'in_review', 'rejected', false),
  ('post', 'in_review', 'draft', false),
  ('post', 'approved', 'scheduled', false),
  ('post', 'approved', 'draft', false),
  ('post', 'approved', 'canceled', false),
  ('post', 'rejected', 'draft', false),
  ('post', 'scheduled', 'publishing', true),
  ('post', 'scheduled', 'paused', false),
  ('post', 'scheduled', 'canceled', false),
  ('post', 'scheduled', 'draft', false),
  ('post', 'paused', 'scheduled', false),
  ('post', 'paused', 'canceled', false),
  ('post', 'publishing', 'published', true),
  ('post', 'publishing', 'failed', true),
  ('post', 'publishing', 'partially_published', true),
  ('post', 'publishing', 'scheduled', true),
  ('post', 'failed', 'scheduled', false),
  ('post', 'failed', 'draft', false),
  ('post', 'failed', 'canceled', false),
  ('post', 'partially_published', 'published', true),
  ('post', 'partially_published', 'failed', true),
  ('post', 'canceled', 'draft', false),
  ('target', 'pending', 'scheduled', false),
  ('target', 'pending', 'canceled', false),
  ('target', 'pending', 'assisted_pending', false),
  ('target', 'scheduled', 'publishing', true),
  ('target', 'scheduled', 'paused', false),
  ('target', 'scheduled', 'canceled', false),
  ('target', 'scheduled', 'pending', false),
  ('target', 'scheduled', 'needs_reauth', true),
  ('target', 'scheduled', 'assisted_pending', true),
  ('target', 'paused', 'scheduled', false),
  ('target', 'paused', 'canceled', false),
  ('target', 'paused', 'needs_reauth', true),
  ('target', 'needs_reauth', 'scheduled', false),
  ('target', 'needs_reauth', 'canceled', false),
  ('target', 'publishing', 'published', true),
  ('target', 'publishing', 'failed', true),
  ('target', 'publishing', 'scheduled', true),
  ('target', 'failed', 'scheduled', false),
  ('target', 'failed', 'canceled', false),
  ('target', 'failed', 'assisted_pending', false),
  ('target', 'published', 'deleted_externally', true),
  ('target', 'assisted_pending', 'assisted_done', false),
  ('target', 'assisted_pending', 'canceled', false),
  ('target', 'canceled', 'pending', false);
