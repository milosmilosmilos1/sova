-- D-173: ukrajinski je uklonjen iz aplikacije (jezik interfejsa i jezik objava).
-- Profil i tok sa ukrajinskim (na produkciji ih nema) prelaze na engleski, pa provere više ne primaju 'uk'.
-- Objave se ne diraju: stari nacrt na ukrajinskom ostaje kakav je, a kod ga čita kao nepoznat jezik.

update public.profiles set locale = 'en' where locale = 'uk';
alter table public.profiles drop constraint profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale in ('sr-Latn', 'en'));

update public.content_flows set locale = 'en' where locale = 'uk';
alter table public.content_flows drop constraint content_flows_locale_check;
alter table public.content_flows
  add constraint content_flows_locale_check check (locale in ('sr-Latn', 'sr-Cyrl', 'en'));

update public.brands set content_locale = 'en' where content_locale = 'uk';
