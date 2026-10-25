-- Pre produkcije · Supabase savetnik 0028: pomoćne SECURITY DEFINER funkcije bile su izvršive za anon.
-- Revoke od anon u 009 nije bio dovoljan: Postgres svakoj novoj funkciji daje EXECUTE ulozi PUBLIC, a anon
-- to nasleđuje. Funkcije ostaju dostupne authenticated (RLS politike ih zovu) i service_role.
revoke execute on function
  public.is_platform_admin(), public.is_workspace_member(uuid), public.workspace_role(uuid),
  public.brand_workspace(uuid), public.has_brand_access(uuid),
  public.can_edit(uuid), public.can_admin(uuid), public.can_approve(uuid),
  public.can_edit_brand(uuid), public.can_admin_brand(uuid), public.shares_workspace_with(uuid)
from public;

-- Okidačke funkcije se nikad ne zovu direktno (Postgres ne proverava EXECUTE kad okidač radi).
revoke execute on function public.handle_auth_user(), public.workspace_members_guard()
from public, anon, authenticated;
