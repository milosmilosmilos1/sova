# Sova — šema baze, RLS i RPC

Verzija 1.0 (faza 1). Ovo je plan migracija za fazu 3. Sintaksa je Postgres 15+ na Supabase-u. Sve tabele su u šemi `public`, sve imaju RLS. Vremena su `timestamptz` u UTC. Primarni ključevi su `uuid default gen_random_uuid()` osim gde je naznačeno `bigserial` (append-only logovi, radi redosleda).

Konvencije:

- `created_at timestamptz not null default now()`, `updated_at` sa trigger funkcijom `set_updated_at()`.
- Meko brisanje (`deleted_at`) samo na `workspaces`, `brands`, `posts`, `media_assets`. Sve ostalo je tvrdo brisanje sa kaskadom.
- Enkriptovane kolone su `bytea` sa prefiksom verzije ključa u koloni `key_version`.
- Jedinstvenosti koje štite od duplog novca su UNIQUE ograničenja, ne provere u kodu.
- Tabele su ovde grupisane po smislu, ne po redosledu kreiranja. U migraciji idu redom: enumi → profiles, workspaces, workspace_members → brands → ostalo; FK ka tabelama koje nastaju kasnije dodaju se `alter table ... add constraint` na kraju (primeri su već tako napisani za `brands.logo_asset_id` i `ai_generation_id` kolone).

Sadržaj: 1 ekstenzije i enumi · 2 tabele po grupama · 3 pomoćne funkcije · 4 RLS politike · 5 RPC funkcije · 6 trigeri · 7 storage · 8 seed · 9 testovi

---

## 1. Ekstenzije i enumi

```sql
create extension if not exists pgcrypto;
create extension if not exists vector;      -- pgvector
create extension if not exists citext;
create extension if not exists pg_trgm;     -- pretraga po imenu/emailu u adminu

create type platform_role as enum ('user', 'platform_admin');
create type workspace_type as enum ('business', 'agency');
create type workspace_role as enum ('owner', 'admin', 'editor', 'approver', 'viewer');
create type invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type brand_status as enum ('active', 'paused', 'archived');
create type crawl_status as enum ('queued', 'running', 'succeeded', 'partial', 'failed', 'canceled');
create type page_type as enum ('home','about','services','products','pricing','portfolio','case_study',
                               'blog_index','blog_post','reviews','faq','contact','team','careers','legal','other');
create type social_platform as enum ('facebook','instagram','linkedin','tiktok','x','youtube','pinterest','google_business');
create type social_account_status as enum ('active','needs_reauth','disabled','revoked');
create type post_status as enum ('draft','in_review','approved','scheduled','publishing','published',
                                 'partially_published','failed','rejected','paused','canceled');
create type target_status as enum ('pending','scheduled','publishing','published','failed','paused',
                                   'needs_reauth','canceled','deleted_externally','assisted_pending','assisted_done');
create type post_source as enum ('manual','ai','autopilot','suggestion','evergreen','import');
create type media_source as enum ('upload','canva','unsplash','template','gemini');
create type media_kind as enum ('image','video');
create type ai_generation_type as enum ('text','rewrite','translate','hashtags','repurpose','variants',
  'image_from_photo','image_from_prompt','visual_template','vision_describe','unsplash_rank',
  'strategy','insights','brand_profile','photo_style','embedding','quality_check','canva_design','canva_export');
create type ai_generation_status as enum ('queued','running','succeeded','failed','canceled');
create type token_grant_source as enum ('signup','subscription','topup','admin','refund');
create type token_reservation_status as enum ('reserved','confirmed','released','expired');
create type ledger_reason as enum ('grant','consume','refund','admin_adjust','expire');
create type plan_kind as enum ('subscription','topup');
create type subscription_status as enum ('trialing','active','past_due','canceled','unpaid','incomplete','paused');
create type payment_event_status as enum ('received','processing','processed','failed','ignored');
create type suggestion_source as enum ('blog','site_change','holiday','analytics','insight','evergreen','manual');
create type suggestion_status as enum ('new','accepted','dismissed','expired');
create type approval_decision as enum ('approved','rejected','changes_requested');
create type strategy_status as enum ('draft','active','archived');
create type impersonation_mode as enum ('read_only','full');
create type notification_channel as enum ('in_app','email');
```

---

## 2. Tabele

### 2.1 Identitet i tim

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,                      -- kopija radi admin pretrage, sinhronizuje trigger na auth.users
  full_name text check (char_length(full_name) <= 100),
  avatar_url text,
  locale text not null default 'sr-Latn' check (locale in ('sr-Latn','en')),
  timezone text not null default 'Europe/Belgrade',
  platform_role platform_role not null default 'user',
  is_banned boolean not null default false,
  banned_reason text,
  banned_at timestamptz,
  email_verified_at timestamptz,
  onboarding_completed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_trgm on profiles using gin (email gin_trgm_ops);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  type workspace_type not null default 'business',
  owner_id uuid not null references profiles(id) on delete restrict,
  billing_email citext,
  country text,                                -- ISO 3166-1 alpha-2, za PDV i praznike
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role workspace_role not null default 'editor',
  all_brands boolean not null default true,    -- false → vidi samo member_brand_access
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on workspace_members(user_id);

create table member_brand_access (
  workspace_id uuid not null,
  user_id uuid not null,
  brand_id uuid not null references brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id),
  foreign key (workspace_id, user_id) references workspace_members(workspace_id, user_id) on delete cascade
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email citext not null,
  role workspace_role not null,
  brand_ids uuid[],                            -- null = svi brendovi
  token_hash text not null unique,             -- sha256(token), token ide samo u email
  invited_by uuid not null references profiles(id) on delete cascade,
  status invitation_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index invitations_pending_unique on invitations(workspace_id, email) where status = 'pending';
```

### 2.2 Brend i znanje

```sql
create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  website_url text,                            -- null = biznis bez sajta
  timezone text not null default 'Europe/Belgrade',
  content_locale text not null default 'sr-Latn',   -- sr-Latn | sr-Cyrl | en | ...
  autopilot_level smallint not null default 1 check (autopilot_level between 0 and 3),
  autopilot_token_budget integer check (autopilot_token_budget >= 0),
  autopilot_approval_deadline_hours integer not null default 24,
  autopilot_unapproved_action text not null default 'skip' check (autopilot_unapproved_action in ('skip','publish')),
  autopilot_level3_confirmed_at timestamptz,   -- nivo 3 traži izričitu potvrdu
  status brand_status not null default 'active',
  paused_at timestamptz,
  paused_by uuid references profiles(id) on delete set null,
  logo_asset_id uuid,                          -- fk na media_assets dodaje se posle kreiranja te tabele
  last_site_check_at timestamptz,
  sitemap_hash text,
  feed_hash text,
  settings jsonb not null default '{}',        -- UTM podrazumevano, zabranjene reči, hashtag setovi
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index brands_workspace on brands(workspace_id) where deleted_at is null;

