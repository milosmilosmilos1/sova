-- Inbox i DM automatizacija (D-117): poruke, komentari i recenzije sa povezanih mreža i tokovi
-- „ključna reč u komentaru → javni odgovor → privatna poruka sa linkom”. Rade iza prekidača `inbox`
-- dok Meta ne odobri dozvole za poruke i komentare. Upis ide kroz API i pozadinske poslove (service role).
create table public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade deferrable initially deferred,
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade deferrable initially deferred,
  platform public.social_platform not null,
  kind text not null check (kind in ('message', 'comment', 'review')),
  external_id text not null,
  author_external_id text,
  author_name text,
  author_handle text,
  post_external_id text,
  post_permalink text,
  post_excerpt text check (post_excerpt is null or char_length(post_excerpt) <= 300),
  rating smallint check (rating is null or rating between 1 and 5),
  preview text not null default '' check (char_length(preview) <= 300),
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  unread boolean not null default true,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, kind, external_id)
);
create index inbox_threads_list on public.inbox_threads (brand_id, kind, last_message_at desc);
create index inbox_threads_author on public.inbox_threads (social_account_id, author_external_id) where kind = 'message';

create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade deferrable initially deferred,
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  external_id text,
  direction text not null check (direction in ('in', 'out')),
  author_name text,
  body text not null check (char_length(body) <= 8000),
  sent_at timestamptz not null default now(),
  source text not null default 'sync' check (source in ('sync', 'reply', 'automation')),
  sent_by uuid references public.profiles(id) on delete set null deferrable initially deferred,
  created_at timestamptz not null default now()
);
create unique index inbox_messages_external on public.inbox_messages (thread_id, external_id);
create index inbox_messages_thread on public.inbox_messages (thread_id, sent_at);

create table public.dm_automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade deferrable initially deferred,
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade deferrable initially deferred,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  keywords text[] not null check (cardinality(keywords) between 1 and 10),
  public_replies text[] not null default '{}' check (cardinality(public_replies) <= 3),
  dm_message text not null check (char_length(dm_message) between 1 and 1000),
  link_url text check (link_url is null or (link_url ~ '^https?://' and char_length(link_url) <= 2048)),
  link_label text check (link_label is null or char_length(link_label) <= 60),
  follow_up text check (follow_up is null or char_length(follow_up) <= 1000),
  follow_up_hours smallint not null default 4 check (follow_up_hours between 1 and 23),
  active boolean not null default false,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dm_automations_brand on public.dm_automations (brand_id, created_at desc);

-- jedna osoba dobija poruku od jednog toka najviše jednom; klik ide preko /r/{click_token}
create table public.dm_contacts (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.dm_automations(id) on delete cascade deferrable initially deferred,
  brand_id uuid not null references public.brands(id) on delete cascade deferrable initially deferred,
  external_user_id text not null,
  username text,
  comment_external_id text not null,
  comment_text text check (comment_text is null or char_length(comment_text) <= 1000),
  stage text not null default 'matched' check (stage in ('matched', 'dm_sent', 'clicked', 'followed_up', 'failed')),
  click_token text not null unique,
  error text,
  dm_sent_at timestamptz,
  clicked_at timestamptz,
  followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  unique (automation_id, external_user_id)
);
create index dm_contacts_brand on public.dm_contacts (brand_id, created_at desc);
create index dm_contacts_follow_up on public.dm_contacts (dm_sent_at) where stage = 'dm_sent';

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.dm_automations enable row level security;
alter table public.dm_contacts enable row level security;
create policy inbox_threads_select on public.inbox_threads for select to authenticated
  using (public.has_brand_access(brand_id));
create policy inbox_messages_select on public.inbox_messages for select to authenticated
  using (public.has_brand_access(brand_id));
create policy dm_automations_select on public.dm_automations for select to authenticated
  using (public.has_brand_access(brand_id));
create policy dm_contacts_select on public.dm_contacts for select to authenticated
  using (public.has_brand_access(brand_id));

-- predlog odgovora u Inbox-u (1 token)
alter type public.ai_generation_type add value if not exists 'inbox_reply';
