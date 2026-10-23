-- Faza 3 · 14/14 · Storage bucket-i i Realtime

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('brand-assets', 'brand-assets', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'font/woff2', 'font/woff', 'font/ttf']),
  ('uploads', 'uploads', false, 524288000, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime']),
  ('generated', 'generated', false, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf']),
  ('exports', 'exports', false, 1073741824, null)
on conflict (id) do nothing;

-- Putanja: ws/{workspace_id}/brand/{brand_id}/... → foldername[2] = workspace_id, foldername[4] = brand_id
create or replace function public.storage_workspace_id(p_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'ws' then nullif((storage.foldername(p_name))[2], '')::uuid
    else null
  end;
$$;

create or replace function public.storage_brand_id(p_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[3] = 'brand' then nullif((storage.foldername(p_name))[4], '')::uuid
    else null
  end;
$$;

-- Čitanje: član workspace-a sa pristupom brendu (ako je putanja na nivou brenda)
create policy storage_read_member on storage.objects for select to authenticated
  using (
    bucket_id in ('brand-assets', 'uploads', 'generated')
    and public.storage_workspace_id(name) is not null
    and public.is_workspace_member(public.storage_workspace_id(name))
    and (public.storage_brand_id(name) is null or public.has_brand_access(public.storage_brand_id(name)))
  );

-- Upload: samo u `uploads`, samo editor i više, samo u svoj workspace/brend
create policy storage_upload_editor on storage.objects for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and public.storage_workspace_id(name) is not null
    and public.can_edit(public.storage_workspace_id(name))
    and (public.storage_brand_id(name) is null or public.has_brand_access(public.storage_brand_id(name)))
  );

create policy storage_delete_editor on storage.objects for delete to authenticated
  using (
    bucket_id = 'uploads'
    and public.storage_workspace_id(name) is not null
    and public.can_edit(public.storage_workspace_id(name))
  );

-- exports: samo sopstveni fajlovi (users/{user_id}/...) ili admin workspace-a (ws/{id}/reports/...)
create policy storage_read_exports on storage.objects for select to authenticated
  using (
    bucket_id = 'exports'
    and (
      ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
      or (public.storage_workspace_id(name) is not null and public.can_admin(public.storage_workspace_id(name)))
    )
  );

-- Realtime samo za tabele statusa (D-010)
alter publication supabase_realtime add table public.ai_generations;
alter publication supabase_realtime add table public.website_crawls;
alter publication supabase_realtime add table public.post_targets;
alter publication supabase_realtime add table public.notifications;
