-- Ads: the bulk export as the primary import. One file gives campaigns (with bidding strategy),
-- placements, ad groups, product ads (what each campaign advertises), keywords, negative keywords,
-- product targeting, and search terms linked to the keyword that matched them. The entity tables
-- hold each entity's latest settings, by Amazon's ID, with its performance over the latest bulk
-- export's range.

alter table ads_campaigns add column if not exists bidding_strategy text;
alter table ads_campaigns add column if not exists portfolio_id text;
alter table ads_campaigns drop constraint if exists ads_campaigns_asin_source_check;
alter table ads_campaigns add constraint ads_campaigns_asin_source_check check (asin_source in ('name', 'manual', 'product_ad'));

alter table ads_campaign_ranges drop constraint if exists ads_campaign_ranges_source_check;
alter table ads_campaign_ranges add constraint ads_campaign_ranges_source_check check (source in ('campaign', 'grid', 'bulk'));

create table if not exists ads_placements (
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  placement text not null,
  percentage numeric,
  bidding_strategy text,
  date_from date, date_to date,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade,
  primary key (campaign, placement)
);

create table if not exists ads_ad_groups (
  ad_group_id text primary key,
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  name text,
  default_bid numeric,
  state text,
  date_from date, date_to date,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade
);

create table if not exists ads_product_ads (
  ad_id text primary key,
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  ad_group_id text not null,
  sku text,
  asin text,
  state text,
  eligibility text,
  date_from date, date_to date,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade
);
create index if not exists ads_product_ads_asin on ads_product_ads (asin);

create table if not exists ads_keywords (
  keyword_id text primary key,
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  ad_group_id text not null,
  keyword_text text not null,
  match_type text not null,
  bid numeric,
  state text,
  date_from date, date_to date,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade
);
create index if not exists ads_keywords_campaign on ads_keywords (campaign);

create table if not exists ads_negative_keywords (
  keyword_id text primary key,
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  ad_group_id text,
  keyword_text text not null,
  match_type text not null,
  state text,
  level text not null default 'ad group' check (level in ('ad group', 'campaign')),
  import_id uuid references ads_imports(id) on delete cascade
);

create table if not exists ads_product_targets (
  target_id text primary key,
  campaign uuid not null references ads_campaigns(id) on delete cascade,
  ad_group_id text not null,
  expression text,
  bid numeric,
  state text,
  date_from date, date_to date,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade
);

-- A search term with the keyword (or product targeting) that matched it; '' when the report
-- doesn't say (the CSV search term report).
alter table ads_search_terms add column if not exists keyword_id text not null default '';
alter table ads_search_terms add column if not exists keyword_text text;
alter table ads_search_terms add column if not exists match_type text;
alter table ads_search_terms drop constraint if exists ads_search_terms_key;
alter table ads_search_terms add constraint ads_search_terms_key unique (campaign, ad_group_id, keyword_id, term, date_from, date_to);

alter table ads_placements enable row level security;
alter table ads_ad_groups enable row level security;
alter table ads_product_ads enable row level security;
alter table ads_keywords enable row level security;
alter table ads_negative_keywords enable row level security;
alter table ads_product_targets enable row level security;
revoke all on table ads_placements, ads_ad_groups, ads_product_ads, ads_keywords, ads_negative_keywords, ads_product_targets from anon, authenticated;
