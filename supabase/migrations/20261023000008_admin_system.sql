-- Faza 3 · 8/14 · admin i sistem

create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) >= 10),
  mode public.impersonation_mode not null default 'read_only',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  ended_at timestamptz,
  end_reason text,
  ip inet,
  check (admin_id <> user_id)
);
create index impersonation_sessions_admin on public.impersonation_sessions (admin_id, started_at desc);

create table public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  impersonation_session_id uuid references public.impersonation_sessions(id) on delete set null,
  request_id text,
  created_at timestamptz not null default now()
);
create index admin_audit_admin on public.admin_audit_log (admin_id, id desc);
create index admin_audit_target on public.admin_audit_log (target_type, target_id);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  rollout jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create view public.platform_settings_public
with (security_invoker = true) as
  select key, value, updated_at from public.platform_settings where is_public;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user on public.notifications (user_id, created_at desc);

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  channel public.notification_channel not null,
  enabled boolean not null default true,
  primary key (user_id, workspace_id, type, channel)
);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  scope text not null,
  key text not null,
  request_hash text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'done')),
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  unique (workspace_id, scope, key)
);
create index idempotency_keys_expiry on public.idempotency_keys (expires_at);

create table public.user_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  count integer not null default 1,
  last_at timestamptz not null default now(),
  note text,
  unique (user_id, kind)
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email extensions.citext,
  source text not null check (source in ('user', 'meta_callback', 'admin')),
  external_user_id text,
  confirmation_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'ready', 'failed', 'expired')),
  storage_path text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
