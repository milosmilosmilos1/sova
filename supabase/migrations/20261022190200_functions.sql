-- Sova: funkcije za tokene, rate limit, statistike, admin. Vidi PLAN.md 4.12.
--
-- Sve funkcije za tokene su security definer i sme da ih zove samo
-- service_role (server). Browser ih ne može pozvati ni preko RPC-a.

-- ---------------------------------------------------------------------------
-- reserve_tokens: atomski skida tokene i upisuje spend stavku (reserved).
-- Jedna UPDATE naredba sa uslovom token_balance >= amount: dva paralelna
-- zahteva ne mogu oba da prođu sa poslednjih 8 tokena.
-- ---------------------------------------------------------------------------

create or replace function public.reserve_tokens(
  p_user_id       uuid,
  p_amount        integer,
  p_generation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_tx_id   uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  update public.profiles
     set token_balance = token_balance - p_amount
   where id = p_user_id
     and token_balance >= p_amount
  returning token_balance into v_balance;

  if not found then
    raise exception 'INSUFFICIENT_TOKENS' using errcode = 'P0001';
  end if;

  insert into public.token_transactions
    (user_id, amount, balance_after, type, status, generation_id)
  values
    (p_user_id, -p_amount, v_balance, 'spend', 'reserved', p_generation_id)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- commit_tokens: rezervacija postaje konačna.
-- ---------------------------------------------------------------------------

create or replace function public.commit_tokens(p_tx_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.token_transactions
     set status = 'completed'
   where id = p_tx_id
     and status = 'reserved';

  if not found then
    raise exception 'TX_NOT_RESERVED' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_tokens: generisanje nije uspelo, tokeni se vraćaju. Originalna
-- stavka dobija status released, a upisuje se i refund stavka da ledger
-- ostane matematički tačan.
-- ---------------------------------------------------------------------------

create or replace function public.release_tokens(p_tx_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx      public.token_transactions%rowtype;
  v_balance integer;
begin
  select * into v_tx
    from public.token_transactions
   where id = p_tx_id
     and status = 'reserved'
   for update;

  if not found then
    raise exception 'TX_NOT_RESERVED' using errcode = 'P0001';
  end if;

  update public.profiles
     set token_balance = token_balance + (-v_tx.amount)
   where id = v_tx.user_id
  returning token_balance into v_balance;

  update public.token_transactions
     set status = 'released'
   where id = p_tx_id;

  insert into public.token_transactions
    (user_id, amount, balance_after, type, status, generation_id, note)
  values
    (v_tx.user_id, -v_tx.amount, v_balance, 'refund', 'completed', v_tx.generation_id,
     'Vraćeno: generisanje nije uspelo');

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- grant_tokens: dodaje tokene (kupovina, admin, ...). Idempotentno po
-- stripe_invoice_id: isti račun dva puta = tokeni jednom. Red profila se
-- zaključava prvo, pa su paralelni pozivi serijalizovani.
-- Vraća true ako je dodelio, false ako je račun već obrađen.
-- ---------------------------------------------------------------------------

create or replace function public.grant_tokens(
  p_user_id           uuid,
  p_amount            integer,
  p_type              text,
  p_stripe_invoice_id text default null,
  p_note              text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_type not in ('purchase', 'admin_adjust', 'welcome') then
    raise exception 'INVALID_TYPE' using errcode = 'P0001';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_stripe_invoice_id is not null and exists (
    select 1 from public.token_transactions where stripe_invoice_id = p_stripe_invoice_id
  ) then
    return false;
  end if;

  update public.profiles
     set token_balance = token_balance + p_amount
   where id = p_user_id
  returning token_balance into v_balance;

  insert into public.token_transactions
    (user_id, amount, balance_after, type, status, stripe_invoice_id, note)
  values
    (p_user_id, p_amount, v_balance, p_type, 'completed', p_stripe_invoice_id, p_note);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_tokens: povraćaj novca (chargeback). Skida do p_amount, ne ispod 0.
-- Vraća koliko je stvarno skinuto.
-- ---------------------------------------------------------------------------

create or replace function public.revoke_tokens(
  p_user_id           uuid,
  p_amount            integer,
  p_stripe_invoice_id text default null,
  p_note              text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_take    integer;
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  select token_balance into v_current
    from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_take := least(v_current, p_amount);
  if v_take = 0 then
    return 0;
  end if;

  update public.profiles
     set token_balance = token_balance - v_take
   where id = p_user_id
  returning token_balance into v_balance;

  insert into public.token_transactions
    (user_id, amount, balance_after, type, status, note)
  values
    (p_user_id, -v_take, v_balance, 'chargeback', 'completed',
     coalesce(p_note, 'Povraćaj novca za račun ' || coalesce(p_stripe_invoice_id, '?')));

  return v_take;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_adjust_tokens: admin ručno dodaje ili oduzima. Piše ledger i audit.
-- Server prosleđuje admin id iz sesije; funkcija proverava da je zaista admin.
-- ---------------------------------------------------------------------------

create or replace function public.admin_adjust_tokens(
  p_admin_id  uuid,
  p_target_id uuid,
  p_amount    integer,
  p_note      text,
  p_ip        text default null,
  p_user_agent text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_balance integer;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_note is null or char_length(trim(p_note)) = 0 then
    raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
  end if;

  select token_balance into v_current
    from public.profiles where id = p_target_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_current + p_amount < 0 then
    raise exception 'INSUFFICIENT_TOKENS' using errcode = 'P0001';
  end if;

  update public.profiles
     set token_balance = token_balance + p_amount
   where id = p_target_id
  returning token_balance into v_balance;

  insert into public.token_transactions
    (user_id, amount, balance_after, type, status, admin_id, note)
  values
    (p_target_id, p_amount, v_balance, 'admin_adjust', 'completed', p_admin_id, p_note);

  insert into public.admin_audit_log
    (admin_id, action, target_user_id, details, ip, user_agent)
  values
    (p_admin_id, 'tokens_adjust', p_target_id,
     jsonb_build_object('amount', p_amount, 'note', p_note, 'balance_after', v_balance),
     p_ip, p_user_agent);

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- log_admin_action: ostale admin akcije (blokiranje, impersonacija, ...).
-- ---------------------------------------------------------------------------

create or replace function public.log_admin_action(
  p_admin_id   uuid,
  p_action     text,
  p_target_id  uuid,
  p_details    jsonb default '{}'::jsonb,
  p_ip         text default null,
  p_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.admin_audit_log
    (admin_id, action, target_user_id, details, ip, user_agent)
  values
    (p_admin_id, p_action, p_target_id, coalesce(p_details, '{}'::jsonb), p_ip, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- check_rate_limit: fiksni prozor. true = sme, false = preko limita.
-- ---------------------------------------------------------------------------

create or replace function public.check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Povremeno čišćenje starih prozora, bez posebnog cron-a.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_user_stats: statistike za jednog korisnika. Sme korisnik za sebe,
-- admin za bilo koga, server za bilo koga.
-- ---------------------------------------------------------------------------

create or replace function public.get_user_stats(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now());
  v_result      jsonb;
begin
  if auth.role() is distinct from 'service_role'
     and auth.uid() is distinct from p_user_id
     and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'token_balance', (select token_balance from public.profiles where id = p_user_id),
    'totals', jsonb_build_object(
      'text',              count(*) filter (where type = 'text'),
      'image_from_prompt', count(*) filter (where type = 'image_from_prompt'),
      'image_from_photo',  count(*) filter (where type = 'image_from_photo'),
      'all',               count(*)
    ),
    'this_month', jsonb_build_object(
      'text',              count(*) filter (where type = 'text' and created_at >= v_month_start),
      'image_from_prompt', count(*) filter (where type = 'image_from_prompt' and created_at >= v_month_start),
      'image_from_photo',  count(*) filter (where type = 'image_from_photo' and created_at >= v_month_start),
      'all',               count(*) filter (where created_at >= v_month_start)
    ),
    'tokens_spent_total', coalesce(sum(tokens_cost), 0),
    'tokens_spent_month', coalesce(sum(tokens_cost) filter (where created_at >= v_month_start), 0),
    'daily', (
      select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb)
      from (
        select
          to_char(day, 'YYYY-MM-DD') as day,
          count(g.id) filter (where g.type = 'text') as text,
          count(g.id) filter (where g.type <> 'text') as image,
          coalesce(sum(g.tokens_cost), 0) as tokens
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as day
        left join public.generations g
          on g.user_id = p_user_id
         and g.status = 'completed'
         and g.created_at >= day
         and g.created_at < day + interval '1 day'
        group by day
      ) d
    )
  )
  into v_result
  from public.generations
  where user_id = p_user_id
    and status = 'completed';

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_admin_stats: brojke za admin panel.
-- ---------------------------------------------------------------------------

create or replace function public.get_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_30d timestamptz := now() - interval '30 days';
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users_total',        (select count(*) from public.profiles),
    'users_new_30d',      (select count(*) from public.profiles where created_at >= v_30d),
    'users_blocked',      (select count(*) from public.profiles where is_blocked),
    'users_onboarded',    (select count(*) from public.profiles where onboarding_completed),
    'subs_active_monthly',(select count(*) from public.subscriptions where plan = 'monthly' and status in ('active', 'trialing')),
    'subs_active_yearly', (select count(*) from public.subscriptions where plan = 'yearly' and status in ('active', 'trialing')),
    'subs_past_due',      (select count(*) from public.subscriptions where status = 'past_due'),
    'mrr_cents', (
      select coalesce(sum(case plan when 'monthly' then 3900 when 'yearly' then 19900 / 12 end), 0)
      from public.subscriptions where status in ('active', 'trialing')
    ),
    'revenue_30d_cents',  (select coalesce(sum(amount_paid), 0) from public.payments where status = 'paid' and paid_at >= v_30d),
    'revenue_total_cents',(select coalesce(sum(amount_paid), 0) from public.payments where status = 'paid'),
    'generations_total',  (select count(*) from public.generations where status = 'completed'),
    'generations_30d',    (select count(*) from public.generations where status = 'completed' and created_at >= v_30d),
    'generations_failed_30d', (select count(*) from public.generations where status = 'failed' and created_at >= v_30d),
    'generations_by_type', (
      select coalesce(jsonb_object_agg(type, c), '{}'::jsonb)
      from (select type, count(*) c from public.generations where status = 'completed' group by type) t
    ),
    'tokens_spent_30d',   (select coalesce(-sum(amount), 0) from public.token_transactions where type = 'spend' and status = 'completed' and created_at >= v_30d),
    'tokens_granted_30d', (select coalesce(sum(amount), 0) from public.token_transactions where type = 'purchase' and created_at >= v_30d)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dozvole: funkcije za tokene i admin samo server; statistike i korisnik.
-- Supabase podrazumevano daje execute ulogama anon i authenticated, pa
-- revoke mora da ih navede, "from public" nije dovoljan.
-- ---------------------------------------------------------------------------

revoke all on function public.reserve_tokens(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.commit_tokens(uuid) from public, anon, authenticated;
revoke all on function public.release_tokens(uuid) from public, anon, authenticated;
revoke all on function public.grant_tokens(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_tokens(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_adjust_tokens(uuid, uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.log_admin_action(uuid, text, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_user_stats(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_stats() from public, anon, authenticated;

grant execute on function public.reserve_tokens(uuid, integer, uuid) to service_role;
grant execute on function public.commit_tokens(uuid) to service_role;
grant execute on function public.release_tokens(uuid) to service_role;
grant execute on function public.grant_tokens(uuid, integer, text, text, text) to service_role;
grant execute on function public.revoke_tokens(uuid, integer, text, text) to service_role;
grant execute on function public.admin_adjust_tokens(uuid, uuid, integer, text, text, text) to service_role;
grant execute on function public.log_admin_action(uuid, text, uuid, jsonb, text, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.get_user_stats(uuid) to authenticated, service_role;
grant execute on function public.get_admin_stats() to authenticated, service_role;