create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  version integer not null,
  data jsonb not null,                         -- Zod šema BrandProfile, svako polje {value, confidence, source_urls}
  locked_fields text[] not null default '{}',  -- JSON putanje koje je korisnik ručno menjao
  is_current boolean not null default false,
  crawl_id uuid references website_crawls(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,  -- null = sistem
  created_at timestamptz not null default now(),
  unique (brand_id, version)
);
create unique index brand_profiles_one_current on brand_profiles(brand_id) where is_current;

create table website_crawls (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  url text not null,
  status crawl_status not null default 'queued',
  phase text,                                  -- 'discover' | 'fetch' | 'visual' | 'profile' | 'embed'
  progress jsonb not null default '{}',        -- {pages_found, pages_fetched, services_found, ...} za Realtime
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
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index website_crawls_brand on website_crawls(brand_id, created_at desc);

create table website_pages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  crawl_id uuid not null references website_crawls(id) on delete cascade,
  url text not null,
  canonical_url text,
  page_type page_type not null default 'other',
  title text,
  meta_description text,
  lang text,
  headings jsonb,                              -- {h1:[], h2:[], h3:[]}
  text_content text,                           -- očišćen tekst bez navigacije i futera
  word_count integer,
  images jsonb,                                -- [{src, alt, width, height}]
  json_ld jsonb,
  open_graph jsonb,
  social_links jsonb,                          -- {facebook: url, instagram: url, ...}
  published_at timestamptz,                    -- za blog postove
  content_hash text not null,
  http_status integer,
  fetched_at timestamptz not null default now(),
  unique (brand_id, url)
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  source_type text not null check (source_type in ('page','blog_post','historical_post','manual','competitor','profile')),
  source_id uuid,
  chunk_index integer not null default 0,
  content text not null,
  token_count integer,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}',        -- {url, title, page_type, published_at}
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (brand_id, source_type, source_id, chunk_index)
);
create index knowledge_chunks_brand on knowledge_chunks(brand_id);
create index knowledge_chunks_embedding on knowledge_chunks using hnsw (embedding vector_cosine_ops);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  url text not null,
  name text,
  summary jsonb,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brand_id, url)
);

create table brand_site_checks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  checked_at timestamptz not null default now(),
  sitemap_hash text,
  feed_hash text,
  new_urls text[] not null default '{}',
  changed_urls text[] not null default '{}',
  suggested_profile_update boolean not null default false
);
```

### 2.3 Integracije

```sql
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,  -- denormalizovano za RLS
  platform social_platform not null,
  external_id text not null,                   -- page id, ig user id, urn, open_id, channel id, location name
  external_parent_id text,                     -- npr. Facebook Page za Instagram Business nalog
  name text not null,
  username text,
  avatar_url text,
  account_type text not null,                  -- page | business | creator | personal | organization | channel | location | board_owner
  access_token_enc bytea,
  refresh_token_enc bytea,
  key_version smallint not null default 1,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status social_account_status not null default 'active',
  status_reason text,
  capabilities jsonb not null default '{}',    -- {image, carousel, video, reels, stories, link, text, assisted_only}
  metadata jsonb not null default '{}',        -- TikTok creator_info, YouTube kvota, IG content_publishing_limit
  assisted_only boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform, external_id)
);
create index social_accounts_token_expiry on social_accounts(token_expires_at) where status = 'active';

create view social_accounts_public with (security_invoker = true) as
  select id, brand_id, workspace_id, platform, external_id, external_parent_id, name, username, avatar_url,
         account_type, token_expires_at, scopes, status, status_reason, capabilities, assisted_only,
         last_synced_at, last_error, connected_by, created_at, updated_at
  from social_accounts;

create table oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,     -- null za Canva (workspace nivo)
  provider text not null,                      -- social_platform ili 'canva'
  code_verifier_enc bytea,                     -- PKCE
  redirect_to text,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table canva_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  canva_user_id text not null,
  team_id text,
  plan_hint text,                              -- 'free' | 'pro' | 'teams' | 'enterprise' | 'unknown'
  autofill_available boolean not null default false,
  access_token_enc bytea not null,
  refresh_token_enc bytea not null,
  key_version smallint not null default 1,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  status social_account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table historical_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  social_account_id uuid not null references social_accounts(id) on delete cascade,
  external_id text not null,
  post_type text,                              -- image | carousel | video | reel | story | text | link
  text_content text,
  media jsonb,
  permalink text,
  published_at timestamptz,
  metrics jsonb not null default '{}',         -- normalizovane metrike u trenutku uvoza
  imported_at timestamptz not null default now(),
  unique (social_account_id, external_id)
);
```

### 2.4 Sadržaj i objavljivanje

```sql
create table strategies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end > period_start),
  version integer not null default 1,
  status strategy_status not null default 'draft',
  goals jsonb not null default '[]',           -- [{goal, kpi, target}]
  network_mix jsonb not null default '{}',     -- {instagram: {per_week: 3, formats: [...]}, ...}
  weekly_themes jsonb not null default '[]',
  hashtag_strategy jsonb not null default '{}',
  best_times jsonb not null default '{}',      -- {platform: [{weekday, hour, source: 'data'|'assumption'}]}
  uses_assumptions boolean not null default true,
  ai_generation_id uuid,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, period_start, version)
);

