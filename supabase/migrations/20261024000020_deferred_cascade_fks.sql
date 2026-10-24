-- Faza 8b · brisanje korisnika i radnih prostora bez lažnih FK grešaka
--
-- Kad kaskada (auth.users → profiles → workspaces → brands → …) dva puta menja isti red, na primer
-- SET NULL za created_by i za ai_generation_id u tabeli strategies, Postgres pri drugoj izmeni ponovo
-- proverava sve strane ključeve tog reda (red je već menjan u istoj transakciji). Neki roditelj je u
-- tom trenutku već obrisan, pa brisanje naloga pada sa „violates foreign key constraint”, iako bi isti
-- red bio obrisan ili izmenjen koji trenutak kasnije (nađeno pri brisanju test korisnika sa strategijom).
--
-- Svi strani ključevi sa ON DELETE CASCADE ili SET NULL postaju DEFERRABLE INITIALLY DEFERRED:
-- kaskadne radnje ostaju trenutne (Postgres ih ne odlaže), a provera postojanja roditelja ide na
-- kraj transakcije, kad je kaskada završena. Ključevi koji namerno blokiraju brisanje (RESTRICT,
-- NO ACTION) ostaju kakvi jesu. Isto rešenje kao 018; nijedna SQL funkcija ne hvata
-- foreign_key_violation, a aplikacija mapira 23503 i kad stigne na kraju transakcije.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and c.confdeltype in ('c', 'n')
      and not c.condeferrable
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred', r.tbl, r.conname);
  end loop;
end
$$;
