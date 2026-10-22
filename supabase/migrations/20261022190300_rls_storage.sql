-- Sova: RLS politike i storage. Vidi PLAN.md odeljak 5 i 4.11.
--
-- Pravilo: korisnik vidi i menja samo svoje redove. Admin (is_admin()) vidi
-- sve. Ledger, plaćanja, audit: korisnik samo čita svoje; piše isključivo
-- server (service_role zaobilazi RLS). Tabele bez ijedne politike su
-- nedostupne ulogovanom korisniku.

alter table public.profiles           enable row level security;
alter table public.businesses         enable row level security;
alter table public.generations        enable row level security;
alter table public.token_transactions enable row level security;
alter table public.rate_limits        enable row level security;
alter table public.stripe_customers   enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.payments           enable row level security;
alter table public.stripe_events      enable row level security;
alter table public.admin_audit_log    enable row level security;

-- profiles --------------------------------------------------------------------

create policy "profiles: svoj ili admin čita"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Insert ide kroz trigger na auth.users, delete kroz auth.admin (cascade).
-- Update: svoj red (trigger brani osetljive kolone) ili admin.
create policy "profiles: svoj ili admin menja"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- businesses ------------------------------------------------------------------

create policy "businesses: svoj ili admin čita"
  on public.businesses for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "businesses: svoj upisuje"
  on public.businesses for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

create policy "businesses: svoj ili admin menja"
  on public.businesses for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "businesses: svoj briše"
  on public.businesses for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- generations -----------------------------------------------------------------

create policy "generations: svoj ili admin čita"
  on public.generations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "generations: svoj ili admin upisuje"
  on public.generations for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

create policy "generations: svoj ili admin menja"
  on public.generations for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "generations: svoj ili admin briše"
  on public.generations for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- token_transactions: samo čitanje svojih (admin sve). Piše server. ----------

create policy "token_transactions: svoj ili admin čita"
  on public.token_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- rate_limits: nema politika, samo server. ------------------------------------

-- stripe_customers / subscriptions / payments: čitanje svojih. -----------------

create policy "stripe_customers: svoj ili admin čita"
  on public.stripe_customers for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "subscriptions: svoj ili admin čita"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "payments: svoj ili admin čita"
  on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- stripe_events: nema politika, samo server. ----------------------------------

-- admin_audit_log: admin čita. Piše server kroz funkcije. ---------------------

create policy "admin_audit_log: admin čita"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: tri privatna bucket-a, putanja {user_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads',   'uploads',   false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('generated', 'generated', false, 20971520, array['image/jpeg', 'image/png', 'image/webp']),
  ('logos',     'logos',     false, 2097152,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Prvi segment putanje mora biti id korisnika. Admin može sve.
create policy "storage: svoj folder čita"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('uploads', 'generated', 'logos')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "storage: svoj folder upisuje"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('uploads', 'generated', 'logos')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "storage: svoj folder menja"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('uploads', 'generated', 'logos')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "storage: svoj folder briše"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('uploads', 'generated', 'logos')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
