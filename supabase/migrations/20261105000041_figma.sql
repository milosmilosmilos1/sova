-- Figma veza po (workspace, korisnik) (D-161), kao canva_connections: uvoz okvira kao slajdova i
-- boja, fontova i logoa iz Figma fajla. Tokeni su šifrovani (AES-256-GCM, kao Canva); korisnik vidi
-- samo svoju vezu bez tokena, a upis ide kroz API (service role).
create table public.figma_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade deferrable initially deferred,
  user_id uuid not null references public.profiles(id) on delete cascade deferrable initially deferred,
  figma_user_id text not null check (char_length(figma_user_id) <= 100),
  access_token_enc bytea not null,
  refresh_token_enc bytea not null,
  key_version smallint not null default 1,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  status public.social_account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create trigger figma_connections_updated_at before update on public.figma_connections
  for each row execute function public.set_updated_at();

alter table public.figma_connections enable row level security;
revoke all on public.figma_connections from anon, authenticated;
grant select (id, workspace_id, user_id, figma_user_id, token_expires_at, scopes, status, created_at, updated_at)
  on public.figma_connections to authenticated;
grant delete on public.figma_connections to authenticated;
create policy figma_connections_select on public.figma_connections for select to authenticated
  using (user_id = (select auth.uid()) or public.can_admin(workspace_id));
create policy figma_connections_delete on public.figma_connections for delete to authenticated
  using (user_id = (select auth.uid()) and not public.is_impersonation_readonly());

-- Figma aplikacija je u probi dok je Figma ne odobri: prekidač važi samo za radne prostore iz
-- rollout.workspaces (uključuje administrator platforme)
insert into public.feature_flags (key, enabled, description)
values ('figma', false, 'Uvoz iz Figme (D-161): okviri kao slajdovi, boje, fontovi i logo')
on conflict (key) do nothing;
