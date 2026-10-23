-- Faza 3 · 4/14 · integracije

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.social_platform not null,
  external_id text not null,
  external_parent_id text,
  name text not null,
  username text,
  avatar_url text,
  account_type text not null,
  access_token_enc bytea,
  refresh_token_enc bytea,
  key_version smallint not null default 1,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.social_account_status not null default 'active',
  status_reason text,
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  assisted_only boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform, external_id)
);
create index social_accounts_workspace on public.social_accounts (workspace_id);
create index social_accounts_token_expiry on public.social_accounts (token_expires_at) where status = 'active';
create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- View bez token kolona; security_invoker → RLS tabele važi i za view
create view public.social_accounts_public
with (security_invoker = true) as
  select id, brand_id, workspace_id, platform, external_id, external_parent_id, name, username, avatar_url,
         account_type, key_version, token_expires_at, scopes, status, status_reason, capabilities, metadata,
         assisted_only, last_synced_at, last_error, connected_by, created_at, updated_at
  from public.social_accounts;

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  provider text not null,
  code_verifier_enc bytea,
  redirect_to text,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_expiry on public.oauth_states (expires_at);

create table public.canva_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  canva_user_id text not null,
  team_id text,
  plan_hint text,
  autofill_available boolean not null default false,
  access_token_enc bytea not null,
  refresh_token_enc bytea not null,
  key_version smallint not null default 1,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  status public.social_account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create trigger canva_connections_updated_at before update on public.canva_connections
  for each row execute function public.set_updated_at();

create view public.canva_connections_public
with (security_invoker = true) as
  select id, workspace_id, user_id, canva_user_id, team_id, plan_hint, autofill_available,
         token_expires_at, scopes, status, created_at, updated_at
  from public.canva_connections;

create table public.historical_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  external_id text not null,
  post_type text,
  text_content text,
  media jsonb,
  permalink text,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (social_account_id, external_id)
);
create index historical_posts_brand on public.historical_posts (brand_id, published_at desc);
