-- Faza 3 · 9/14 · pomoćne funkcije za RLS
-- Sve su SECURITY DEFINER, STABLE, sa fiksnim search_path. Dostupne authenticated ulozi jer ih politike zovu.

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.platform_role = 'platform_admin' and not p.is_banned
  );
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = ws and m.user_id = auth.uid() and not p.is_banned
  );
$$;

create or replace function public.workspace_role(ws uuid)
returns public.workspace_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  where m.workspace_id = ws and m.user_id = auth.uid() and not p.is_banned;
$$;

create or replace function public.brand_workspace(b uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select workspace_id from public.brands where id = b;
$$;

create or replace function public.has_brand_access(b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.brands br
    join public.workspace_members m on m.workspace_id = br.workspace_id and m.user_id = auth.uid()
    join public.profiles p on p.id = m.user_id and not p.is_banned
    where br.id = b
      and (
        m.all_brands
        or exists (select 1 from public.member_brand_access a where a.user_id = auth.uid() and a.brand_id = b)
      )
  );
$$;

-- Impersonacija u read-only režimu (claim `imp.ro` u JWT-u, faza 13)
create or replace function public.is_impersonation_readonly()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'imp' ->> 'ro')::boolean, false);
$$;

create or replace function public.can_edit(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.workspace_role(ws) in ('owner', 'admin', 'editor') and not public.is_impersonation_readonly();
$$;

create or replace function public.can_admin(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.workspace_role(ws) in ('owner', 'admin') and not public.is_impersonation_readonly();
$$;

create or replace function public.can_approve(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.workspace_role(ws) in ('owner', 'admin', 'approver') and not public.is_impersonation_readonly();
$$;

create or replace function public.can_edit_brand(b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_brand_access(b) and public.can_edit(public.brand_workspace(b));
$$;

create or replace function public.can_admin_brand(b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_brand_access(b) and public.can_admin(public.brand_workspace(b));
$$;

-- Da li trenutni korisnik deli bar jedan workspace sa datim korisnikom (za prikaz članova tima)
create or replace function public.shares_workspace_with(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

grant execute on function
  public.is_platform_admin(), public.is_workspace_member(uuid), public.workspace_role(uuid),
  public.brand_workspace(uuid), public.has_brand_access(uuid), public.is_impersonation_readonly(),
  public.can_edit(uuid), public.can_admin(uuid), public.can_approve(uuid),
  public.can_edit_brand(uuid), public.can_admin_brand(uuid), public.shares_workspace_with(uuid)
to authenticated, service_role;

revoke execute on function
  public.is_platform_admin(), public.is_workspace_member(uuid), public.workspace_role(uuid),
  public.brand_workspace(uuid), public.has_brand_access(uuid),
  public.can_edit(uuid), public.can_admin(uuid), public.can_approve(uuid),
  public.can_edit_brand(uuid), public.can_admin_brand(uuid), public.shares_workspace_with(uuid)
from anon;
