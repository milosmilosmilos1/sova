-- Chatbot podrške (D-172): pitanja korisnika i odgovori u prozoru „Vodič i podrška”. Upis ide kroz
-- API (service role); korisnik čita samo svoje poruke, a administrator platforme sve kroz admin panel
-- (service role). Poruke starije od 90 dana briše noćni posao. Pitanja ne troše tokene, a trošak modela
-- se beleži u ai_generations kao 'support_chat'.
alter type public.ai_generation_type add value if not exists 'support_chat';

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  -- poruke jednog razgovora; razgovor nema svoj red, prvi poziv dobija nov ID
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade deferrable initially deferred,
  -- brend na kom je korisnik pitao (kontekst odgovora); brisanje brenda ne briše razgovor
  brand_id uuid references public.brands(id) on delete set null deferrable initially deferred,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 4000),
  -- odgovor: {escalate} kad pitanje traži čoveka; {escalated, ideaId} kad je razgovor poslat podršci
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index support_messages_conversation on public.support_messages (conversation_id, created_at);
create index support_messages_user_recent on public.support_messages (user_id, created_at desc);
create index support_messages_created on public.support_messages (created_at);

alter table public.support_messages enable row level security;
create policy support_messages_select_own on public.support_messages for select to authenticated
  using (user_id = (select auth.uid()));
