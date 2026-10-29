-- Seed: planovi, podešavanja, feature flagovi, praznici, admin allowlist.
-- Pokreće se pri `supabase db reset` i pri prvom deploy-u (workflow Migracije, include_seed). Idempotentno:
-- postojeće vrednosti koje admin menja (podešavanja, flagovi) se ne diraju, katalog planova se usklađuje.

insert into public.platform_admin_allowlist (email, note) values
  ('milos.milosevic.seo@gmail.com', 'vlasnik platforme')
on conflict (email) do nothing;

-- Ako je vlasnik već registrovan, podigni ulogu.
update public.profiles p set platform_role = 'platform_admin'
from public.platform_admin_allowlist a where p.email = a.email and p.platform_role <> 'platform_admin';

-- Cene u evrima (D-099): mesečni 47 €, godišnji 297 € (D-105), dopune 12/30/85 €. Mesečni i godišnji: 5 brendova
-- (često je isti brend na srpskom i engleskom), 10 mreža, 2 člana. Sve cene su u istoj valuti jer Stripe
-- kupcu ne dozvoljava pretplatu u jednoj, a dopunu u drugoj valuti.
insert into public.plans (code, kind, name, interval, price_cents, currency, tokens_per_period, token_period, limits, sort_order) values
  ('free', 'subscription', 'Besplatno', null, 0, 'EUR', 50, 'once',
   '{"brands": 1, "social_accounts": 2, "members": 1, "crawl_pages": 30}', 0),
  ('monthly', 'subscription', 'Mesečni', 'month', 4700, 'EUR', 500, 'month',
   '{"brands": 5, "social_accounts": 10, "members": 2, "crawl_pages": 60}', 1),
  ('yearly', 'subscription', 'Godišnji', 'year', 29700, 'EUR', 500, 'month',
   '{"brands": 5, "social_accounts": 10, "members": 2, "crawl_pages": 60}', 2),
  ('topup_100', 'topup', '100 tokena', null, 1200, 'EUR', 100, 'once', '{}', 10),
  ('topup_300', 'topup', '300 tokena', null, 3000, 'EUR', 300, 'once', '{}', 11),
  ('topup_1000', 'topup', '1.000 tokena', null, 8500, 'EUR', 1000, 'once', '{}', 12)
on conflict (code) do update set
  name = excluded.name, price_cents = excluded.price_cents, currency = excluded.currency,
  tokens_per_period = excluded.tokens_per_period, token_period = excluded.token_period,
  limits = excluded.limits, sort_order = excluded.sort_order;

-- Interni plan vlasnika platforme (D-102): nije u cenovniku (is_active = false, RLS ga ne pokazuje),
-- ne može da se kupi i dodeljuje se ručno pretplatom sa provider = 'internal' (RUNBOOK).
insert into public.plans (code, kind, name, interval, price_cents, currency, tokens_per_period, token_period, limits, is_active, sort_order) values
  ('vlasnik', 'subscription', 'Vlasnik', null, 0, 'EUR', 0, 'once',
   '{"brands": 100, "social_accounts": 100, "members": 10, "crawl_pages": 60}', false, 99)
on conflict (code) do update set
  name = excluded.name, limits = excluded.limits, is_active = false, sort_order = excluded.sort_order;

