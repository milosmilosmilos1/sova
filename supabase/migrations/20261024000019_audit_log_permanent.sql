-- Faza 13 · audit log kao trajan zapis
--
-- 1) admin_audit_log nema strane ključeve. Brisanje korisnika je kroz kaskadu na impersonation_sessions
--    tiho brisalo vezu zapisa sa sesijom (SET NULL), a RESTRICT na admin_id je sprečavao brisanje
--    bivšeg admina. Zapis ostaje kakav je upisan.
-- 2) admin_email: email admina u trenutku radnje, da zapis ostane čitljiv i kad nalog više ne postoji.
-- 3) admin_adjust_tokens upisuje jedan potpun audit zapis u istoj transakciji. Ranije su nastajala dva
--    (jedan iz funkcije bez konteksta, jedan iz servisa), a pad drugog upisa ostavljao je promenu
--    tokena bez potpunog zapisa.

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_admin_id_fkey,
  drop constraint if exists admin_audit_log_impersonation_session_id_fkey,
  add column if not exists admin_email text;

comment on column public.admin_audit_log.admin_email is
  'Email admina u trenutku radnje (snimak; nalog može kasnije biti obrisan).';

-- popuna postojećih zapisa: jedina izmena audit loga, uz privremeno isključen append-only okidač
alter table public.admin_audit_log disable trigger admin_audit_log_append_only;
update public.admin_audit_log l set admin_email = p.email::text
  from public.profiles p
 where p.id = l.admin_id and l.admin_email is null;
alter table public.admin_audit_log enable trigger admin_audit_log_append_only;

drop function if exists public.admin_adjust_tokens(uuid, integer, text, uuid);

create function public.admin_adjust_tokens(
  p_workspace_id uuid,
  p_delta integer,
  p_reason text,
  p_admin_id uuid,
  p_audit jsonb default '{}'::jsonb
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_grant_id uuid;
  v_need integer;
  v_take integer;
  v_grant record;
  v_before record;
  v_totals record;
  v_ledger_id bigint;
  v_ip inet;
  v_target text := nullif(p_audit ->> 'target_user_id', '');
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

  select * into v_before from public.workspace_token_totals(p_workspace_id);

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

  begin
    v_ip := nullif(p_audit ->> 'ip', '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, before, after, ip, user_agent, request_id)
  values (
    p_admin_id,
    coalesce(nullif(p_audit ->> 'admin_email', ''), (select p.email::text from public.profiles p where p.id = p_admin_id)),
    'tokens.adjust',
    case when v_target is null then 'workspace' else 'user' end,
    coalesce(v_target, p_workspace_id::text),
    jsonb_build_object('workspaceId', p_workspace_id, 'available', v_before.available),
    jsonb_build_object('workspaceId', p_workspace_id, 'available', v_totals.available, 'delta', p_delta,
                       'reason', p_reason, 'ledgerId', v_ledger_id),
    v_ip,
    nullif(p_audit ->> 'user_agent', ''),
    nullif(p_audit ->> 'request_id', '')
  );

  return v_ledger_id;
end;
$$;

revoke all on function public.admin_adjust_tokens(uuid, integer, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_adjust_tokens(uuid, integer, text, uuid, jsonb) to service_role;
