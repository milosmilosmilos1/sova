-- Faza 13 · ispravka: brisanje radnog prostora (ili vlasnika naloga) je padalo kad objave imaju medije.
-- Kaskada briše media_assets i post_media u istoj naredbi, ali provera stranog ključa se izvršavala
-- pre nego što kaskada stigne do post_media (redosled okidača). Odložena provera (na kraju transakcije)
-- pušta kaskadno brisanje celog radnog prostora, a direktno brisanje medija koji je u objavi i dalje pada.
alter table public.post_media
  drop constraint post_media_media_asset_id_fkey,
  add constraint post_media_media_asset_id_fkey
    foreign key (media_asset_id) references public.media_assets(id)
    on delete no action
    deferrable initially deferred;
