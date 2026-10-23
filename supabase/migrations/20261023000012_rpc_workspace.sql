-- Faza 3 · 12/14 · RPC za workspace, pozivnice, statuse objava i brisanje naloga

-- Kreiranje workspace-a: workspace + owner + podrazumevani brend + signup tokeni, atomično.
create or replace function public.create_workspace(
  p_name text,
  p_type public.workspace_type default 'business',
  p_brand_name text default null,
  p_website_url text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_ws uuid;
  v_brand uuid;
  v_signup integer;
  v_limit integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.is_banned) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 or char_length(p_name) > 100 then
    raise exception 'VALIDATION' using detail = 'name';
  end if;

  -- Meki limit broja workspace-ova po korisniku (zaštita od zloupotrebe besplatnih tokena)
  select coalesce((value ->> 'max_workspaces_per_user')::integer, 5)
    into v_limit from public.platform_settings where key = 'limits';
  if (select count(*) from public.workspaces w where w.owner_id = v_user and w.deleted_at is null) >= coalesce(v_limit, 5) then
    raise exception 'PLAN_LIMIT' using detail = 'workspaces';
  end if;

  insert into public.workspaces (name, type, owner_id)
  values (btrim(p_name), p_type, v_user)
  returning id into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role, all_brands)
  values (v_ws, v_user, 'owner', true);

  insert into public.brands (workspace_id, name, website_url, created_by)
  values (v_ws, coalesce(nullif(btrim(p_brand_name), ''), btrim(p_name)), nullif(btrim(p_website_url), ''), v_user)
  returning id into v_brand;

  -- Besplatni tokeni: jednom po korisniku (UNIQUE source+reference), ne po workspace-u.
  select coalesce((value ->> 'signup_tokens')::integer, 50)
    into v_signup from public.platform_settings where key = 'free_tier';
  v_signup := coalesce(v_signup, 50);
  if v_signup > 0 then
    perform public.grant_tokens(v_ws, 'signup', v_signup, 'signup', v_user::text, null, v_user, 'Dobrodošlica');
  end if;

  return jsonb_build_object('workspace_id', v_ws, 'brand_id', v_brand);
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations%rowtype;
  v_hash text;
  v_brand uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_inv from public.invitations where token_hash = v_hash for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'NOT_FOUND' using detail = 'invitation';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'INVITATION_EXPIRED';
  end if;
  if lower(v_inv.email::text) <> v_email then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'email_mismatch';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, all_brands, invited_by)
  values (v_inv.workspace_id, v_user, v_inv.role, v_inv.brand_ids is null, v_inv.invited_by)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role, all_brands = excluded.all_brands;

  if v_inv.brand_ids is not null then
    delete from public.member_brand_access where workspace_id = v_inv.workspace_id and user_id = v_user;
    foreach v_brand in array v_inv.brand_ids loop
      insert into public.member_brand_access (workspace_id, user_id, brand_id)
      values (v_inv.workspace_id, v_user, v_brand)
      on conflict do nothing;
    end loop;
  end if;

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_user
   where id = v_inv.id;

  return jsonb_build_object('workspace_id', v_inv.workspace_id, 'role', v_inv.role);
end;
$$;

