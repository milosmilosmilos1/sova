-- Faza 6: Brand Brain — pretraga znanja (RAG) i pomoćne funkcije.

-- Semantička pretraga chunkova jednog brenda (samo service_role; RLS za knowledge_chunks ne postoji).
create or replace function public.match_knowledge_chunks(
  p_brand_id uuid,
  p_embedding extensions.vector(1536),
  p_limit integer default 6,
  p_source_types text[] default null
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    k.id,
    k.source_type,
    k.source_id,
    k.chunk_index,
    k.content,
    k.metadata,
    1 - (k.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.knowledge_chunks k
  where k.brand_id = p_brand_id
    and (p_source_types is null or k.source_type = any (p_source_types))
  order by k.embedding operator(extensions.<=>) p_embedding
  limit greatest(1, least(coalesce(p_limit, 6), 50));
$$;

revoke all on function public.match_knowledge_chunks(uuid, extensions.vector, integer, text[]) from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, integer, text[]) to service_role;

-- Sledeća verzija profila (izbegava trku dve paralelne analize).
create or replace function public.next_brand_profile_version(p_brand_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(version), 0) + 1 from public.brand_profiles where brand_id = p_brand_id;
$$;

revoke all on function public.next_brand_profile_version(uuid) from public, anon;
grant execute on function public.next_brand_profile_version(uuid) to authenticated, service_role;

-- Brend sme da ima samo jednu aktivnu analizu u isto vreme.
create unique index if not exists website_crawls_one_active
  on public.website_crawls (brand_id)
  where status in ('queued', 'running');


-- Broj chunkova za brend kom korisnik ima pristup (knowledge_chunks nema RLS politike).
create or replace function public.brand_knowledge_count(p_brand_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.has_brand_access(p_brand_id)
    then (select count(*)::integer from public.knowledge_chunks where brand_id = p_brand_id)
    else null end;
$$;

revoke all on function public.brand_knowledge_count(uuid) from public, anon;
grant execute on function public.brand_knowledge_count(uuid) to authenticated, service_role;

