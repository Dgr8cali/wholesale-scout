-- Ads: product-first dashboard and daily data.
-- A product's image (from Keepa, 1 token, or the app's other records).
alter table ads_products add column if not exists image text;
-- Campaigns you don't care about (old tests): hidden from the dashboard and the rules, kept in the data.
alter table ads_campaigns add column if not exists archived boolean not null default false;

-- The Placement report: one row per campaign, placement and day (or range, as exported).
create table if not exists ads_placement_daily (
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  placement text not null,
  date_from date not null,
  date_to date not null,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade,
  primary key (campaign, placement, date_from, date_to)
);
alter table ads_placement_daily enable row level security;
revoke all on table ads_placement_daily from anon, authenticated;
