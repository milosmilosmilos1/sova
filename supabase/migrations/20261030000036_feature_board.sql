-- Tabla predloga (D-115): korisnici predlažu funkcije i glasaju, a problemi (bug) vide samo autor i
-- administratori platforme. Upis ide kroz API (service role); broj glasova menja jedna funkcija.
create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'idea' check (kind in ('idea', 'bug')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  status text not null default 'new' check (status in ('new', 'planned', 'in_progress', 'done', 'declined')),
  author_id uuid references public.profiles(id) on delete set null deferrable initially deferred,
  workspace_id uuid references public.workspaces(id) on delete set null deferrable initially deferred,
  votes integer not null default 0 check (votes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feature_requests_list on public.feature_requests (kind, created_at desc);

create table public.feature_votes (
  request_id uuid not null references public.feature_requests(id) on delete cascade deferrable initially deferred,
  user_id uuid not null references public.profiles(id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.feature_requests enable row level security;
alter table public.feature_votes enable row level security;
create policy feature_requests_select on public.feature_requests for select to authenticated
  using (kind = 'idea' or author_id = auth.uid());
create policy feature_votes_select_own on public.feature_votes for select to authenticated
  using (user_id = auth.uid());

-- glas uključuje ili isključuje, a broj na predlogu ostaje tačan i kad dva korisnika kliknu istovremeno
create or replace function public.toggle_feature_vote(p_request_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_votes integer;
  v_voted boolean;
begin
  perform 1 from public.feature_requests where id = p_request_id and kind = 'idea' for update;
  if not found then
    raise exception 'feature request not found' using errcode = 'P0002';
  end if;
  delete from public.feature_votes where request_id = p_request_id and user_id = p_user_id;
  if found then
    update public.feature_requests set votes = greatest(votes - 1, 0) where id = p_request_id
      returning votes into v_votes;
    v_voted := false;
  else
    insert into public.feature_votes (request_id, user_id) values (p_request_id, p_user_id);
    update public.feature_requests set votes = votes + 1 where id = p_request_id
      returning votes into v_votes;
    v_voted := true;
  end if;
  return jsonb_build_object('voted', v_voted, 'votes', v_votes);
end;
$$;

revoke all on function public.toggle_feature_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_feature_vote(uuid, uuid) to service_role;
