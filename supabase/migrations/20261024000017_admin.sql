-- Faza 13 · admin panel: agregati za statistike i AI troškove, aktivnost korisnika, prinudna odjava.
-- Sve funkcije su security definer i dostupne samo service role-u (admin servisi na serveru).

-- Aktivni korisnici: različiti korisnici čija je sesija osvežena u prozoru (D-073).
create or replace function public.admin_activity_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select user_id,
           greatest(coalesce(updated_at, created_at), coalesce(refreshed_at at time zone 'UTC', created_at)) as seen
      from auth.sessions
  )
  select jsonb_build_object(
    'dau', (select count(distinct user_id) from s where seen > now() - interval '1 day'),
    'wau', (select count(distinct user_id) from s where seen > now() - interval '7 days'),
    'mau', (select count(distinct user_id) from s where seen > now() - interval '30 days')
  );
$$;

-- Prinudna odjava sa svih uređaja: brišu se sesije (i refresh tokeni kaskadno).
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Poslednja prijava i potvrda emaila za listu korisnika (auth šema nije izložena kroz API).
create or replace function public.admin_auth_users(p_ids uuid[])
returns table (id uuid, last_sign_in_at timestamptz, email_confirmed_at timestamptz, banned_until timestamptz, factors integer)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         u.last_sign_in_at,
         u.email_confirmed_at,
         u.banned_until,
         (select count(*)::integer from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
    from auth.users u
   where u.id = any(p_ids);
$$;

-- Pregled platforme za period (brif 16 „Statistike”).
create or replace function public.admin_dashboard_stats(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_new_1d', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
    'users_new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'users_banned', (select count(*) from public.profiles where is_banned),
    'users_per_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
        from (
          select generate_series((now() - make_interval(days => p_days - 1))::date, now()::date, interval '1 day')::date as day
        ) d
        left join (
          select created_at::date as day, count(*) as n
            from public.profiles
           where created_at > now() - make_interval(days => p_days)
           group by 1
        ) c on c.day = d.day
    ),
    'workspaces_total', (select count(*) from public.workspaces where deleted_at is null),
    'brands_total', (select count(*) from public.brands where deleted_at is null),
    'tokens_consumed_7d', (select coalesce(-sum(delta), 0) from public.token_ledger where reason = 'consume' and created_at > now() - interval '7 days'),
    'tokens_consumed_30d', (select coalesce(-sum(delta), 0) from public.token_ledger where reason = 'consume' and created_at > now() - interval '30 days'),
    'tokens_granted_30d', (select coalesce(sum(delta), 0) from public.token_ledger where reason in ('grant', 'admin_adjust') and delta > 0 and created_at > now() - interval '30 days'),
    'ai_generations_30d', (select count(*) from public.ai_generations where created_at > now() - interval '30 days'),
    'ai_failed_30d', (select count(*) from public.ai_generations where status = 'failed' and created_at > now() - interval '30 days'),
    'ai_cost_7d', (select coalesce(sum(cost_usd), 0) from public.ai_generations where created_at > now() - interval '7 days'),
    'ai_cost_30d', (select coalesce(sum(cost_usd), 0) from public.ai_generations where created_at > now() - interval '30 days'),
    'tokens_charged_30d', (select coalesce(sum(tokens_charged), 0) from public.ai_generations where created_at > now() - interval '30 days'),
    'posts_by_platform', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'published', published, 'failed', failed) order by platform), '[]'::jsonb)
        from (
          select platform::text as platform,
                 count(*) filter (where status in ('published', 'assisted_done')) as published,
                 count(*) filter (where status = 'failed') as failed
            from public.post_targets
           where coalesce(published_at, last_attempt_at, updated_at) > now() - make_interval(days => p_days)
             and status in ('published', 'assisted_done', 'failed')
           group by platform
        ) t
    ),
    'targets_late', (select count(*) from public.post_targets where status = 'scheduled' and scheduled_at < now() - interval '3 minutes'),
    'targets_failed_24h', (select count(*) from public.post_targets where status = 'failed' and updated_at > now() - interval '1 day'),
    'subscriptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'plan', p.code, 'name', p.name, 'interval', p.interval, 'price_cents', p.price_cents, 'active', x.n
             ) order by p.sort_order), '[]'::jsonb)
        from public.plans p
        join (
          select plan_id, count(*) as n from public.subscriptions where status in ('active', 'trialing', 'past_due') group by plan_id
        ) x on x.plan_id = p.id
    ),
    'subscriptions_canceled_30d', (select count(*) from public.subscriptions where canceled_at > now() - interval '30 days'),
    'paid_workspaces', (select count(distinct workspace_id) from public.subscriptions where status in ('active', 'trialing', 'past_due')),
    'topup_workspaces', (select count(distinct workspace_id) from public.token_grants where source = 'topup')
  );
