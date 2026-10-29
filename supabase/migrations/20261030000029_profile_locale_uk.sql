-- Ukrajinski kao jezik interfejsa (D-108): profil čuva izabrani jezik aplikacije.
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale in ('sr-Latn', 'en', 'uk'));
