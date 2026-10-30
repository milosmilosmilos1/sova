-- Obaveštenja na telefonu (D-118): pretplate pregledača na Web Push, po korisniku i uređaju.
-- Upis i brisanje idu kroz API (service role); korisnik vidi samo svoje pretplate.
alter type public.notification_channel add value if not exists 'push';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade deferrable initially deferred,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
