-- Faza 3 · 3/14 · brend i znanje

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  website_url text check (website_url is null or char_length(website_url) <= 2048),
  timezone text not null default 'Europe/Belgrade',
  content_locale text not null default 'sr-Latn',
  autopilot_level smallint not null default 1 check (autopilot_level between 0 and 3),
  autopilot_token_budget integer check (autopilot_token_budget is null or autopilot_token_budget >= 0),
  autopilot_approval_deadline_hours integer not null default 24 check (autopilot_approval_deadline_hours between 1 and 720),
  autopilot_unapproved_action text not null default 'skip' check (autopilot_unapproved_action in ('skip', 'publish')),
  autopilot_level3_confirmed_at timestamptz,
  status public.brand_status not null default 'active',
  paused_at timestamptz,
  paused_by uuid references public.profiles(id) on delete set null,
  logo_asset_id uuid,
  last_site_check_at timestamptz,
  sitemap_hash text,
  feed_hash text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index brands_workspace on public.brands (workspace_id) where deleted_at is null;
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

create table public.member_brand_access (
  workspace_id uuid not null,
  user_id uuid not null,
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id),
  foreign key (workspace_id, user_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create index member_brand_access_brand on public.member_brand_access (brand_id);

create table public.website_crawls (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  url text not null,
  status public.crawl_status not null default 'queued',
  phase text,
  progress jsonb not null default '{}'::jsonb,
  page_limit integer not null default 60,
  pages_found integer not null default 0,
  pages_fetched integer not null default 0,
  robots_blocked boolean not null default false,
  used_firecrawl boolean not null default false,
  error_code text,
  error_message text,
  ai_generation_id uuid,
  idempotency_key text unique,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index website_crawls_brand on public.website_crawls (brand_id, created_at desc);

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  version integer not null,
  data jsonb not null,
  locked_fields text[] not null default '{}',
  is_current boolean not null default false,
  crawl_id uuid references public.website_crawls(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (brand_id, version)
);
create unique index brand_profiles_one_current on public.brand_profiles (brand_id) where is_current;

create table public.website_pages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  crawl_id uuid not null references public.website_crawls(id) on delete cascade,
  url text not null,
  canonical_url text,
  page_type public.page_type not null default 'other',
  title text,
  meta_description text,
  lang text,
  headings jsonb,
  text_content text,
  word_count integer,
  images jsonb,
  json_ld jsonb,
  open_graph jsonb,
  social_links jsonb,
  published_at timestamptz,
  content_hash text not null,
  http_status integer,
  fetched_at timestamptz not null default now(),
  unique (brand_id, url)
);
create index website_pages_crawl on public.website_pages (crawl_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_type text not null check (source_type in ('page', 'blog_post', 'historical_post', 'manual', 'competitor', 'profile')),
  source_id uuid,
  chunk_index integer not null default 0,
  content text not null,
  token_count integer,
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (brand_id, source_type, source_id, chunk_index)
);
create index knowledge_chunks_brand on public.knowledge_chunks (brand_id);
create index knowledge_chunks_embedding on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  url text not null,
  name text,
  summary jsonb,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brand_id, url)
);

create table public.brand_site_checks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  checked_at timestamptz not null default now(),
  sitemap_hash text,
  feed_hash text,
  new_urls text[] not null default '{}',
  changed_urls text[] not null default '{}',
  suggested_profile_update boolean not null default false
);
create index brand_site_checks_brand on public.brand_site_checks (brand_id, checked_at desc);
