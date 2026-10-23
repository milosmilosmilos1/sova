-- Faza 3 · 13/14 · trigeri za integritet

-- Append-only: UPDATE i DELETE zabranjeni, osim kad stižu iz FK kaskade (pg_trigger_depth > 1).
create or replace function public.deny_mutation_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'APPEND_ONLY' using detail = format('%s je append-only tabela', tg_table_name), errcode = '42501';
end;
$$;

create trigger token_ledger_append_only before update or delete on public.token_ledger
  for each row execute function public.deny_mutation_append_only();
create trigger admin_audit_log_append_only before update or delete on public.admin_audit_log
  for each row execute function public.deny_mutation_append_only();
create trigger publish_attempts_append_only before update or delete on public.publish_attempts
  for each row execute function public.deny_mutation_append_only();
create trigger post_versions_append_only before update or delete on public.post_versions
  for each row execute function public.deny_mutation_append_only();
create trigger approvals_append_only before update or delete on public.approvals
  for each row execute function public.deny_mutation_append_only();

-- payment_events: payload nepromenljiv, menja se samo status obrade
create or replace function public.payment_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'APPEND_ONLY' using errcode = '42501';
  end if;
  if new.provider is distinct from old.provider
     or new.event_id is distinct from old.event_id
     or new.event_type is distinct from old.event_type
     or new.payload is distinct from old.payload
     or new.received_at is distinct from old.received_at then
    raise exception 'PAYMENT_EVENT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger payment_events_guard before update or delete on public.payment_events
  for each row execute function public.payment_events_guard();

-- profiles: platform_role i is_banned menja samo service_role / interni procesi
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.platform_role is distinct from old.platform_role or new.is_banned is distinct from old.is_banned)
     and current_user in ('authenticated', 'anon') then
    raise exception 'FORBIDDEN' using detail = 'platform_role/is_banned', errcode = '42501';
  end if;
  if new.email is distinct from old.email and current_user in ('authenticated', 'anon') then
    raise exception 'FORBIDDEN' using detail = 'email se menja kroz Supabase Auth', errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- workspace_members: poslednji owner ne može da ode; owner ulogu dodeljuje samo owner
create or replace function public.workspace_members_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_others integer;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and current_user in ('authenticated', 'anon') then
    if new.role = 'owner' and public.workspace_role(new.workspace_id) is distinct from 'owner' then
      raise exception 'FORBIDDEN' using detail = 'samo owner može da dodeli owner ulogu', errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.user_id = auth.uid() and new.role is distinct from old.role
       and public.workspace_role(old.workspace_id) is distinct from 'owner' then
      raise exception 'FORBIDDEN' using detail = 'ne možete da promenite sopstvenu ulogu', errcode = '42501';
    end if;
  end if;

  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into v_others from public.workspace_members m
     where m.workspace_id = old.workspace_id and m.user_id <> old.user_id and m.role = 'owner';
    if v_others = 0 then
      raise exception 'LAST_OWNER' using detail = 'workspace mora imati bar jednog vlasnika';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger workspace_members_guard before insert or update or delete on public.workspace_members
  for each row execute function public.workspace_members_guard();

-- posts: zaključano tokom objavljivanja; status se menja samo kroz dozvoljene prelaze
create or replace function public.posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is not null and current_user in ('authenticated', 'anon') then
    raise exception 'POST_LOCKED' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.status_transitions t
      where t.scope = 'post' and t.from_status = old.status::text and t.to_status = new.status::text
        and (not t.service_only or current_user not in ('authenticated', 'anon'))
    ) then
      raise exception 'INVALID_TRANSITION' using detail = format('%s -> %s', old.status, new.status);
    end if;
  end if;
  if new.version < old.version then
    raise exception 'CONFLICT' using detail = 'version';
  end if;
  return new;
end;
$$;
create trigger posts_guard before update on public.posts
  for each row execute function public.posts_guard();

create or replace function public.post_targets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.status_transitions t
      where t.scope = 'target' and t.from_status = old.status::text and t.to_status = new.status::text
        and (not t.service_only or current_user not in ('authenticated', 'anon'))
    ) then
      raise exception 'INVALID_TRANSITION' using detail = format('target %s -> %s', old.status, new.status);
    end if;
  end if;
  return new;
end;
$$;
create trigger post_targets_guard before update on public.post_targets
  for each row execute function public.post_targets_guard();

-- brand_profiles: samo jedna aktuelna verzija
create or replace function public.brand_profiles_single_current()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_current then
    update public.brand_profiles set is_current = false
     where brand_id = new.brand_id and id <> new.id and is_current;
  end if;
  return new;
end;
$$;
create trigger brand_profiles_single_current before insert or update of is_current on public.brand_profiles
  for each row execute function public.brand_profiles_single_current();

-- media_assets: ne briši medij koji je u zakazanoj objavi
create or replace function public.media_in_use_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from public.post_media pm
    join public.post_targets t on t.post_id = pm.post_id
    where pm.media_asset_id = new.id and t.status in ('scheduled', 'publishing')
  ) then
    raise exception 'MEDIA_IN_USE' using detail = 'medij je u zakazanoj objavi';
  end if;
  return new;
end;
$$;
create trigger media_in_use_guard before update of deleted_at on public.media_assets
  for each row execute function public.media_in_use_guard();

-- brands: nivo 3 Autopilota traži izričitu potvrdu
create or replace function public.brands_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.autopilot_level = 3 and new.autopilot_level3_confirmed_at is null then
    raise exception 'AUTOPILOT_LEVEL3_CONFIRMATION_REQUIRED';
  end if;
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'FORBIDDEN' using detail = 'brend ne menja workspace', errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger brands_guard before update on public.brands
  for each row execute function public.brands_guard();