insert into public.platform_settings (key, value, description, is_public) values
  ('token_prices', '{
    "text": 2, "rewrite": 1, "translate": 1, "hashtags": 1, "repurpose": 2, "variants": 1,
    "visual_template": 2, "canva_design": 2, "canva_export": 2,
    "image_standard": 8, "image_premium": 15,
    "strategy": 20, "brand_analyze_first": 0, "brand_analyze_again": 10,
    "x_post": 1, "x_post_with_link": 6, "other_post": 0
  }', 'Cena akcija u Sova tokenima (brif 15.2, X sa linkom 6 po odluci D-013)', true),
  ('model_prices', '{
    "gemini-3.8-flash": {"input_per_m": 0.75, "output_per_m": 3.75},
    "gemini-3.6-flash": {"input_per_m": 0.75, "output_per_m": 3.75},
    "gemini-3.5-flash-lite": {"input_per_m": 0.30, "output_per_m": 2.50},
    "gemini-3.1-flash-lite": {"input_per_m": 0.25, "output_per_m": 1.50},
    "gemini-3.1-flash-image": {"input_per_m": 0.50, "output_per_m": 3.00, "per_image_1k": 0.067, "per_image_2k": 0.101, "per_image_4k": 0.151},
    "gemini-3.1-flash-lite-image": {"input_per_m": 0.25, "output_per_m": 1.50, "per_image_1k": 0.0336},
    "gemini-3-pro-image": {"input_per_m": 2.00, "output_per_m": 12.00, "per_image_1k": 0.134, "per_image_2k": 0.134, "per_image_4k": 0.24},
    "gemini-nano-banana-2.1": {"input_per_m": 1.50, "output_per_m": 7.50, "per_image_1k": 0.0336, "per_image_2k": 0.0504, "per_image_4k": 0.113},
    "gemini-embedding-2": {"input_per_m": 0.20, "output_per_m": 0}
  }', 'Cene provajdera u USD (ai.google.dev/gemini-api/docs/pricing, 23.10.2026) za obračun marže', false),
  ('allowed_models', '{
    "text": ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
    "image": ["gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1"],
    "embedding": ["gemini-embedding-2"]
  }', 'Modeli koje admin sme da izabere bez deploya', false),
  ('free_tier', '{"signup_tokens": 50, "require_verified_email": true, "block_disposable": true, "ip_soft_limit": 3}',
   'Zaštita besplatnih tokena', false),
  ('limits', '{"max_workspaces_per_user": 5, "crawl_max_pages": 60, "upload_max_image_mb": 20, "prompt_max_chars": 2000}',
   'Tvrdi limiti platforme', false),
  ('rate_limits', '{
    "generate_per_minute": 10, "generate_per_day_free": 100,
    "login_per_15min": 5, "register_per_hour_ip": 3, "crawl_per_hour_brand": 3, "approval_link_per_minute": 30
  }', 'Rate limit vrednosti (brif 17.3)', false),
  ('maintenance', '{"enabled": false, "message": ""}', 'Banner za održavanje', true),
  ('autopilot', '{"budget_warning_percent": 80, "weekly_cron_hour_local": 6, "monthly_proposal_day": 25}',
   'Podešavanja Autopilota', false),
  ('fx_usd_rates', '{"EUR": 1.1193}',
   'Kurs za preračun cena planova u USD u admin statistici, jer je trošak AI-ja u USD (ECB referentni kurs 23.10.2026, D-099)', false)
-- do nothing: admin menja ove vrednosti u aplikaciji; ponovljen seed (nov hash fajla pri db push --include-seed)
-- ne sme da ih vrati na početne (D-097)
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('platform.facebook', false, 'Objavljivanje na Facebook stranice'),
  ('platform.instagram', false, 'Instagram Business/Creator kroz Facebook Login'),
  ('platform.instagram_login', false, 'Instagram bez Facebook stranice (Instagram Login varijanta)'),
  ('platform.linkedin', false, 'LinkedIn lični profil i stranice'),
  ('platform.tiktok', false, 'TikTok Direct Post'),
  ('platform.x', false, 'X (pay-per-use)'),
  ('platform.youtube', false, 'YouTube Shorts'),
  ('platform.pinterest', false, 'Pinterest pinovi'),
  ('platform.google_business', false, 'Google Business Profile objave'),
  ('firecrawl', false, 'Firecrawl za SPA sajtove u Brand Brain-u'),
  ('canva', false, 'Canva Connect integracija'),
  ('canva_autofill', false, 'Canva Autofill (planovi sa brand template-ima)'),
  ('ai_images', false, 'AI slike kroz Gemini u Studiju; isključene radi troška, slike idu sa Unsplash-a, iz Canve i šablona (D-104)'),
  ('autopilot_level3', false, 'Pun autopilot bez odobrenja'),
  ('assisted_publishing', true, 'Asistirano objavljivanje kao fallback'),
  ('registration_open', true, 'Da li je registracija otvorena')
on conflict (key) do nothing;