create table content_pillars (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  strategy_id uuid references strategies(id) on delete set null,
  name text not null,
  description text,
  share_percent smallint check (share_percent between 0 and 100),
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  strategy_id uuid references strategies(id) on delete set null,
  name text not null,
  goal text,
  starts_on date,
  ends_on date,
  key_message text,
  offer text,                                  -- samo iz profila ili ručno uneto
  cta text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text,                                  -- interni naziv u kalendaru
  master_text text not null default '',
  status post_status not null default 'draft',
  source post_source not null default 'manual',
  pillar_id uuid references content_pillars(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  strategy_id uuid references strategies(id) on delete set null,
  suggestion_id uuid,
  parent_post_id uuid references posts(id) on delete set null,   -- evergreen ponovna upotreba, dupliranje
  is_evergreen boolean not null default false,
  evergreen_interval_days integer,
  first_comment text,
  link_url text,
  utm jsonb,
  language text,
  scheduled_for timestamptz,                   -- zajednički termin; target može da odstupa
  version integer not null default 1,          -- optimistic locking
  locked_at timestamptz,                       -- tokom publishing
  similarity_warning jsonb,                    -- {post_id, score}
  qa_report jsonb,                             -- rezultat Autopilot QA
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index posts_brand_status on posts(brand_id, status) where deleted_at is null;
create index posts_calendar on posts(brand_id, scheduled_for) where deleted_at is null;

create table post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  social_account_id uuid not null references social_accounts(id) on delete cascade,
  platform social_platform not null,
  text_content text not null default '',
  options jsonb not null default '{}',         -- {ig: {type: 'reel'|'feed'|'story', alt_text}, tiktok: {privacy_level, ...}, gbp: {topic_type, cta}}
  scheduled_at timestamptz,
  status target_status not null default 'pending',
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
create index post_targets_due on post_targets(scheduled_at) where status = 'scheduled';
create index post_targets_account on post_targets(social_account_id, scheduled_at);
create unique index post_targets_no_same_minute on post_targets(social_account_id, date_trunc('minute', scheduled_at))
  where status in ('scheduled','publishing');

create table post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  target_id uuid references post_targets(id) on delete cascade,  -- null = važi za sve mreže
  media_asset_id uuid not null references media_assets(id) on delete restrict,
  sort_order integer not null default 0,
  crop jsonb,                                  -- {aspect, x, y, w, h} po formatu
  unique (post_id, media_asset_id, target_id)
);

create table post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,                     -- master_text, targets[], media[]
  change_summary text,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, version)
);

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  approval_link_id uuid references approval_links(id) on delete set null,
  author_name text,                            -- za komentare preko javnog linka
  body text not null check (char_length(body) <= 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table approval_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  token_hash text not null unique,
  post_ids uuid[] not null,
  client_label text,
  created_by uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  step smallint not null default 1,            -- 1 interno, 2 klijent
  requested_by uuid references profiles(id) on delete set null,
  approver_id uuid references profiles(id) on delete set null,
  approval_link_id uuid references approval_links(id) on delete set null,
  decision approval_decision,
  comment text,
  post_version integer not null,               -- na koju verziju se odluka odnosi
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table publish_attempts (
  id bigserial primary key,
  target_id uuid not null references post_targets(id) on delete cascade,
  attempt_no integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('success','retryable_error','permanent_error','skipped')),
  http_status integer,
  error_code text,
  error_message text,
  response_excerpt jsonb,                      -- sanitizovano, bez tokena
  inngest_run_id text
);
create index publish_attempts_target on publish_attempts(target_id);

