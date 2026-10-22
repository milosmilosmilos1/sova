-- Sova: Stripe tabele i admin audit log. Vidi PLAN.md 4.6–4.10.

-- ---------------------------------------------------------------------------
-- stripe_customers
-- ---------------------------------------------------------------------------

create table public.stripe_customers (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id        text not null,
  plan                   text not null check (plan in ('monthly', 'yearly')),
  status                 text not null
                           check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid',
                                             'incomplete', 'incomplete_expired', 'paused')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_status_idx on public.subscriptions (status);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

create table public.payments (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references public.profiles (id) on delete set null,
  stripe_invoice_id      text not null unique,
  stripe_subscription_id text,
  amount_paid            integer not null default 0,
  currency               text,
  status                 text not null
                           check (status in ('paid', 'open', 'void', 'uncollectible', 'refunded')),
  billing_reason         text,
  tokens_granted         integer not null default 0,
  paid_at                timestamptz,
  created_at             timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- stripe_events (idempotentnost webhook-a: PK je Stripe evt_... id)
-- ---------------------------------------------------------------------------

create table public.stripe_events (
  id           text primary key,
  type         text not null,
  payload      jsonb not null,
  status       text not null default 'received'
                 check (status in ('received', 'processed', 'failed')),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_events_type_idx on public.stripe_events (type, received_at desc);

-- ---------------------------------------------------------------------------
-- admin_audit_log (samo insert, ni admin ne može da menja ili briše)
-- ---------------------------------------------------------------------------

create table public.admin_audit_log (
  id             bigserial primary key,
  admin_id       uuid not null references public.profiles (id) on delete cascade,
  action         text not null
                   check (action in ('tokens_adjust', 'impersonate_start', 'impersonate_stop',
                                     'user_block', 'user_unblock', 'role_change',
                                     'user_delete', 'generation_delete')),
  target_user_id uuid references public.profiles (id) on delete set null,
  details        jsonb not null default '{}'::jsonb,
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index admin_audit_log_admin_idx on public.admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);

create trigger admin_audit_log_immutable
  before update or delete on public.admin_audit_log
  for each row execute function public.raise_immutable();
