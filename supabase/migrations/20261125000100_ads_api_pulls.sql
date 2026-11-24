-- Amazon Ads API pulls: report requests tracked in the database, so closing the page changes nothing,
-- and API rows kept apart from manually imported ones (a `source` in each key).

-- One row per report asked of Amazon (Reporting API v3). Never two pending for the same profile, report
-- type and dates at once (the partial unique index).
create table if not exists ads_api_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null,
  report_type text not null check (report_type in ('campaigns', 'search_terms', 'targeting', 'advertised_products')),
  date_from date not null,
  date_to date not null,
  trigger text not null check (trigger in ('backfill', 'daily', 'manual')),
  amazon_report_id text,
  amazon_status text,
  status text not null default 'pending' check (status in ('pending', 'imported', 'failed')),
  failure_reason text,
  requested_at timestamptz not null default now(),
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  attempts integer not null default 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  rows_added integer,
  rows_updated integer
);
create unique index if not exists ads_api_reports_one_pending on ads_api_reports (profile_id, report_type, date_from, date_to) where status = 'pending';
create index if not exists ads_api_reports_recent on ads_api_reports (requested_at desc);
alter table ads_api_reports enable row level security;
revoke all on table ads_api_reports from anon, authenticated;

-- The connection: set when Amazon rejects the token (the schedule stops until you reconnect), and
-- when the daily pull may next be tried after a failure to ask for it.
alter table ads_connection add column if not exists needs_reconnect boolean not null default false;
alter table ads_connection add column if not exists reconnect_reason text;
alter table ads_connection add column if not exists next_daily_attempt_at timestamptz;
alter table ads_connection add column if not exists last_error text;

-- Where a row came from: 'import' (a file) or 'api'. Daily campaign rows and search terms keep one row
-- per source, so an API pull never overwrites an imported row; readers use the API's row where both
-- cover the same day (src/lib/ads/source.ts). Keywords, product targets and product ads are one row
-- per Amazon ID: the latest writer wins, and `source` says who.
alter table ads_campaign_daily add column if not exists source text not null default 'import' check (source in ('import', 'api'));
alter table ads_campaign_daily drop constraint if exists ads_campaign_daily_pkey;
alter table ads_campaign_daily add primary key (campaign, date, source);

alter table ads_search_terms add column if not exists source text not null default 'import' check (source in ('import', 'api'));
alter table ads_search_terms drop constraint if exists ads_search_terms_key;
alter table ads_search_terms add constraint ads_search_terms_key unique (campaign, ad_group_id, keyword_id, term, date_from, date_to, source);

alter table ads_keywords add column if not exists source text not null default 'import' check (source in ('import', 'api'));
alter table ads_product_targets add column if not exists source text not null default 'import' check (source in ('import', 'api'));
alter table ads_product_ads add column if not exists source text not null default 'import' check (source in ('import', 'api'));
