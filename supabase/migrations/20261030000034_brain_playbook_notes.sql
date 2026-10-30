-- Brain (D-113): playbook naučen iz rezultata objava i ručni izvori (beleške) u bazi znanja.
-- Playbook piše nedeljni poziv za uvide (isti poziv, bez dodatnog troška); prompt ga koristi u
-- svakom nacrtu. Oblik: {summary, works[], avoid[], updated_at, insight_id, based_on{posts, from, to}}.
alter table public.brands add column if not exists playbook jsonb not null default '{}'::jsonb;

-- beleška je izvor bez fajla: tekst ide pravo u bazu znanja kao i PDF
alter table public.brand_documents add column if not exists kind text not null default 'pdf';
alter table public.brand_documents add column if not exists content text;
alter table public.brand_documents alter column storage_path drop not null;
alter table public.brand_documents add constraint brand_documents_kind_check check (kind in ('pdf', 'note'));
alter table public.brand_documents add constraint brand_documents_kind_shape check (
  (kind = 'pdf' and storage_path is not null)
  or (kind = 'note' and content is not null and char_length(content) between 1 and 5000)
);
