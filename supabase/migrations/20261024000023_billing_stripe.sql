-- Faza 12 · naplata kroz Stripe (D-090): jedan kupac po radnom prostoru, podsetnici za neuspelo
-- plaćanje i oduzimanje tokena posle povraćaja novca ili spora.

create table public.billing_customers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade deferrable initially deferred,
  provider text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);
alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;
-- bez politika: čita i piše samo service_role

-- koji podsetnik za neuspelo plaćanje je poslat (dan 1, 3, 6 → korak 1, 2, 3)
alter table public.subscriptions add column dunning_step smallint not null default 0;

create index payment_events_open on public.payment_events (received_at) where status in ('received', 'failed');

-- Oduzimanje tokena posle povraćaja novca ili spora, do ukupnog iznosa za tu referencu: ponovljen ili
-- delimičan događaj oduzima samo razliku. Prvo iz granta tog plaćanja, pa iz grantova koji najranije
-- ističu. Ako tokena nema dovoljno, oduzima koliko ima; vraća koliko je oduzeto u ovom pozivu.
create or replace function public.revoke_tokens_to(
  p_workspace_id uuid,
  p_target integer,
  p_reference text,
  p_grant_id uuid default null,
  p_note text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_done integer;
  v_need integer;
  v_take integer;
  v_taken integer := 0;
  v_grant record;
  v_totals record;
begin
  if p_target < 0 or coalesce(char_length(p_reference), 0) = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;
  select coalesce(-sum(l.delta), 0)::integer into v_done
  from public.token_ledger l
  where l.workspace_id = p_workspace_id and l.reason = 'refund' and l.reference = p_reference;
  v_need := p_target - v_done;
  if v_need <= 0 then
    return 0;
  end if;
  for v_grant in
    select g.id, g.remaining from public.token_grants g
    where g.workspace_id = p_workspace_id and g.remaining > 0 and (g.expires_at is null or g.expires_at > now())
    order by (g.id is not distinct from p_grant_id) desc, g.expires_at asc nulls last, g.created_at asc
    for update
  loop
    exit when v_need = 0;
    v_take := least(v_grant.remaining, v_need);
    update public.token_grants set remaining = remaining - v_take where id = v_grant.id;
    v_need := v_need - v_take;
    v_taken := v_taken + v_take;
  end loop;
  if v_taken > 0 then
    select * into v_totals from public.workspace_token_totals(p_workspace_id);
    insert into public.token_ledger (workspace_id, delta, balance_after, reason, grant_id, reference, note)
    values (p_workspace_id, -v_taken, v_totals.total, 'refund', p_grant_id, p_reference, p_note);
  end if;
  return v_taken;
end;
$$;

revoke all on function public.revoke_tokens_to(uuid, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_tokens_to(uuid, integer, text, uuid, text) to service_role;
