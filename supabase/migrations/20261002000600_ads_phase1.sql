-- Ads, phase 1: Sponsored Products reports imported (search term, campaign, Campaign Manager
-- export; more types are a mapping), stored without inventing daily rows, re-imports idempotent.

create table if not exists ads_imports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  file_name text not null,
  rows integer not null default 0,
  date_from date,
  date_to date,
  imported_at timestamptz not null default now()
);

-- A campaign under its own key: Amazon gives it a numeric ID in reports and a console ID ("A0…")
-- in the Campaign Manager export, and only the name links the two.
create table if not exists ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_id text unique,
  console_id text unique,
  name text not null,
  type text,
  targeting text,
  state text,
  budget numeric,
  start_date date,
  end_date date,
  -- The ASIN it advertises: from its name ("AD_READY: B0H9ZKYYHZ") or set by you.
  asin text,
  asin_source text check (asin_source in ('name', 'manual')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists ads_campaigns_name on ads_campaigns (lower(name));
create index if not exists ads_campaigns_asin on ads_campaigns (asin);

-- Totals over a range exactly as a report gave it; the Campaign Manager export ("grid") has no
-- range: date_from is null and date_to is the day it was exported.
create table if not exists ads_campaign_ranges (
  id uuid primary key default gen_random_uuid(),
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  source text not null check (source in ('campaign', 'grid')),
  date_from date,
  date_to date,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade
);
create unique index if not exists ads_campaign_ranges_key on ads_campaign_ranges (campaign, source, coalesce(date_from, '1900-01-01'), coalesce(date_to, '1900-01-01'));

-- Daily rows only from reports that give a day per row; never made up from ranges.
create table if not exists ads_campaign_daily (
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  date date not null,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade,
  primary key (campaign, date)
);

create table if not exists ads_search_terms (
  id uuid primary key default gen_random_uuid(),
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  ad_group_id text,
  ad_group_name text,
  term text not null,
  date_from date not null,
  date_to date not null,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade
);
create unique index if not exists ads_search_terms_key on ads_search_terms (campaign, coalesce(ad_group_id, ''), term, date_from, date_to);

-- An advertised product's economics (for break-even ACoS and profit after ads): what's set here
-- wins; blanks fall back to the app's own data (Keepa) or the ads' average sale price.
create table if not exists ads_products (
  asin text primary key,
  title text,
  price numeric,
  landed_cost numeric,
  referral_category text,
  weight_g integer,
  dims jsonb,
  fba_fee numeric,
  phase text not null default 'launch' check (phase in ('launch', 'steady')),
  updated_at timestamptz not null default now()
);

create table if not exists ads_targets (
  asin text primary key,
  target_acos_launch numeric,
  target_acos_steady numeric,
  updated_at timestamptz not null default now()
);

-- Settings: the CPC private label's ad estimate uses (£0.60, or the account's trailing CPC).
insert into ads_settings (key, value) values ('cpc', 0.60), ('cpcAuto', 1) on conflict (key) do nothing;

alter table ads_imports enable row level security;
alter table ads_campaigns enable row level security;
alter table ads_campaign_ranges enable row level security;
alter table ads_campaign_daily enable row level security;
alter table ads_search_terms enable row level security;
alter table ads_products enable row level security;
alter table ads_targets enable row level security;
revoke all on table ads_imports, ads_campaigns, ads_campaign_ranges, ads_campaign_daily, ads_search_terms, ads_products, ads_targets from anon, authenticated;
