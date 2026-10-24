-- Faza 8c · otpremanje direktno u skladište: fajl prvo stiže u ws/.../incoming/{id}, a /api/media/complete
-- ga proverava i premešta. Napušteni fajlovi (korisnik zatvorio tab) se brišu dnevnim poslom.
create or replace function public.stale_incoming_uploads(p_before timestamptz, p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'uploads'
    and o.name like 'ws/%/incoming/%'
    and o.created_at < p_before
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.stale_incoming_uploads(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_incoming_uploads(timestamptz, integer) to service_role;
