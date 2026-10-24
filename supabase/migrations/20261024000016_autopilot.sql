-- Faza 10c · Autopilot: evidencija prolaza (nedeljni nacrti, mesečna strategija)
-- Jedan red po (brend, vrsta, period) je i zaključavanje: drugi run za istu nedelju ne prolazi.

create table public.autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly')),
  period_start date not null,
  level smallint not null check (level between 0 and 3),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'skipped', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  triggered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (brand_id, kind, period_start)
);
create index autopilot_runs_brand on public.autopilot_runs (brand_id, created_at desc);

alter table public.autopilot_runs enable row level security;
create policy autopilot_runs_select on public.autopilot_runs for select to authenticated
  using (public.has_brand_access(brand_id));
-- upis samo kroz service role (Inngest funkcije i servis Autopilota)

-- brz pregled Autopilot objava koje čekaju rok ili zakazivanje
create index posts_autopilot_pending on public.posts (brand_id, scheduled_for)
  where source = 'autopilot' and status in ('in_review', 'approved') and deleted_at is null;
