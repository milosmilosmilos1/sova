-- Faza 3 · 2/14 · identitet i tim

create table public.platform_admin_allowlist (
  email extensions.citext primary key,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.platform_admin_allowlist is
  'Jedini način da se dodeli platform_admin: email u ovoj tabeli pri registraciji ili seed skripta.';

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null,
  full_name text check (char_length(full_name) <= 100),
  avatar_url text,
  locale text not null default 'sr-Latn' check (locale in ('sr-Latn', 'en')),
  timezone text not null default 'Europe/Belgrade',
  platform_role public.platform_role not null default 'user',
  is_banned boolean not null default false,
  banned_reason text,
  banned_at timestamptz,
  email_verified_at timestamptz,
  onboarding_completed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_trgm on public.profiles using gin (email extensions.gin_trgm_ops);
create index profiles_platform_role on public.profiles (platform_role) where platform_role = 'platform_admin';

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  type public.workspace_type not null default 'business',
  owner_id uuid not null references public.profiles(id) on delete cascade,  -- app traži prenos vlasništva pre brisanja naloga; baza ne sme da blokira GDPR brisanje
  billing_email extensions.citext,
  country text check (country is null or char_length(country) = 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index workspaces_owner on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'editor',
  all_brands boolean not null default true,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on public.workspace_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email extensions.citext not null,
  role public.workspace_role not null,
  brand_ids uuid[],
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index invitations_pending_unique on public.invitations (workspace_id, email) where status = 'pending';

-- Sinhronizacija auth.users → profiles
create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.platform_role := 'user';
begin
  if exists (select 1 from public.platform_admin_allowlist a where a.email = new.email::extensions.citext) then
    v_role := 'platform_admin';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, email_verified_at, platform_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email_confirmed_at,
    v_role
  )
  on conflict (id) do update set
    email = excluded.email,
    email_verified_at = excluded.email_verified_at,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    platform_role = case
      when public.profiles.platform_role = 'platform_admin' then 'platform_admin'::public.platform_role
      else v_role
    end,
    updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function public.handle_auth_user();

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
