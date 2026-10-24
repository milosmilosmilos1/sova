-- Faza 11a · prenos vlasništva radnog prostora (brif 2: vlasnik prenosi vlasništvo)
--
-- Jedna transakcija: novi vlasnik dobija ulogu owner (i sve brendove), dosadašnji postaje admin,
-- workspaces.owner_id prelazi na novog. Redosled (prvo unapređenje, pa spuštanje) zadovoljava okidač
-- „poslednji vlasnik ne može da ode”. Poziva prijavljeni korisnik; tokom impersonacije nije dozvoljeno.
create or replace function public.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if (auth.jwt() -> 'imp') is not null then
    raise exception 'FORBIDDEN' using detail = 'prenos vlasništva nije dozvoljen tokom impersonacije', errcode = '42501';
  end if;
  perform 1 from public.workspaces w
   where w.id = p_workspace_id and w.owner_id = v_me and w.deleted_at is null
   for update;
  if not found then
    raise exception 'FORBIDDEN' using detail = 'samo vlasnik prenosi vlasništvo', errcode = '42501';
  end if;
  if p_new_owner = v_me then
    raise exception 'VALIDATION' using detail = 'već ste vlasnik';
  end if;
  if not exists (
    select 1 from public.workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = p_new_owner
  ) then
    raise exception 'NOT_FOUND' using detail = 'novi vlasnik mora biti član radnog prostora';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_new_owner and p.is_banned) then
    raise exception 'FORBIDDEN' using detail = 'nalog novog vlasnika je blokiran', errcode = '42501';
  end if;

  update public.workspace_members set role = 'owner', all_brands = true
   where workspace_id = p_workspace_id and user_id = p_new_owner;
  update public.workspace_members set role = 'admin'
   where workspace_id = p_workspace_id and user_id = v_me;
  update public.workspaces set owner_id = p_new_owner where id = p_workspace_id;
end;
$$;

revoke all on function public.transfer_workspace_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated, service_role;