create table queue_slots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  social_account_id uuid not null references social_accounts(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  time_local time not null,
  source text not null default 'manual' check (source in ('manual','best_time')),
  is_active boolean not null default true,
  unique (social_account_id, weekday, time_local)
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  source suggestion_source not null,
  kind text not null,                          -- post_idea | repeat_format | campaign | profile_update | strategy_tweak
  title text not null,
  body text,
  payload jsonb not null default '{}',         -- spreman nacrt: tekst po mreži, predlog vizuala, termin
  evidence jsonb,                              -- linkovi ka objavama ili stranama na kojima se zasniva
  score numeric(5,2),
  status suggestion_status not null default 'new',
  expires_at timestamptz,
  accepted_post_id uuid references posts(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index suggestions_inbox on suggestions(brand_id, created_at desc) where status = 'new';

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  kind media_kind not null,
  source media_source not null,
  bucket text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  sha256 text,
  alt_text text,
  tags text[] not null default '{}',
  attribution jsonb,                           -- unsplash: {photographer, profile_url, photo_id}; canva: {design_id}; gemini: {model}
  source_data jsonb,
  is_ai_generated boolean not null default false,
  exif_stripped boolean not null default true,
  ai_generation_id uuid,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (bucket, storage_path)
);
create index media_assets_brand on media_assets(brand_id, created_at desc) where deleted_at is null;
create index media_assets_sha on media_assets(workspace_id, sha256);
alter table brands add constraint brands_logo_fk foreign key (logo_asset_id) references media_assets(id) on delete set null;

create table holidays (
  id uuid primary key default gen_random_uuid(),
  country text not null,                       -- 'RS', 'ME', 'BA', 'HR', 'US', 'GLOBAL'
  date date not null,
  name text not null,
  kind text not null default 'public' check (kind in ('public','religious','observance','commercial')),
  unique (country, date, name)
);
```

### 2.5 AI i analitika

```sql
create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,     -- null = Autopilot
  type ai_generation_type not null,
  status ai_generation_status not null default 'queued',
  provider text not null default 'gemini',
  model text,
  fallback_used boolean not null default false,
  input jsonb not null default '{}',           -- sanitizovan ulaz (bez slika u base64, samo reference)
  output jsonb,
  output_asset_id uuid references media_assets(id) on delete set null,
  progress jsonb,                              -- za Realtime: {step, message}
  error_code text,
  error_message text,
  duration_ms integer,
  provider_input_tokens integer,
  provider_output_tokens integer,
  provider_images integer,
  cost_usd numeric(10,6),
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
create index ai_generations_ws on ai_generations(workspace_id, created_at desc);
create index ai_generations_active on ai_generations(status) where status in ('queued','running');
alter table website_crawls add constraint website_crawls_gen_fk foreign key (ai_generation_id) references ai_generations(id) on delete set null;
alter table strategies add constraint strategies_gen_fk foreign key (ai_generation_id) references ai_generations(id) on delete set null;
alter table media_assets add constraint media_assets_gen_fk foreign key (ai_generation_id) references ai_generations(id) on delete set null;

create table post_metrics_snapshots (
  id bigserial primary key,
  target_id uuid not null references post_targets(id) on delete cascade,
  social_account_id uuid not null references social_accounts(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  horizon text not null check (horizon in ('1h','24h','7d','30d','adhoc')),
  captured_at timestamptz not null default now(),
  impressions integer, reach integer, reactions integer, comments integer, shares integer, saves integer,
  link_clicks integer, video_views integer,
  engagement_rate numeric(8,5),                -- (reactions+comments+shares+saves) / reach, ili / impressions ako reach nije dostupan
  raw jsonb
);
create unique index post_metrics_once_per_horizon on post_metrics_snapshots(target_id, horizon) where horizon <> 'adhoc';
create index post_metrics_brand on post_metrics_snapshots(brand_id, captured_at desc);

create table account_metrics_daily (
  social_account_id uuid not null references social_accounts(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  date date not null,
  followers integer, following integer, reach integer, impressions integer, profile_views integer, website_clicks integer,
  raw jsonb,
  captured_at timestamptz not null default now(),
  primary key (social_account_id, date)
);

create table insights (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  items jsonb not null,                        -- [{claim, recommendation, evidence_post_ids[], confidence}]
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'queued' check (status in ('queued','ready','failed','sent')),
  storage_path text,
  sent_to citext[],
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
```

### 2.6 Naplata i tokeni

```sql
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                   -- free | monthly | yearly | topup_100 | topup_300 ...
  kind plan_kind not null,
  name text not null,
  interval text check (interval in ('month','year')),         -- null za free i topup
  price_cents integer not null default 0,
  currency text not null default 'USD',
  tokens_per_period integer not null,
  token_period text not null default 'once' check (token_period in ('once','month')),  -- godišnji plan: 500 mesečno
  limits jsonb not null default '{}',          -- {brands, social_accounts, members}
  provider_price_ids jsonb not null default '{}',   -- {stripe: 'price_...', paddle: 'pri_...'}
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,                      -- stripe | paddle
  provider_customer_id text not null,
  provider_subscription_id text not null,
  plan_id uuid not null references plans(id),
  status subscription_status not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  grace_until timestamptz,                     -- 7 dana posle neuspelog plaćanja
  last_invoice_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create unique index subscriptions_one_active
  on subscriptions(workspace_id) where status in ('trialing','active','past_due');

create table token_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source token_grant_source not null,
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz,                      -- null = ne ističe (signup, topup)
  reference_type text,                         -- invoice | checkout | admin | refund | signup
  reference text,                              -- id fakture / sesije; UNIQUE sa source
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (remaining <= amount),
  unique (source, reference)
);
create index token_grants_available on token_grants(workspace_id, expires_at) where remaining > 0;

create table token_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  generation_id uuid references ai_generations(id) on delete set null,
  amount integer not null check (amount > 0),
  allocations jsonb not null,                  -- [{grant_id, amount}]
  status token_reservation_status not null default 'reserved',
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index token_reservations_open on token_reservations(workspace_id) where status = 'reserved';
alter table ai_generations add constraint ai_generations_reservation_fk
  foreign key (token_reservation_id) references token_reservations(id) on delete set null;

create table token_ledger (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason ledger_reason not null,
  grant_id uuid references token_grants(id) on delete set null,
  reservation_id uuid references token_reservations(id) on delete set null,
  generation_id uuid references ai_generations(id) on delete set null,
  reference text,
  actor_id uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index token_ledger_ws on token_ledger(workspace_id, id desc);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status payment_event_status not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
```

### 2.7 Admin i sistem

```sql
create table admin_audit_log (
  id bigserial primary key,
  admin_id uuid not null references profiles(id) on delete restrict,
  action text not null,                        -- user.view, user.ban, tokens.adjust, impersonation.start, flag.update ...
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  impersonation_session_id uuid,
  request_id text,
  created_at timestamptz not null default now()
);
create index admin_audit_admin on admin_audit_log(admin_id, id desc);
create index admin_audit_target on admin_audit_log(target_type, target_id);

create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (char_length(reason) >= 10),
  mode impersonation_mode not null default 'read_only',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  ended_at timestamptz,
  end_reason text,
  ip inet,
  check (admin_id <> user_id)
);
alter table admin_audit_log add constraint admin_audit_imp_fk
  foreign key (impersonation_session_id) references impersonation_sessions(id) on delete set null;

create table feature_flags (
  key text primary key,                        -- platform.instagram, platform.x, firecrawl, canva_autofill ...
  enabled boolean not null default false,
  description text,
  rollout jsonb not null default '{}',         -- {workspace_allowlist: [], percent: 0}
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table platform_settings (
  key text primary key,                        -- token_prices, model_prices, allowed_models, maintenance, rate_limits, plan_limits
  value jsonb not null,
  description text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  type text not null,                          -- post.published, post.failed, account.needs_reauth, approval.requested, tokens.low, autopilot.budget ...
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread on notifications(user_id, created_at desc) where read_at is null;

create table notification_preferences (
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,
  channel notification_channel not null,
  enabled boolean not null default true,
  primary key (user_id, workspace_id, type, channel)
);

create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  scope text not null,                         -- naziv rute
  key text not null,
  request_hash text not null,
  status text not null default 'in_progress' check (status in ('in_progress','done')),
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  unique (workspace_id, scope, key)
);

create table user_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                          -- blocked_content, abuse_rate, chargeback
  count integer not null default 1,
  last_at timestamptz not null default now(),
  note text,
  unique (user_id, kind)
);

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,   -- set null posle brisanja, red ostaje radi statusa
  email citext,
  source text not null check (source in ('user','meta_callback','admin')),
  external_user_id text,                       -- Meta signed_request user_id
  confirmation_code text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','ready','failed','expired')),
  storage_path text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
```

---

## 3. Pomoćne funkcije

Sve su `security definer`, `stable`, `set search_path = ''`, i vraćaju samo boolean ili enum. EXECUTE se daje `authenticated` ulozi jer ih politike zovu u kontekstu korisnika.

```sql
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.platform_role = 'platform_admin' and not p.is_banned);
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m
                 join public.profiles p on p.id = m.user_id
                 where m.workspace_id = ws and m.user_id = auth.uid() and not p.is_banned);
$$;

create or replace function public.workspace_role(ws uuid)
returns public.workspace_role language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid();
$$;

create or replace function public.has_brand_access(b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.brands br
    join public.workspace_members m on m.workspace_id = br.workspace_id and m.user_id = auth.uid()
    join public.profiles p on p.id = m.user_id and not p.is_banned
    where br.id = b
      and (m.all_brands or exists (select 1 from public.member_brand_access a where a.user_id = auth.uid() and a.brand_id = b))
  );
$$;

create or replace function public.brand_workspace(b uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select workspace_id from public.brands where id = b;
$$;

-- Impersonacija u read-only režimu: svaka politika za pisanje dodaje "and not public.is_impersonation_readonly()"
create or replace function public.is_impersonation_readonly()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'imp' ->> 'ro')::boolean, false);
$$;
```

Konvencija za pisanje: `can_edit(ws) = workspace_role(ws) in ('owner','admin','editor')`, `can_admin(ws) = role in ('owner','admin')`, `can_approve(ws) = role in ('owner','admin','approver')`.

---

## 4. RLS politike

RLS je uključen (`enable row level security` + `force row level security` za vlasnika tabele) na svih 52 tabele. Service role zaobilazi RLS i koristi se samo iz `admin.ts` i Inngest funkcija.

| Tabela                                                  | SELECT                                                                                               | INSERT                                                               | UPDATE                                                                                                   | DELETE                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| profiles                                                | sopstveni red ili platform admin                                                                     | nikad kroz klijent (trigger na auth.users)                           | sopstveni red, ali ne `platform_role`, `is_banned` (trigger odbija promenu tih kolona osim service role) | nikad                                                                      |
| workspaces                                              | član                                                                                                 | ulogovan (RPC `create_workspace`)                                    | owner, admin                                                                                             | owner (meko)                                                               |
| workspace_members                                       | član workspace-a                                                                                     | owner, admin (RPC za pozivnice)                                      | owner, admin; niko ne može sebe da unapredi u owner-a                                                    | owner, admin; sopstveni red (napuštanje) osim poslednjeg owner-a (trigger) |
| member_brand_access                                     | član                                                                                                 | owner, admin                                                         | owner, admin                                                                                             | owner, admin                                                               |
| invitations                                             | owner, admin                                                                                         | owner, admin                                                         | owner, admin (opoziv)                                                                                    | owner, admin                                                               |
| brands                                                  | has_brand_access                                                                                     | can_edit(ws) + limit plana (RPC)                                     | can_edit                                                                                                 | owner, admin                                                               |
| brand_profiles                                          | has_brand_access                                                                                     | service role (sistem) ili can_edit (ručna izmena pravi novu verziju) | can_edit samo `locked_fields` i `is_current` (restore)                                                   | nikad                                                                      |
| website_crawls, website_pages, brand_site_checks        | has_brand_access                                                                                     | service role                                                         | service role                                                                                             | service role                                                               |
| knowledge_chunks                                        | service role (klijentu ne treba)                                                                     | service role                                                         | service role                                                                                             | service role                                                               |
| competitors                                             | has_brand_access                                                                                     | can_edit                                                             | can_edit                                                                                                 | can_edit                                                                   |
| social_accounts                                         | **samo kroz view** `social_accounts_public`; REVOKE SELECT na token kolonama za anon i authenticated | service role (callback)                                              | can_admin samo `status` (disable)                                                                        | can_admin                                                                  |
| oauth_states                                            | service role                                                                                         | service role                                                         | service role                                                                                             | service role                                                               |
| canva_connections                                       | sopstveni red bez token kolona (view `canva_connections_public`)                                     | service role                                                         | service role                                                                                             | sopstveni red                                                              |
| historical_posts                                        | has_brand_access                                                                                     | service role                                                         | service role                                                                                             | service role                                                               |
| strategies, content_pillars, campaigns                  | has_brand_access                                                                                     | can_edit                                                             | can_edit                                                                                                 | can_edit                                                                   |
| posts                                                   | has_brand_access                                                                                     | can_edit                                                             | can_edit; approver samo kroz RPC `decide_post`; zabranjeno dok `locked_at` nije null (trigger)           | can_edit (meko)                                                            |
| post_targets                                            | has_brand_access(brand_id)                                                                           | can_edit                                                             | can_edit kolone sadržaja; status samo kroz RPC/service                                                   | can_edit                                                                   |
| post_media, post_versions                               | has_brand_access                                                                                     | can_edit / service                                                   | —                                                                                                        | can_edit / nikad                                                           |
| post_comments                                           | has_brand_access                                                                                     | član (bilo koja uloga)                                               | autor (meko)                                                                                             | autor                                                                      |
| approvals                                               | has_brand_access                                                                                     | service (RPC)                                                        | service                                                                                                  | nikad                                                                      |
| approval_links                                          | can_edit                                                                                             | can_edit                                                             | can_edit (opoziv)                                                                                        | can_edit                                                                   |
| publish_attempts                                        | has_brand_access                                                                                     | service                                                              | nikad                                                                                                    | nikad                                                                      |
| queue_slots                                             | has_brand_access                                                                                     | can_edit                                                             | can_edit                                                                                                 | can_edit                                                                   |
| suggestions                                             | has_brand_access                                                                                     | service                                                              | can_edit (`status`, `decided_*`)                                                                         | nikad                                                                      |
| media_assets                                            | has_brand_access ili (brand_id null i član ws)                                                       | can_edit (RPC `complete_upload` proverava magic bytes)               | can_edit `alt_text`, `tags`                                                                              | can_edit (meko; trigger odbija ako je u scheduled targetu)                 |
| holidays                                                | svi ulogovani                                                                                        | service                                                              | service                                                                                                  | service                                                                    |
| ai_generations                                          | član ws; approver i viewer vide samo bez `input` (view)                                              | service                                                              | service                                                                                                  | nikad                                                                      |
| post_metrics_snapshots, account_metrics_daily, insights | has_brand_access                                                                                     | service                                                              | service                                                                                                  | service                                                                    |
| reports                                                 | has_brand_access                                                                                     | can_edit (RPC šalje event)                                           | service                                                                                                  | can_edit                                                                   |
| plans                                                   | svi (i anon, za cenovnik)                                                                            | service                                                              | service                                                                                                  | service                                                                    |
| subscriptions                                           | owner, admin ws                                                                                      | service                                                              | service                                                                                                  | service                                                                    |
| token_grants, token_ledger, token_reservations          | owner, admin ws (SELECT); editor vidi samo stanje kroz RPC `workspace_token_balance`                 | service                                                              | service                                                                                                  | service                                                                    |
| payment_events                                          | service                                                                                              | service                                                              | service                                                                                                  | service                                                                    |
| admin_audit_log, impersonation_sessions                 | service (admin UI ide kroz server)                                                                   | service                                                              | nikad (trigger)                                                                                          | nikad (trigger)                                                            |
| feature_flags                                           | svi ulogovani (`key`, `enabled`)                                                                     | service                                                              | service                                                                                                  | service                                                                    |
| platform_settings                                       | service; javne stavke (`token_prices`, `maintenance`) kroz view `platform_settings_public`           | service                                                              | service                                                                                                  | service                                                                    |
| notifications                                           | sopstveni redovi                                                                                     | service                                                              | sopstveni (`read_at`)                                                                                    | sopstveni                                                                  |
| notification_preferences                                | sopstveni                                                                                            | sopstveni                                                            | sopstveni                                                                                                | sopstveni                                                                  |
| idempotency_keys                                        | service                                                                                              | service                                                              | service                                                                                                  | service                                                                    |
| user_flags                                              | service                                                                                              | service                                                              | service                                                                                                  | service                                                                    |
| account_deletion_requests, data_exports                 | sopstveni                                                                                            | service (RPC)                                                        | service                                                                                                  | nikad                                                                      |

Primer politike (posts):

```sql
alter table posts enable row level security;
alter table posts force row level security;

