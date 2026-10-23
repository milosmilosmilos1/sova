-- Faza 3 · 7/14 · naplata i tokeni

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind public.plan_kind not null,
  name text not null,
  interval text check (interval is null or interval in ('month', 'year')),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  tokens_per_period integer not null check (tokens_per_period >= 0),
  token_period text not null default 'once' check (token_period in ('once', 'month')),
  limits jsonb not null default '{}'::jsonb,
  provider_price_ids jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  provider_subscription_id text not null,
  plan_id uuid not null references public.plans(id),
  status public.subscription_status not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  grace_until timestamptz,
  last_invoice_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create unique index subscriptions_one_active
  on public.subscriptions (workspace_id) where status in ('trialing', 'active', 'past_due');
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.token_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source public.token_grant_source not null,
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz,
  reference_type text,
  reference text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (remaining <= amount),
  unique (source, reference)
);
create index token_grants_available on public.token_grants (workspace_id, expires_at) where remaining > 0;

create table public.token_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  generation_id uuid references public.ai_generations(id) on delete set null,
  amount integer not null check (amount >= 0),
  allocations jsonb not null default '[]'::jsonb,
  status public.token_reservation_status not null default 'reserved',
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index token_reservations_open on public.token_reservations (workspace_id) where status = 'reserved';
create index token_reservations_expiry on public.token_reservations (expires_at) where status = 'reserved';

alter table public.ai_generations
  add constraint ai_generations_reservation_fk
  foreign key (token_reservation_id) references public.token_reservations(id) on delete set null;

create table public.token_ledger (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason public.ledger_reason not null,
  grant_id uuid references public.token_grants(id) on delete set null,
  reservation_id uuid references public.token_reservations(id) on delete set null,
  generation_id uuid references public.ai_generations(id) on delete set null,
  reference text,
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index token_ledger_ws on public.token_ledger (workspace_id, id desc);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status public.payment_event_status not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index payment_events_pending on public.payment_events (received_at) where status in ('received', 'processing');
