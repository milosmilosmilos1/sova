-- Objavljivanje bez Inngest-a (D-193): kad je prekidač `publish_cron` uključen, objave pokreće
-- Netlify na 2 minuta (i „Objavi sada” odmah), a ovde se pamti dokle je stigao svaki target: završeni
-- koraci sa rezultatom (kao Inngest memo), kad treba da se probudi i ko ga trenutno izvršava.
-- Jedan red po targetu; novi termin istog targeta pravi nov prolaz (koraci se brišu).
-- Pišu i čitaju samo serverske funkcije (service role); korisnici nemaju pristup.
create table public.publish_runs (
  target_id uuid primary key references public.post_targets(id) on delete cascade,
  run_id text not null,
  -- PublishJob: {targetId, scheduledAt, version}
  job jsonb not null,
  -- završeni koraci i spavanja: {"<ime>": {"v": rezultat} | {"wakeAt": "..."} | {"slept": true}}
  steps jsonb not null default '{}'::jsonb,
  wake_at timestamptz not null default now(),
  -- zauzeto dok ga jedan poziv izvršava; posle isteka ga sme preuzeti sledeći
  locked_until timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'done', 'failed', 'cancelled')),
  outcome text,
  error text,
  -- naše greške (baza, mreža do Supabase-a) van pokušaja prema mreži; posle 3 target se oslobađa
  engine_retries integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index publish_runs_due on public.publish_runs (wake_at) where status = 'waiting';

alter table public.publish_runs enable row level security;
revoke all on public.publish_runs from anon, authenticated;

-- prekidač: dok je uključen, publish-target u Inngest-u ne radi ništa (nema dvostrukih prolaza)
insert into public.feature_flags (key, enabled, description)
values ('publish_cron', false, 'Objave bez Inngest-a: Netlify na 2 min i „Objavi sada” odmah (D-193)')
on conflict (key) do nothing;
