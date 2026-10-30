-- Studio kao razgovor (D-116): poruke razgovora sa Sovom, po korisniku i brendu. Upis ide kroz API
-- (service role), a korisnik čita samo svoj razgovor. Objava koju je razgovor napravio ostaje i kad
-- se razgovor obriše.
alter type public.ai_generation_type add value if not exists 'studio_chat';

create table public.studio_messages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  workspace_id uuid not null references public.workspaces(id) on delete cascade deferrable initially deferred,
  user_id uuid not null references public.profiles(id) on delete cascade deferrable initially deferred,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 4000),
  action text check (action in ('reply', 'create', 'revise', 'failed')),
  post_id uuid references public.posts(id) on delete set null deferrable initially deferred,
  attachments jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index studio_messages_thread on public.studio_messages (brand_id, user_id, created_at desc);
create index studio_messages_post on public.studio_messages (post_id) where post_id is not null;

alter table public.studio_messages enable row level security;
create policy studio_messages_select_own on public.studio_messages for select to authenticated
  using (user_id = (select auth.uid()) and public.has_brand_access(brand_id));