create policy posts_select on posts for select to authenticated
  using (deleted_at is null and public.has_brand_access(brand_id));

create policy posts_insert on posts for insert to authenticated
  with check (public.has_brand_access(brand_id)
              and public.workspace_role(workspace_id) in ('owner','admin','editor')
              and not public.is_impersonation_readonly());

create policy posts_update on posts for update to authenticated
  using (public.has_brand_access(brand_id)
         and public.workspace_role(workspace_id) in ('owner','admin','editor')
         and locked_at is null
         and not public.is_impersonation_readonly())
  with check (public.has_brand_access(brand_id));

create policy posts_delete on posts for delete to authenticated
  using (false);   -- brisanje je meko, kroz update deleted_at
```

Oduzimanje prava na kolonama sa tokenima:

```sql
revoke select (access_token_enc, refresh_token_enc) on social_accounts from anon, authenticated;
revoke select (access_token_enc, refresh_token_enc) on canva_connections from anon, authenticated;
revoke select (code_verifier_enc) on oauth_states from anon, authenticated;
```

Ovim `select *` iz klijenta pada sa greškom dozvole, pa klijent uvek koristi view.

---

## 5. RPC funkcije

Sve finansijske i statusne funkcije su `security definer`, `set search_path = ''`, i posle kreiranja:

```sql
revoke all on function public.reserve_tokens(uuid,uuid,uuid,integer,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_tokens(uuid,uuid,uuid,integer,uuid,integer) to service_role;
```

Napomena iz prethodne verzije projekta: `revoke ... from public` nije dovoljan jer Supabase podrazumevano daje EXECUTE ulogama `anon` i `authenticated`; mora izričito od sve tri. Funkcije pisane kao `language sql` validiraju se pri kreiranju, pa se u migraciji prave posle tabela koje koriste; gde je redosled nezgodan, `plpgsql`.

| Funkcija                                                                               | Ko zove                            | Šta radi                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_workspace(name, type)`                                                         | authenticated                      | U jednoj transakciji: workspace, owner red u `workspace_members`, podrazumevani brend, signup grant od 50 tokena ako korisnik nema nijedan (`unique (source='signup', reference=user_id)`), ledger.                     |
| `accept_invitation(token)`                                                             | authenticated                      | Proverava hash, istek, email poklapanje sa `auth.email()`; upisuje člana i brand access; označava prihvaćeno.                                                                                                           |
| `workspace_token_balance(ws)`                                                          | authenticated (član)               | `sum(remaining)` grantova koji nisu istekli minus `sum(amount)` aktivnih rezervacija.                                                                                                                                   |
| `reserve_tokens(ws, brand, user, amount, generation_id, ttl_min)`                      | service                            | `select ... for update` grantova po `expires_at asc nulls last, created_at`; alocira; ako nedostaje → `raise exception 'INSUFFICIENT_TOKENS'` sa detaljem koliko fali.                                                  |
| `confirm_reservation(reservation_id, actual_amount default null)`                      | service                            | Smanjuje `remaining` po alokacijama (ako je `actual_amount` manji, višak se vraća), ledger `consume`, rezervacija `confirmed`, generacija `succeeded`. Idempotentno: ako je već `confirmed`, vraća postojeći ledger id. |
| `release_reservation(reservation_id, reason)`                                          | service                            | `released`, generacija `failed` sa razlogom (ako već nije).                                                                                                                                                             |
| `expire_reservations()`                                                                | service (cron)                     | `reserved` i `expires_at < now()` → `expired`.                                                                                                                                                                          |
| `grant_tokens(ws, source, amount, reference_type, reference, expires_at, actor, note)` | service                            | Insert u `token_grants` (UNIQUE štiti), ledger `grant`. Vraća grant id ili postojeći ako je duplikat.                                                                                                                   |
| `expire_grants()`                                                                      | service (cron)                     | Grantovi sa `expires_at < now()` i `remaining > 0` → ledger `expire`, `remaining = 0`.                                                                                                                                  |
| `admin_adjust_tokens(ws, delta, reason, admin_id)`                                     | service                            | Pozitivno: grant `admin`. Negativno: troši grantove kao rezervacija + odmah potvrda. Audit log red.                                                                                                                     |
| `transition_post(post_id, to_status, expected_version, actor)`                         | service                            | Proverava dozvoljen prelaz iz matrice, `version = expected_version` inače `CONFLICT`, upisuje `post_versions`, podiže `version`.                                                                                        |
| `decide_post(post_id, decision, comment, post_version, link_id)`                       | service (iz rute ili javnog linka) | Upis u `approvals`, prelaz statusa; odluka na staroj verziji → `CONFLICT`.                                                                                                                                              |
| `complete_upload(asset_id, mime, size, width, height, sha256)`                         | service                            | Potvrđuje da je fajl prošao magic bytes proveru i upisuje metapodatke.                                                                                                                                                  |
| `request_account_deletion(source, external_user_id)`                                   | service                            | Pravi red sa `confirmation_code`, šalje event.                                                                                                                                                                          |

---

## 6. Trigeri

| Trigger                            | Tabele                                                                    | Ponašanje                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_updated_at`                   | sve sa `updated_at`                                                       | `new.updated_at = now()`                                                                                                                                                                                                                        |
| `sync_profile_from_auth`           | `auth.users` (after insert/update)                                        | Pravi ili ažurira `profiles` (email, email_verified_at).                                                                                                                                                                                        |
| `protect_profile_columns`          | profiles (before update)                                                  | Ako `current_setting('request.jwt.claim.role', true) <> 'service_role'` i menja se `platform_role` ili `is_banned` → raise.                                                                                                                     |
| `append_only`                      | token_ledger, admin_audit_log, publish_attempts, post_versions, approvals | Before update/delete: `if pg_trigger_depth() > 1 then return` (kaskada iz FK), inače raise. Naučeno u prethodnoj verziji: bez te provere brisanje korisnika iz `auth.users` pada.                                                               |
| `payment_events_immutable_payload` | payment_events                                                            | Dozvoljen update samo kolona `status`, `error`, `processed_at`.                                                                                                                                                                                 |
| `last_owner_guard`                 | workspace_members (before update/delete)                                  | Ne dozvoljava da workspace ostane bez owner-a.                                                                                                                                                                                                  |
| `post_lock_guard`                  | posts (before update)                                                     | Ako je `locked_at` postavljen i menja se bilo šta osim `locked_at`/`status` iz service role → raise `POST_LOCKED`.                                                                                                                              |
| `post_status_transition_guard`     | posts, post_targets (before update of status)                             | Druga linija odbrane: dozvoljeni prelazi u tabeli `post_status_transitions(from, to)`; service role može i `failed → scheduled` (ručni retry).                                                                                                  |
| `brand_profiles_single_current`    | brand_profiles (after insert)                                             | Kad novi red ima `is_current = true`, stare verzije dobijaju false.                                                                                                                                                                             |
| `media_in_use_guard`               | media_assets (before update of deleted_at)                                | Raise ako je asset u `post_media` targeta sa statusom `scheduled`/`publishing`.                                                                                                                                                                 |
| `notify_realtime`                  | ai_generations, website_crawls, post_targets                              | Nije potreban trigger: Supabase Realtime `postgres_changes` sa filterom `workspace_id=eq.<id>`; tabele se dodaju u publication `supabase_realtime` sa `replica identity full` samo za kolone statusa (koristi se `postgres_changes` na update). |

Dozvoljeni prelazi statusa objave:

```
draft → in_review, scheduled (nivo 3 ili owner/admin bez odobravanja), canceled
in_review → approved, rejected, draft (povučeno)
approved → scheduled, draft (izmena posle odobrenja vraća na in_review preko draft), canceled
rejected → draft
scheduled → publishing, paused, canceled, draft (otkazano zakazivanje)
paused → scheduled, canceled
publishing → published, failed, partially_published
failed → scheduled (retry), draft, canceled
partially_published → published (preostali targeti uspeli), failed
published → (terminal; brisanje samo meko)
canceled → draft
```

Statusi targeta prate objavu, uz `needs_reauth` (iz `scheduled`/`paused` kad nalog izgubi token, nazad u `scheduled` posle ponovnog povezivanja), `deleted_externally` (iz `published`), `assisted_pending → assisted_done`.

---

## 7. Storage

| Bucket         | Javno | Putanja                                                            | Ko piše                                                                              | Napomena                                                                                                                      |
| -------------- | ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `brand-assets` | ne    | `ws/{workspace_id}/brand/{brand_id}/logo/...`, `/fonts/...`        | service                                                                              | logo, sanitizovan SVG                                                                                                         |
| `uploads`      | ne    | `ws/{workspace_id}/brand/{brand_id}/uploads/{asset_id}.{ext}`      | korisnik kroz potpisan upload URL (politika proverava `has_brand_access` iz putanje) | 20 MB slika, video po mreži                                                                                                   |
| `generated`    | ne    | `ws/{workspace_id}/brand/{brand_id}/generated/{asset_id}.{ext}`    | service                                                                              | Gemini, Satori, Canva export, Unsplash se NE kopira (hotlink), osim kad ide u objavu (tad se čuva kopija koju mreža preuzima) |
| `exports`      | ne    | `ws/{workspace_id}/reports/...`, `users/{user_id}/export-{id}.zip` | service                                                                              | potpisan URL 24 h                                                                                                             |

Storage politike: `(storage.foldername(name))[2]::uuid` je `workspace_id` → `is_workspace_member`; za `uploads` insert traži `can_edit`. Isporuka klijentu i mrežama samo potpisanim URL-ovima (1 h za pregled, 24 h za objavu). Za TikTok `PULL_FROM_URL` potpisan Supabase URL nije na našem domenu, pa TikTok ide kroz `FILE_UPLOAD` ili proxy rutu `/api/media/public/[signed]` na našem domenu (odluka u fazi 8b).

---

## 8. Seed

- `plans`: free (0, 50 tokena once, limiti 1/2/1), monthly ($39, 500/month, 3/10/3), yearly ($199, 500/month kroz 12 meseci, 3/10/3), topup paketi [POTVRDI] (predlog: 100 tokena $12, 300 tokena $30, 1000 tokena $85).
- `platform_settings`: `token_prices` (tabela iz brifa), `model_prices` (cene iz ARCHITECTURE 8.1), `allowed_models`, `rate_limits`, `maintenance { enabled: false }`, `free_tier { require_verified_email: true, block_disposable: true, ip_soft_limit: 3 }`.
- `feature_flags`: `platform.facebook`, `platform.instagram`, `platform.linkedin`, `platform.tiktok`, `platform.x`, `platform.youtube`, `platform.pinterest`, `platform.google_business`, `firecrawl`, `canva`, `canva_autofill`, `autopilot_level3`.
- `holidays`: Srbija 2026–2027 (državni i verski), plus globalni komercijalni datumi (Dan žena, Dan zaljubljenih, Black Friday, Nova godina).
- `profiles.platform_role = 'platform_admin'` za `milos.milosevic.seo@gmail.com` (seed skripta po emailu, posle registracije).
- Test podaci (samo DEV): workspace „Demo agencija” sa 2 brenda, 3 člana sa različitim ulogama, 10 objava u različitim statusima.

---

## 9. Testovi baze (faza 3)

Skripta `supabase/tests/rls.test.sql` (pgTAP) ili `scripts/test-db.mjs` sa dva korisnika A i B i service klijentom:

1. A ne vidi nijedan red B-ovih tabela (`select count(*) = 0` nad svih 52 tabela sa filterom na B-ov workspace).
2. A ne može insert/update/delete nad B-ovim redovima (očekuje se 0 pogođenih redova ili greška).
3. `authenticated` ne može da pozove `reserve_tokens`, `grant_tokens`, `confirm_reservation` (permission denied).
4. `select access_token_enc from social_accounts` kao A → permission denied; `select * from social_accounts_public` radi.
5. Viewer ne može insert u posts; approver ne može update master_text; editor može.
6. Član sa `all_brands = false` bez `member_brand_access` ne vidi brend.
7. Dve paralelne rezervacije od po 30 tokena nad stanjem 50 → tačno jedna prolazi.
8. `confirm_reservation` dvaput → jedan ledger red.
9. `grant_tokens` sa istim `(source, reference)` dvaput → jedan grant.
10. Update `token_ledger` → greška; brisanje korisnika iz `auth.users` → prolazi (kaskada), ledger redovi obrisani sa workspace-om.
11. Prelaz `draft → published` direktno → greška; `scheduled → publishing → published` → prolazi.
12. Upload u `uploads` na tuđu putanju → odbijeno.

---

## 10. Odstupanja implementacije od plana (faza 3, 23.10.2026)

Implementacija je u `supabase/migrations/2026102300000{1..14}_*.sql` i `supabase/seed.sql`. Razlike u odnosu na sekcije 1–9:

- Dodata tabela `platform_admin_allowlist` (D-019) i `status_transitions(scope, from_status, to_status, service_only)` kao jedna tabela za objave i targete. Ukupno 53 tabele.
- `workspaces.owner_id` je `on delete cascade`, ne `restrict` (D-017).
- Indeks `post_targets_no_same_minute` koristi `public.minute_bucket(scheduled_at)` (D-018).
- Dodate kolone `brand_id` u `post_comments`, `approvals`, `publish_attempts`, `post_metrics_snapshots`, `account_metrics_daily` radi jednostavnijih RLS politika; `platform_settings.is_public` i view `platform_settings_public`; view `canva_connections_public`; view `ai_generations_public` (bez `input`).
- `token_reservations.amount` dozvoljava 0 (potvrda sa stvarnim troškom 0).
- RLS: bez `force row level security` (D-016). Tabele bez politika (samo service_role): `knowledge_chunks`, `oauth_states`, `payment_events`, `admin_audit_log`, `impersonation_sessions`, `idempotency_keys`, `user_flags`, `platform_admin_allowlist`, `post_versions` (insert), `historical_posts` (pisanje).
- RPC: `workspace_token_totals` (interno), `decide_post` i `request_account_deletion` implementirani; `complete_upload` odložen za fazu 7.
- Trigeri: `workspace_members_guard` spaja poslednjeg owner-a i dodelu owner uloge; `posts_guard` proverava zaključavanje, prelaze i verziju; `post_targets_guard` proverava prelaze; `brands_guard` traži potvrdu za nivo 3 i brani promenu workspace-a.
- Storage: `exports` bucket ima posebnu politiku čitanja (`users/{user_id}/...` ili admin workspace-a); upload je dozvoljen samo u `uploads`, u `generated` i `brand-assets` piše samo server.
- Testovi: `scripts/test-db.mjs`, 24 testa (svih 12 iz sekcije 9 plus uloge, teammate profili, FIFO po isteku, seed).

Faza 6 (24.10.2026), migracija `20261024000015_brand_brain.sql`:

- RPC `match_knowledge_chunks(p_brand_id, p_embedding vector(1536), p_limit, p_source_types)` (security definer, samo service_role; operator se piše `operator(extensions.<=>)` jer je `search_path` prazan), `next_brand_profile_version(p_brand_id)` (authenticated i service_role), `brand_knowledge_count(p_brand_id)` (vraća broj samo uz `has_brand_access`).
- Jedinstven delimičan indeks `website_crawls_one_active (brand_id) where status in ('queued','running')`: drugi zahtev dobija 409.
- `brand_profiles.data` čuva Zod šemu `brandProfileSchema` (`src/lib/brand/profile-schema.ts`), `locked_fields` su putanje iz `FIELD_PATHS`; ručna izmena i vraćanje verzije idu kroz korisnikov klijent (RLS `can_edit_brand`), analiza kroz service role.
- `website_pages.images/json_ld/open_graph/social_links/headings` se pune iz crawlera; `media_assets` logo ide u `brand-assets/ws/{ws}/brand/{brand}/logo/`.

Faza 7 (24.10.2026), bez nove migracije:

- `media_assets.source`: `unsplash` (kopija u `uploads/.../unsplash/`, `source_data.photoId` za dedup, `attribution` sa utm linkovima), `template` (`generated/.../templates/`, `source_data.template/image/fontsUsed`), `canva` (`uploads/.../canva/`, `attribution.designId`). `is_ai_generated` je true samo za `gemini`.
- `canva_connections`: `access_token_enc`/`refresh_token_enc` su AES-256-GCM (`iv|tag|ciphertext`, hex bytea), `key_version` prati `TOKEN_ENCRYPTION_KEY`; čita se kroz `canva_connections_public` view (bez tokena). `oauth_states.code_verifier_enc` isti format, `state_hash` = sha256(state).
- `ai_generations.type`: `visual_template` (rang model u `model`, trošak samo za rangiranje), `canva_design` i `canva_export` (`provider = canva`, `cost_usd = 0`).

Faza 8a (24.10.2026), bez nove migracije:

- `social_accounts`: `access_token_enc` = Page token (AES-256-GCM, AAD `social:<brand>:<platform>:<external_id>`), `refresh_token_enc` = dugotrajan Meta korisnički token, `refresh_token_expires_at` njegov istek; `metadata` nosi `metaUserId`, `metaUserName`, `tasks`, `followers`, `pageId` (IG), i privremeno `pending`, `pendingState`, `pendingAt` dok korisnik ne izabere naloge (D-043). `status = disabled` + `pending` = na čekanju; `revoked` posle deauthorize callback-a.
- `oauth_states.provider = 'meta'` sa `brand_id`; `code_verifier_enc` je null (Facebook Login nema PKCE), `redirect_to` putanja posle povezivanja.
- `historical_posts` se puni iz `fetchHistory` (upsert po `(social_account_id, external_id)`), `media` kao `[{url, type}]`, `metrics` `{likes, comments, shares?}`.
- `account_deletion_requests.source = 'meta_callback'` sa `external_user_id` = app-scoped Meta ID.
