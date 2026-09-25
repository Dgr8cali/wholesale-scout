-- IP-risk brands: brands known to file IP or counterfeit complaints against resellers, edited
-- on Settings → IP risk (or imported from a CSV). The compliance gate's "IP-risk brand" rule
-- matches a product's brand (or an alias); its mode applies to high-risk brands, medium and
-- low only warn. Seeded with a starter list marked "seed, unverified". Safe to re-run.

create table if not exists ip_risk_brands (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null,
  brand_key   text not null unique,   -- normalised like brand_approvals.brand_key
  aliases     text[] not null default '{}',
  level       text not null default 'medium' check (level in ('low', 'medium', 'high')),
  note        text,
  source      text,
  reported_on date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table ip_risk_brands enable row level security;

insert into category_rules (key, name, keywords, amazon_categories, note, checklist, sort)
values (
  'ipRisk', 'IP-risk brand', '{}', '{}',
  'The brand is on your IP-risk list (Settings → IP risk): it''s known to file IP or counterfeit complaints against resellers. Set to fail to drop high-risk brands; medium and low only warn.',
  array['Invoices from an authorised distributor', 'Check the brand''s reseller policy', 'Consider a letter of authorisation'],
  11
)
on conflict (key) do nothing;

insert into ip_risk_brands (brand, brand_key, aliases, level, note, source, reported_on) values
  ('Nike', 'nike', array['Nike Inc']::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Adidas', 'adidas', array['adidas Originals']::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Apple', 'apple', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Chanel', 'chanel', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Louis Vuitton', 'louisvuitton', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Gucci', 'gucci', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Rolex', 'rolex', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Michael Kors', 'michaelkors', array['MICHAEL Michael Kors']::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Pandora', 'pandora', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Burberry', 'burberry', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Ray-Ban', 'rayban', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Oakley', 'oakley', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('The North Face', 'thenorthface', array['North Face','TNF']::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('UGG', 'ugg', array['UGG Australia']::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Dyson', 'dyson', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Swarovski', 'swarovski', '{}'::text[], 'high', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Under Armour', 'underarmour', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Levi''s', 'levis', array['Levis','Levi Strauss']::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Beats', 'beats', array['Beats by Dre','Beats by Dr. Dre']::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Bose', 'bose', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('GoPro', 'gopro', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Fitbit', 'fitbit', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('JBL', 'jbl', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('OtterBox', 'otterbox', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('LEGO', 'lego', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Disney', 'disney', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Nintendo', 'nintendo', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Olaplex', 'olaplex', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Moroccanoil', 'moroccanoil', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('ghd', 'ghd', array['Good Hair Day']::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Paul Mitchell', 'paulmitchell', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Crocs', 'crocs', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('YETI', 'yeti', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Hydro Flask', 'hydroflask', array['HydroFlask']::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Casio', 'casio', array['G-Shock']::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25'),
  ('Marvel', 'marvel', '{}'::text[], 'medium', 'Named in reseller community lists as quick to file IP or counterfeit complaints. Seed, unverified: check before relying on it.', 'seed, unverified', date '2026-09-25')
on conflict (brand_key) do nothing;