$$;

-- AI troškovi po modelu, danu i radnom prostoru (brif 16 „AI troškovi”).
create or replace function public.admin_ai_costs(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'by_model', (
      select coalesce(jsonb_agg(row_to_json(m) order by m.cost_usd desc), '[]'::jsonb)
        from (
          select coalesce(model, 'bez modela') as model,
                 count(*) as generations,
                 count(*) filter (where status = 'failed') as failed,
                 coalesce(sum(cost_usd), 0)::numeric(12, 4) as cost_usd,
                 coalesce(sum(tokens_charged), 0) as tokens
            from public.ai_generations
           where created_at > now() - make_interval(days => p_days)
           group by 1
        ) m
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'cost_usd', coalesce(c.cost, 0), 'tokens', coalesce(c.tokens, 0), 'generations', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
        from (
          select generate_series((now() - make_interval(days => p_days - 1))::date, now()::date, interval '1 day')::date as day
        ) d
        left join (
          select created_at::date as day, sum(cost_usd)::numeric(12, 4) as cost, sum(tokens_charged) as tokens, count(*) as n
            from public.ai_generations
           where created_at > now() - make_interval(days => p_days)
           group by 1
        ) c on c.day = d.day
    ),
    'by_workspace', (
      select coalesce(jsonb_agg(row_to_json(w) order by w.cost_usd desc), '[]'::jsonb)
        from (
          select g.workspace_id,
                 ws.name as workspace_name,
                 (select p.email::text from public.workspace_members m join public.profiles p on p.id = m.user_id
                   where m.workspace_id = g.workspace_id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
                 count(*) as generations,
                 coalesce(sum(g.cost_usd), 0)::numeric(12, 4) as cost_usd,
                 coalesce(sum(g.tokens_charged), 0) as tokens,
                 exists (select 1 from public.subscriptions s where s.workspace_id = g.workspace_id and s.status in ('active', 'trialing', 'past_due'))
                   or exists (select 1 from public.token_grants t where t.workspace_id = g.workspace_id and t.source = 'topup') as paid
            from public.ai_generations g
            join public.workspaces ws on ws.id = g.workspace_id
           where g.created_at > now() - make_interval(days => p_days)
           group by g.workspace_id, ws.name
           order by cost_usd desc
           limit 200
        ) w
    )
  );
$$;

revoke all on function public.admin_activity_counts() from public, anon, authenticated;
grant execute on function public.admin_activity_counts() to service_role;
revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;
revoke all on function public.admin_auth_users(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_auth_users(uuid[]) to service_role;
revoke all on function public.admin_dashboard_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats(integer) to service_role;
revoke all on function public.admin_ai_costs(integer) from public, anon, authenticated;
grant execute on function public.admin_ai_costs(integer) to service_role;

-- aktivno podešavanje modela (D-072); prazno = modeli iz env-a
insert into public.platform_settings (key, value, description, is_public) values
  ('active_models', '{}', 'Aktivni modeli koje je admin izabrao iz allowed_models (prazno = env)', false)
on conflict (key) do nothing;

-- brza pretraga audit loga po cilju i akciji
create index if not exists admin_audit_log_created on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target on public.admin_audit_log (target_id, created_at desc);
create index if not exists admin_audit_log_action on public.admin_audit_log (action, created_at desc);
create index if not exists impersonation_sessions_active on public.impersonation_sessions (admin_id) where ended_at is null;
