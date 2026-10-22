-- Sova: jezgro baze. Profili, biznisi, generacije, ledger tokena, rate limit.
-- Vidi PLAN.md odeljak 4.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Pomoćne funkcije
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tabele koje se samo dopisuju (ledger, audit). Direktan UPDATE/DELETE pada.
-- Jedini izuzetak je FK kaskada pri brisanju korisnika: ona stiže iz
-- internog RI trigger-a, pa je pg_trigger_depth() > 1.
create or replace function public.raise_immutable()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'Tabela % se ne menja i ne briše', tg_table_name
    using errcode = 'P0001';
end;
$$;


-- ---------------------------------------------------------------------------
-- profiles (1:1 sa auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  full_name            text,
  role                 text not null default 'user'
                         check (role in ('user', 'admin')),
  token_balance        integer not null default 0
                         check (token_balance >= 0),
  is_blocked           boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role) where role = 'admin';

-- is_admin() je security definer da RLS politike na profiles ne bi
-- rekurzivno zvale same sebe.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Osetljive kolone sme da menja samo server (service_role) ili baza sama
-- (security definer funkcije, migracije). Ulogovani korisnik ne može, ni admin
-- direktno: admin ide kroz admin_adjust_tokens koja piše ledger i audit.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is distinct from old.role
       or new.token_balance is distinct from old.token_balance
       or new.is_blocked is distinct from old.is_blocked
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Kolone role, token_balance, is_blocked i email ne mogu da se menjaju direktno'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- businesses (podaci o biznisu, jedan po korisniku)
-- ---------------------------------------------------------------------------

create table public.businesses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 100),
  industry         text check (char_length(industry) <= 100),
  description      text check (char_length(description) <= 1000),
  target_audience  text check (char_length(target_audience) <= 500),
  tone_of_voice    text check (tone_of_voice in ('prijateljski', 'profesionalan', 'duhovit', 'luksuzan')),
  language         text not null default 'sr' check (language in ('sr', 'en')),
  website          text check (char_length(website) <= 200),
  instagram        text check (char_length(instagram) <= 100),
  logo_path        text,
  brand_colors     text[] not null default '{}',
  default_hashtags text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- generations (sve što je korisnik napravio)
-- ---------------------------------------------------------------------------

create table public.generations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  type              text not null
                      check (type in ('text', 'image_from_prompt', 'image_from_photo')),
  status            text not null default 'pending'
                      check (status in ('pending', 'processing', 'completed', 'failed')),
  prompt            text not null check (char_length(prompt) between 1 and 1000),
  platform          text check (platform in ('instagram', 'facebook', 'linkedin', 'tiktok', 'x', 'general')),
  tone              text,
  input_image_path  text,
  output_text       text,
  output_image_path text,
  tokens_cost       integer not null check (tokens_cost > 0),
  provider          text,
  model             text,
  attempts          integer not null default 0,
  error_code        text,
  error_message     text,
  duration_ms       integer,
  idempotency_key   text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (user_id, idempotency_key)
);

create index generations_user_created_idx on public.generations (user_id, created_at desc);
create index generations_user_type_idx on public.generations (user_id, type);
create index generations_status_idx on public.generations (status) where status in ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- token_transactions (ledger: samo se dopisuje; status menja samo funkcija)
-- ---------------------------------------------------------------------------

create table public.token_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  amount            integer not null check (amount <> 0),
  balance_after     integer not null check (balance_after >= 0),
  type              text not null
                      check (type in ('welcome', 'purchase', 'spend', 'refund', 'admin_adjust', 'chargeback')),
  status            text not null default 'completed'
                      check (status in ('reserved', 'completed', 'released')),
  generation_id     uuid references public.generations (id) on delete set null,
  stripe_invoice_id text,
  admin_id          uuid references public.profiles (id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);

create index token_transactions_user_created_idx on public.token_transactions (user_id, created_at desc);
create unique index token_transactions_invoice_idx on public.token_transactions (stripe_invoice_id)
  where stripe_invoice_id is not null;

create trigger token_transactions_no_delete
  before delete on public.token_transactions
  for each row execute function public.raise_immutable();

-- ---------------------------------------------------------------------------
-- rate_limits (fiksni prozor, bez Redis-a)
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Trigger-i na auth.users: profil + 50 tokena, sinhronizacija mejla
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  welcome_tokens constant integer := 50;
begin
  insert into public.profiles (id, email, full_name, token_balance)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    welcome_tokens
  );

  insert into public.token_transactions (user_id, amount, balance_after, type, status, note)
  values (new.id, welcome_tokens, welcome_tokens, 'welcome', 'completed', 'Besplatni tokeni za novi nalog');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
