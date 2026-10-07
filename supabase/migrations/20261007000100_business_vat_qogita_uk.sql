-- The business is VAT registered (voluntary, standard 20%), and Qogita moved to a UK account (GBP).

-- Business-wide settings (Settings → Business): VAT registration and rate, the Qogita account's region.
create table if not exists business_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into business_settings (key, value) values
  ('vatRegistered', 'true'::jsonb), ('vatRate', '20'::jsonb), ('qogitaRegion', '"UK"'::jsonb)
on conflict (key) do nothing;
alter table business_settings enable row level security;
revoke all on business_settings from anon, authenticated;

-- Every screening profile on the business's VAT basis (the app keeps them in step from now on).
update profiles set config = jsonb_set(jsonb_set(config, '{fees,vatRegistered}', 'true'::jsonb, true), '{fees,vatRatePct}', '20'::jsonb, true)
 where config ? 'fees';

-- Qogita: one supplier per account region. The EU account's supplier keeps its offers (history),
-- now named "Qogita EU"; the UK account's prices are GBP, ex-VAT, shipping included.
alter table suppliers add column if not exists region text check (region in ('UK', 'EU'));
update suppliers set name = 'Qogita EU', region = 'EU', updated_at = now() where source_type = 'qogita' and name = 'Qogita';
insert into suppliers (name, source_type, vat_basis, vat_rate, currency, region)
values ('Qogita UK', 'qogita', 'ex_vat', 20, 'GBP', 'UK')
on conflict (name) do update set region = 'UK', currency = 'GBP', vat_basis = 'ex_vat';

-- An EU offer for a product the UK account now prices is archived (kept, left out of plans and
-- picks); and what the UK data says about an offer.
alter table offers add column if not exists archived_at timestamptz;
alter table offers add column if not exists offer_count integer;
alter table offers add column if not exists pre_order boolean;
alter table offers add column if not exists delivery_weeks numeric;
create index if not exists offers_supplier_product on offers (supplier_id, product_id) where archived_at is null;

-- "Recalculate all": every saved result's profit before the re-screen, to show what changed.
create table if not exists recalc_jobs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  basis text not null,
  run_ids uuid[] not null default '{}',
  before jsonb not null default '{}'::jsonb
);
alter table recalc_jobs enable row level security;
revoke all on recalc_jobs from anon, authenticated;
