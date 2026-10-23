-- Faza 3 · 11/14 · RPC za tokene
-- Rezervacija pre AI poziva, potvrda posle uspeha (brif 14.1). Sve u plpgsql,
-- security definer, EXECUTE samo za service_role (osim workspace_token_balance).

create or replace function public.workspace_token_totals(p_workspace_id uuid)
returns table (total integer, reserved integer, available integer)
language sql stable security definer set search_path = ''
as $$
  with g as (
    select coalesce(sum(remaining), 0)::integer as total
    from public.token_grants
    where workspace_id = p_workspace_id and remaining > 0 and (expires_at is null or expires_at > now())
  ),
  r as (
    select coalesce(sum(amount), 0)::integer as reserved
    from public.token_reservations
    where workspace_id = p_workspace_id and status = 'reserved' and expires_at > now()
  )
  select g.total, r.reserved, (g.total - r.reserved)::integer as available from g, r;
$$;

-- Jedina funkcija dostupna prijavljenom korisniku
create or replace function public.workspace_token_balance(p_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v record;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v from public.workspace_token_totals(p_workspace_id);
  return jsonb_build_object('total', v.total, 'reserved', v.reserved, 'available', v.available);
end;
$$;

create or replace function public.reserve_tokens(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_generation_id uuid,
  p_ttl_minutes integer default 15
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_totals record;
  v_id uuid;
begin
  if p_amount < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Serijalizacija po workspace-u: dva istovremena klika ne mogu da rezervišu iste tokene.
  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  select * into v_totals from public.workspace_token_totals(p_workspace_id);
  if v_totals.available < p_amount then
    raise exception 'INSUFFICIENT_TOKENS'
      using detail = format('available=%s reserved=%s requested=%s', v_totals.available, v_totals.reserved, p_amount),
            hint = (p_amount - v_totals.available)::text;
  end if;

  insert into public.token_reservations (workspace_id, brand_id, user_id, generation_id, amount, expires_at)
  values (p_workspace_id, p_brand_id, p_user_id, p_generation_id, p_amount, now() + make_interval(mins => p_ttl_minutes))
  returning id into v_id;

  if p_generation_id is not null then
    update public.ai_generations set token_reservation_id = v_id where id = p_generation_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.confirm_reservation(
  p_reservation_id uuid,
  p_actual_amount integer default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_res public.token_reservations%rowtype;
  v_amount integer;
  v_need integer;
  v_take integer;
  v_grant record;
  v_alloc jsonb := '[]'::jsonb;
  v_totals record;
  v_ledger_id bigint;
begin
  select * into v_res from public.token_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  -- Idempotentno: druga potvrda vraća isti ledger red.
  if v_res.status = 'confirmed' then
    select id into v_ledger_id from public.token_ledger where reservation_id = p_reservation_id order by id limit 1;
    return v_ledger_id;
  end if;
  if v_res.status <> 'reserved' then
    raise exception 'RESERVATION_NOT_ACTIVE' using detail = v_res.status::text;
  end if;

  v_amount := coalesce(p_actual_amount, v_res.amount);
  if v_amount < 0 or v_amount > v_res.amount then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform 1 from public.workspaces w where w.id = v_res.workspace_id for update;

  v_need := v_amount;
  for v_grant in
    select g.id, g.remaining
    from public.token_grants g
    where g.workspace_id = v_res.workspace_id
      and g.remaining > 0
      and (g.expires_at is null or g.expires_at > now())
    order by g.expires_at asc nulls last, g.created_at asc
    for update
  loop
    exit when v_need = 0;
    v_take := least(v_grant.remaining, v_need);
    update public.token_grants set remaining = remaining - v_take where id = v_grant.id;
    v_alloc := v_alloc || jsonb_build_object('grant_id', v_grant.id, 'amount', v_take);
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    raise exception 'INSUFFICIENT_TOKENS' using detail = format('short=%s', v_need);
  end if;

  update public.token_reservations
     set status = 'confirmed', allocations = v_alloc, amount = v_amount, resolved_at = now()
   where id = p_reservation_id;

  if v_amount > 0 then
    select * into v_totals from public.workspace_token_totals(v_res.workspace_id);
    insert into public.token_ledger (workspace_id, delta, balance_after, reason, reservation_id, generation_id, actor_id)
    values (v_res.workspace_id, -v_amount, v_totals.total, 'consume', p_reservation_id, v_res.generation_id, v_res.user_id)
    returning id into v_ledger_id;
  end if;

  if v_res.generation_id is not null then
    update public.ai_generations
       set status = 'succeeded', tokens_charged = v_amount, finished_at = coalesce(finished_at, now())
     where id = v_res.generation_id;
  end if;

  return v_ledger_id;
end;
$$;

create or replace function public.release_reservation(p_reservation_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_res public.token_reservations%rowtype;
begin
  select * into v_res from public.token_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;
  if v_res.status <> 'reserved' then
    return;
  end if;
  update public.token_reservations set status = 'released', resolved_at = now() where id = p_reservation_id;
  if v_res.generation_id is not null then
    update public.ai_generations
       set status = 'failed',
           error_code = coalesce(error_code, p_reason, 'RELEASED'),
           finished_at = coalesce(finished_at, now())
     where id = v_res.generation_id and status in ('queued', 'running');
  end if;
end;
$$;

create or replace function public.expire_reservations()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.token_reservations
       set status = 'expired', resolved_at = now()
     where status = 'reserved' and expires_at <= now()
    returning generation_id
  )
  update public.ai_generations g
     set status = 'failed', error_code = 'RESERVATION_EXPIRED', finished_at = coalesce(g.finished_at, now())
    from expired e
   where g.id = e.generation_id and g.status in ('queued', 'running');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.grant_tokens(
  p_workspace_id uuid,
  p_source public.token_grant_source,
  p_amount integer,
  p_reference_type text,
  p_reference text,
  p_expires_at timestamptz default null,
  p_actor_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_totals record;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  insert into public.token_grants (workspace_id, source, amount, remaining, expires_at, reference_type, reference, note, created_by)
  values (p_workspace_id, p_source, p_amount, p_amount, p_expires_at, p_reference_type, p_reference, p_note, p_actor_id)
  on conflict (source, reference) do nothing
  returning id into v_id;

  if v_id is null then
    -- Duplikat (isti webhook dvaput): vrati postojeći grant bez upisa u ledger.
    select id into v_id from public.token_grants where source = p_source and reference = p_reference;
    return v_id;
  end if;

  select * into v_totals from public.workspace_token_totals(p_workspace_id);
  insert into public.token_ledger (workspace_id, delta, balance_after, reason, grant_id, reference, actor_id, note)
  values (p_workspace_id, p_amount, v_totals.total, 'grant', v_id, p_reference, p_actor_id, p_note);

  return v_id;
end;
$$;

create or replace function public.expire_grants()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_grant record;
  v_totals record;
  v_count integer := 0;
begin
  for v_grant in
    select g.id, g.workspace_id, g.remaining
    from public.token_grants g
    where g.remaining > 0 and g.expires_at is not null and g.expires_at <= now()
    order by g.workspace_id
    for update skip locked
  loop
    perform 1 from public.workspaces w where w.id = v_grant.workspace_id for update;
    update public.token_grants set remaining = 0 where id = v_grant.id;
    select * into v_totals from public.workspace_token_totals(v_grant.workspace_id);
    insert into public.token_ledger (workspace_id, delta, balance_after, reason, grant_id)
    values (v_grant.workspace_id, -v_grant.remaining, v_totals.total, 'expire', v_grant.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_adjust_tokens(
  p_workspace_id uuid,
  p_delta integer,
  p_reason text,
  p_admin_id uuid
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_grant_id uuid;
  v_need integer;
  v_take integer;
  v_grant record;
  v_totals record;
  v_ledger_id bigint;
begin
  if p_delta = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if coalesce(char_length(p_reason), 0) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.platform_role = 'platform_admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  if p_delta > 0 then
    insert into public.token_grants (workspace_id, source, amount, remaining, reference_type, reference, note, created_by)
    values (p_workspace_id, 'admin', p_delta, p_delta, 'admin', gen_random_uuid()::text, p_reason, p_admin_id)
    returning id into v_grant_id;
  else
    v_need := -p_delta;
    for v_grant in
      select g.id, g.remaining from public.token_grants g
      where g.workspace_id = p_workspace_id and g.remaining > 0 and (g.expires_at is null or g.expires_at > now())
      order by g.expires_at asc nulls last, g.created_at asc
      for update
    loop
      exit when v_need = 0;
      v_take := least(v_grant.remaining, v_need);
      update public.token_grants set remaining = remaining - v_take where id = v_grant.id;
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      raise exception 'INSUFFICIENT_TOKENS' using detail = format('short=%s', v_need);
    end if;
  end if;

  select * into v_totals from public.workspace_token_totals(p_workspace_id);
  insert into public.token_ledger (workspace_id, delta, balance_after, reason, grant_id, actor_id, note)
  values (p_workspace_id, p_delta, v_totals.total, 'admin_adjust', v_grant_id, p_admin_id, p_reason)
  returning id into v_ledger_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, after)
  values (p_admin_id, 'tokens.adjust', 'workspace', p_workspace_id::text,
          jsonb_build_object('delta', p_delta, 'reason', p_reason, 'ledger_id', v_ledger_id));

  return v_ledger_id;
end;
$$;

-- Prava: service_role na sve; authenticated samo na workspace_token_balance.
revoke all on function public.workspace_token_totals(uuid) from public, anon, authenticated;
revoke all on function public.workspace_token_balance(uuid) from public, anon;
grant execute on function public.workspace_token_balance(uuid) to authenticated, service_role;
revoke all on function public.reserve_tokens(uuid, uuid, uuid, integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.confirm_reservation(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_reservation(uuid, text) from public, anon, authenticated;
revoke all on function public.expire_reservations() from public, anon, authenticated;
revoke all on function public.grant_tokens(uuid, public.token_grant_source, integer, text, text, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.expire_grants() from public, anon, authenticated;
revoke all on function public.admin_adjust_tokens(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function
  public.workspace_token_totals(uuid),
  public.reserve_tokens(uuid, uuid, uuid, integer, uuid, integer),
  public.confirm_reservation(uuid, integer),
  public.release_reservation(uuid, text),
  public.expire_reservations(),
  public.grant_tokens(uuid, public.token_grant_source, integer, text, text, timestamptz, uuid, text),
  public.expire_grants(),
  public.admin_adjust_tokens(uuid, integer, text, uuid)
to service_role;