-- Praznici: Srbija 2026–2027 + globalni komercijalni datumi
insert into public.holidays (country, date, name, kind) values
  ('RS', '2026-01-01', 'Nova godina', 'public'),
  ('RS', '2026-01-02', 'Nova godina (drugi dan)', 'public'),
  ('RS', '2026-01-06', 'Badnje veče', 'religious'),
  ('RS', '2026-01-07', 'Božić', 'public'),
  ('RS', '2026-01-14', 'Srpska Nova godina', 'observance'),
  ('RS', '2026-01-27', 'Sveti Sava', 'observance'),
  ('RS', '2026-02-15', 'Sretenje, Dan državnosti', 'public'),
  ('RS', '2026-02-16', 'Dan državnosti (drugi dan)', 'public'),
  ('RS', '2026-03-08', 'Dan žena', 'commercial'),
  ('RS', '2026-04-10', 'Veliki petak', 'public'),
  ('RS', '2026-04-11', 'Velika subota', 'religious'),
  ('RS', '2026-04-12', 'Vaskrs', 'public'),
  ('RS', '2026-04-13', 'Vaskršnji ponedeljak', 'public'),
  ('RS', '2026-05-01', 'Praznik rada', 'public'),
  ('RS', '2026-05-02', 'Praznik rada (drugi dan)', 'public'),
  ('RS', '2026-05-09', 'Dan pobede', 'observance'),
  ('RS', '2026-06-28', 'Vidovdan', 'observance'),
  ('RS', '2026-10-21', 'Dan sećanja na srpske žrtve u Drugom svetskom ratu', 'observance'),
  ('RS', '2026-11-11', 'Dan primirja u Prvom svetskom ratu', 'public'),
  ('RS', '2026-11-27', 'Black Friday', 'commercial'),
  ('RS', '2026-12-31', 'Doček Nove godine', 'commercial'),
  ('RS', '2027-01-01', 'Nova godina', 'public'),
  ('RS', '2027-01-02', 'Nova godina (drugi dan)', 'public'),
  ('RS', '2027-01-06', 'Badnje veče', 'religious'),
  ('RS', '2027-01-07', 'Božić', 'public'),
  ('RS', '2027-01-14', 'Srpska Nova godina', 'observance'),
  ('RS', '2027-01-27', 'Sveti Sava', 'observance'),
  ('RS', '2027-02-15', 'Sretenje, Dan državnosti', 'public'),
  ('RS', '2027-02-16', 'Dan državnosti (drugi dan)', 'public'),
  ('RS', '2027-03-08', 'Dan žena', 'commercial'),
  ('RS', '2027-04-30', 'Veliki petak', 'public'),
  ('RS', '2027-05-01', 'Praznik rada', 'public'),
  ('RS', '2027-05-02', 'Vaskrs', 'public'),
  ('RS', '2027-05-03', 'Vaskršnji ponedeljak', 'public'),
  ('RS', '2027-05-09', 'Dan pobede', 'observance'),
  ('RS', '2027-06-28', 'Vidovdan', 'observance'),
  ('RS', '2027-11-11', 'Dan primirja u Prvom svetskom ratu', 'public'),
  ('RS', '2027-11-26', 'Black Friday', 'commercial'),
  ('RS', '2027-12-31', 'Doček Nove godine', 'commercial'),
  ('GLOBAL', '2026-02-14', 'Dan zaljubljenih', 'commercial'),
  ('GLOBAL', '2026-03-08', 'Međunarodni dan žena', 'commercial'),
  ('GLOBAL', '2026-04-22', 'Dan planete Zemlje', 'observance'),
  ('GLOBAL', '2026-06-21', 'Početak leta', 'observance'),
  ('GLOBAL', '2026-09-01', 'Početak školske godine', 'commercial'),
  ('GLOBAL', '2026-10-31', 'Noć veštica', 'commercial'),
  ('GLOBAL', '2026-11-27', 'Black Friday', 'commercial'),
  ('GLOBAL', '2026-11-30', 'Cyber Monday', 'commercial'),
  ('GLOBAL', '2026-12-25', 'Katolički Božić', 'religious'),
  ('GLOBAL', '2027-02-14', 'Dan zaljubljenih', 'commercial'),
  ('GLOBAL', '2027-03-08', 'Međunarodni dan žena', 'commercial'),
  ('GLOBAL', '2027-04-22', 'Dan planete Zemlje', 'observance'),
  ('GLOBAL', '2027-10-31', 'Noć veštica', 'commercial'),
  ('GLOBAL', '2027-11-26', 'Black Friday', 'commercial'),
  ('GLOBAL', '2027-11-29', 'Cyber Monday', 'commercial'),
  ('GLOBAL', '2027-12-25', 'Katolički Božić', 'religious')
on conflict (country, date, name) do nothing;