-- Prelaz statusa objave sa optimističkim zaključavanjem i snimkom verzije.
create or replace function public.transition_post(
  p_post_id uuid,
  p_to public.post_status,
  p_expected_version integer,
  p_actor uuid,
  p_summary text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_snapshot jsonb;
begin
  select * into v_post from public.posts where id = p_post_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'post';
  end if;
  if p_expected_version is not null and v_post.version <> p_expected_version then
    raise exception 'CONFLICT' using detail = format('version=%s expected=%s', v_post.version, p_expected_version);
  end if;
  if v_post.status = p_to then
    return v_post.version;
  end if;
  if not exists (
    select 1 from public.status_transitions t
    where t.scope = 'post' and t.from_status = v_post.status::text and t.to_status = p_to::text
  ) then
    raise exception 'INVALID_TRANSITION' using detail = format('%s -> %s', v_post.status, p_to);
  end if;

  v_snapshot := jsonb_build_object(
    'status_from', v_post.status,
    'status_to', p_to,
    'master_text', v_post.master_text,
    'scheduled_for', v_post.scheduled_for,
    'targets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'social_account_id', t.social_account_id, 'platform', t.platform,
        'text', t.text_content, 'options', t.options, 'scheduled_at', t.scheduled_at, 'status', t.status
      ) order by t.created_at), '[]'::jsonb)
      from public.post_targets t where t.post_id = p_post_id
    )
  );

  update public.posts
     set status = p_to,
         version = version + 1,
         submitted_at = case when p_to = 'in_review' then now() else submitted_at end,
         approved_at = case when p_to = 'approved' then now() else approved_at end,
         approved_by = case when p_to = 'approved' then p_actor else approved_by end,
         locked_at = case when p_to = 'publishing' then now() when p_to in ('published','failed','partially_published') then null else locked_at end
   where id = p_post_id;

  insert into public.post_versions (post_id, version, snapshot, change_summary, changed_by)
  values (p_post_id, v_post.version + 1, v_snapshot, coalesce(p_summary, format('%s → %s', v_post.status, p_to)), p_actor);

  return v_post.version + 1;
end;
$$;

-- Odluka o odobrenju (interno ili preko javnog linka)
create or replace function public.decide_post(
  p_post_id uuid,
  p_decision public.approval_decision,
  p_comment text,
  p_post_version integer,
  p_actor uuid default null,
  p_link_id uuid default null,
  p_step smallint default 1
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_target public.post_status;
  v_version integer;
begin
  select * into v_post from public.posts where id = p_post_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'post';
  end if;
  if v_post.version <> p_post_version then
    raise exception 'CONFLICT' using detail = 'post_changed_since_review';
  end if;
  if v_post.status <> 'in_review' then
    raise exception 'INVALID_TRANSITION' using detail = format('%s is not in_review', v_post.status);
  end if;

  v_target := case p_decision
    when 'approved' then 'approved'::public.post_status
    when 'rejected' then 'rejected'::public.post_status
    else 'draft'::public.post_status
  end;

  insert into public.approvals (post_id, brand_id, workspace_id, step, approver_id, approval_link_id, decision, comment, post_version, decided_at)
  values (p_post_id, v_post.brand_id, v_post.workspace_id, p_step, p_actor, p_link_id, p_decision, p_comment, p_post_version, now());

  v_version := public.transition_post(p_post_id, v_target, p_post_version, p_actor, format('odluka: %s', p_decision));
  return v_version;
end;
$$;

create or replace function public.request_account_deletion(
  p_source text,
  p_user_id uuid default null,
  p_email text default null,
  p_external_user_id text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := encode(extensions.gen_random_bytes(8), 'hex');
  v_id uuid;
begin
  insert into public.account_deletion_requests (user_id, email, source, external_user_id, confirmation_code)
  values (p_user_id, p_email::extensions.citext, p_source, p_external_user_id, v_code)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'confirmation_code', v_code);
end;
$$;

-- Prava
revoke all on function public.create_workspace(text, public.workspace_type, text, text) from public, anon;
grant execute on function public.create_workspace(text, public.workspace_type, text, text) to authenticated, service_role;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

revoke all on function public.transition_post(uuid, public.post_status, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_post(uuid, public.post_status, integer, uuid, text) to service_role;

revoke all on function public.decide_post(uuid, public.approval_decision, text, integer, uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function public.decide_post(uuid, public.approval_decision, text, integer, uuid, uuid, smallint) to service_role;

revoke all on function public.request_account_deletion(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_account_deletion(text, uuid, text, text) to service_role;
