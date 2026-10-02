-- Wholesale Scout schema, dumped by scripts/schema-backup.mjs. No data.
-- Dumped 2026-10-02T13:24:22.930Z. Safe to re-run. Restore: npm run schema:restore

-- @section extensions
create extension if not exists "pg_cron";
create extension if not exists "pg_net";
create extension if not exists "pg_stat_statements";
create extension if not exists "pgcrypto";
create extension if not exists "supabase_vault";
create extension if not exists "uuid-ossp";

-- @section tables
create table if not exists "ads_ad_groups" (
  "ad_group_id" text not null,
  "campaign" uuid not null,
  "name" text,
  "default_bid" numeric,
  "state" text,
  "date_from" date,
  "date_to" date,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_ad_groups" add column if not exists "ad_group_id" text;
alter table "ads_ad_groups" add column if not exists "campaign" uuid;
alter table "ads_ad_groups" add column if not exists "name" text;
alter table "ads_ad_groups" add column if not exists "default_bid" numeric;
alter table "ads_ad_groups" add column if not exists "state" text;
alter table "ads_ad_groups" add column if not exists "date_from" date;
alter table "ads_ad_groups" add column if not exists "date_to" date;
alter table "ads_ad_groups" add column if not exists "impressions" integer;
alter table "ads_ad_groups" add column if not exists "clicks" integer default 0;
alter table "ads_ad_groups" add column if not exists "cost" numeric default 0;
alter table "ads_ad_groups" add column if not exists "orders" integer default 0;
alter table "ads_ad_groups" add column if not exists "sales" numeric default 0;
alter table "ads_ad_groups" add column if not exists "units" integer;
alter table "ads_ad_groups" add column if not exists "import_id" uuid;
alter table "ads_ad_groups" enable row level security;

create table if not exists "ads_campaign_daily" (
  "campaign" uuid not null,
  "date" date not null,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_campaign_daily" add column if not exists "campaign" uuid;
alter table "ads_campaign_daily" add column if not exists "date" date;
alter table "ads_campaign_daily" add column if not exists "impressions" integer;
alter table "ads_campaign_daily" add column if not exists "clicks" integer default 0;
alter table "ads_campaign_daily" add column if not exists "cost" numeric default 0;
alter table "ads_campaign_daily" add column if not exists "orders" integer default 0;
alter table "ads_campaign_daily" add column if not exists "sales" numeric default 0;
alter table "ads_campaign_daily" add column if not exists "units" integer;
alter table "ads_campaign_daily" add column if not exists "import_id" uuid;
alter table "ads_campaign_daily" enable row level security;

create table if not exists "ads_campaign_ranges" (
  "id" uuid default gen_random_uuid() not null,
  "campaign" uuid not null,
  "source" text not null,
  "date_from" date,
  "date_to" date,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_campaign_ranges" add column if not exists "id" uuid default gen_random_uuid();
alter table "ads_campaign_ranges" add column if not exists "campaign" uuid;
alter table "ads_campaign_ranges" add column if not exists "source" text;
alter table "ads_campaign_ranges" add column if not exists "date_from" date;
alter table "ads_campaign_ranges" add column if not exists "date_to" date;
alter table "ads_campaign_ranges" add column if not exists "impressions" integer;
alter table "ads_campaign_ranges" add column if not exists "clicks" integer default 0;
alter table "ads_campaign_ranges" add column if not exists "cost" numeric default 0;
alter table "ads_campaign_ranges" add column if not exists "orders" integer default 0;
alter table "ads_campaign_ranges" add column if not exists "sales" numeric default 0;
alter table "ads_campaign_ranges" add column if not exists "units" integer;
alter table "ads_campaign_ranges" add column if not exists "import_id" uuid;
alter table "ads_campaign_ranges" enable row level security;

create table if not exists "ads_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "campaign_id" text,
  "console_id" text,
  "name" text not null,
  "type" text,
  "targeting" text,
  "state" text,
  "budget" numeric,
  "start_date" date,
  "end_date" date,
  "asin" text,
  "asin_source" text,
  "first_seen" timestamp with time zone default now() not null,
  "last_seen" timestamp with time zone default now() not null,
  "bidding_strategy" text,
  "portfolio_id" text
);
alter table "ads_campaigns" add column if not exists "id" uuid default gen_random_uuid();
alter table "ads_campaigns" add column if not exists "campaign_id" text;
alter table "ads_campaigns" add column if not exists "console_id" text;
alter table "ads_campaigns" add column if not exists "name" text;
alter table "ads_campaigns" add column if not exists "type" text;
alter table "ads_campaigns" add column if not exists "targeting" text;
alter table "ads_campaigns" add column if not exists "state" text;
alter table "ads_campaigns" add column if not exists "budget" numeric;
alter table "ads_campaigns" add column if not exists "start_date" date;
alter table "ads_campaigns" add column if not exists "end_date" date;
alter table "ads_campaigns" add column if not exists "asin" text;
alter table "ads_campaigns" add column if not exists "asin_source" text;
alter table "ads_campaigns" add column if not exists "first_seen" timestamp with time zone default now();
alter table "ads_campaigns" add column if not exists "last_seen" timestamp with time zone default now();
alter table "ads_campaigns" add column if not exists "bidding_strategy" text;
alter table "ads_campaigns" add column if not exists "portfolio_id" text;
alter table "ads_campaigns" enable row level security;

create table if not exists "ads_export_batches" (
  "id" uuid default gen_random_uuid() not null,
  "label" text not null,
  "created_at" timestamp with time zone default now() not null,
  "uploaded_at" timestamp with time zone,
  "proposals" integer default 0 not null,
  "rows" integer default 0 not null,
  "changes" jsonb default '[]'::jsonb not null
);
alter table "ads_export_batches" add column if not exists "id" uuid default gen_random_uuid();
alter table "ads_export_batches" add column if not exists "label" text;
alter table "ads_export_batches" add column if not exists "created_at" timestamp with time zone default now();
alter table "ads_export_batches" add column if not exists "uploaded_at" timestamp with time zone;
alter table "ads_export_batches" add column if not exists "proposals" integer default 0;
alter table "ads_export_batches" add column if not exists "rows" integer default 0;
alter table "ads_export_batches" add column if not exists "changes" jsonb default '[]'::jsonb;
alter table "ads_export_batches" enable row level security;

create table if not exists "ads_imports" (
  "id" uuid default gen_random_uuid() not null,
  "report_type" text not null,
  "file_name" text not null,
  "rows" integer default 0 not null,
  "date_from" date,
  "date_to" date,
  "imported_at" timestamp with time zone default now() not null
);
alter table "ads_imports" add column if not exists "id" uuid default gen_random_uuid();
alter table "ads_imports" add column if not exists "report_type" text;
alter table "ads_imports" add column if not exists "file_name" text;
alter table "ads_imports" add column if not exists "rows" integer default 0;
alter table "ads_imports" add column if not exists "date_from" date;
alter table "ads_imports" add column if not exists "date_to" date;
alter table "ads_imports" add column if not exists "imported_at" timestamp with time zone default now();
alter table "ads_imports" enable row level security;

create table if not exists "ads_keyword_ranges" (
  "keyword_id" text not null,
  "date_from" date not null,
  "date_to" date not null,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_keyword_ranges" add column if not exists "keyword_id" text;
alter table "ads_keyword_ranges" add column if not exists "date_from" date;
alter table "ads_keyword_ranges" add column if not exists "date_to" date;
alter table "ads_keyword_ranges" add column if not exists "impressions" integer;
alter table "ads_keyword_ranges" add column if not exists "clicks" integer default 0;
alter table "ads_keyword_ranges" add column if not exists "cost" numeric default 0;
alter table "ads_keyword_ranges" add column if not exists "orders" integer default 0;
alter table "ads_keyword_ranges" add column if not exists "sales" numeric default 0;
alter table "ads_keyword_ranges" add column if not exists "units" integer;
alter table "ads_keyword_ranges" add column if not exists "import_id" uuid;
alter table "ads_keyword_ranges" enable row level security;

create table if not exists "ads_keywords" (
  "keyword_id" text not null,
  "campaign" uuid not null,
  "ad_group_id" text not null,
  "keyword_text" text not null,
  "match_type" text not null,
  "bid" numeric,
  "state" text,
  "date_from" date,
  "date_to" date,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_keywords" add column if not exists "keyword_id" text;
alter table "ads_keywords" add column if not exists "campaign" uuid;
alter table "ads_keywords" add column if not exists "ad_group_id" text;
alter table "ads_keywords" add column if not exists "keyword_text" text;
alter table "ads_keywords" add column if not exists "match_type" text;
alter table "ads_keywords" add column if not exists "bid" numeric;
alter table "ads_keywords" add column if not exists "state" text;
alter table "ads_keywords" add column if not exists "date_from" date;
alter table "ads_keywords" add column if not exists "date_to" date;
alter table "ads_keywords" add column if not exists "impressions" integer;
alter table "ads_keywords" add column if not exists "clicks" integer default 0;
alter table "ads_keywords" add column if not exists "cost" numeric default 0;
alter table "ads_keywords" add column if not exists "orders" integer default 0;
alter table "ads_keywords" add column if not exists "sales" numeric default 0;
alter table "ads_keywords" add column if not exists "units" integer;
alter table "ads_keywords" add column if not exists "import_id" uuid;
alter table "ads_keywords" enable row level security;

create table if not exists "ads_negative_keywords" (
  "keyword_id" text not null,
  "campaign" uuid not null,
  "ad_group_id" text,
  "keyword_text" text not null,
  "match_type" text not null,
  "state" text,
  "level" text default 'ad group'::text not null,
  "import_id" uuid
);
alter table "ads_negative_keywords" add column if not exists "keyword_id" text;
alter table "ads_negative_keywords" add column if not exists "campaign" uuid;
alter table "ads_negative_keywords" add column if not exists "ad_group_id" text;
alter table "ads_negative_keywords" add column if not exists "keyword_text" text;
alter table "ads_negative_keywords" add column if not exists "match_type" text;
alter table "ads_negative_keywords" add column if not exists "state" text;
alter table "ads_negative_keywords" add column if not exists "level" text default 'ad group'::text;
alter table "ads_negative_keywords" add column if not exists "import_id" uuid;
alter table "ads_negative_keywords" enable row level security;

create table if not exists "ads_placements" (
  "campaign" uuid not null,
  "placement" text not null,
  "percentage" numeric,
  "bidding_strategy" text,
  "date_from" date,
  "date_to" date,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_placements" add column if not exists "campaign" uuid;
alter table "ads_placements" add column if not exists "placement" text;
alter table "ads_placements" add column if not exists "percentage" numeric;
alter table "ads_placements" add column if not exists "bidding_strategy" text;
alter table "ads_placements" add column if not exists "date_from" date;
alter table "ads_placements" add column if not exists "date_to" date;
alter table "ads_placements" add column if not exists "impressions" integer;
alter table "ads_placements" add column if not exists "clicks" integer default 0;
alter table "ads_placements" add column if not exists "cost" numeric default 0;
alter table "ads_placements" add column if not exists "orders" integer default 0;
alter table "ads_placements" add column if not exists "sales" numeric default 0;
alter table "ads_placements" add column if not exists "units" integer;
alter table "ads_placements" add column if not exists "import_id" uuid;
alter table "ads_placements" enable row level security;

create table if not exists "ads_product_ads" (
  "ad_id" text not null,
  "campaign" uuid not null,
  "ad_group_id" text not null,
  "sku" text,
  "asin" text,
  "state" text,
  "eligibility" text,
  "date_from" date,
  "date_to" date,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_product_ads" add column if not exists "ad_id" text;
alter table "ads_product_ads" add column if not exists "campaign" uuid;
alter table "ads_product_ads" add column if not exists "ad_group_id" text;
alter table "ads_product_ads" add column if not exists "sku" text;
alter table "ads_product_ads" add column if not exists "asin" text;
alter table "ads_product_ads" add column if not exists "state" text;
alter table "ads_product_ads" add column if not exists "eligibility" text;
alter table "ads_product_ads" add column if not exists "date_from" date;
alter table "ads_product_ads" add column if not exists "date_to" date;
alter table "ads_product_ads" add column if not exists "impressions" integer;
alter table "ads_product_ads" add column if not exists "clicks" integer default 0;
alter table "ads_product_ads" add column if not exists "cost" numeric default 0;
alter table "ads_product_ads" add column if not exists "orders" integer default 0;
alter table "ads_product_ads" add column if not exists "sales" numeric default 0;
alter table "ads_product_ads" add column if not exists "units" integer;
alter table "ads_product_ads" add column if not exists "import_id" uuid;
alter table "ads_product_ads" enable row level security;

create table if not exists "ads_product_targets" (
  "target_id" text not null,
  "campaign" uuid not null,
  "ad_group_id" text not null,
  "expression" text,
  "bid" numeric,
  "state" text,
  "date_from" date,
  "date_to" date,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid
);
alter table "ads_product_targets" add column if not exists "target_id" text;
alter table "ads_product_targets" add column if not exists "campaign" uuid;
alter table "ads_product_targets" add column if not exists "ad_group_id" text;
alter table "ads_product_targets" add column if not exists "expression" text;
alter table "ads_product_targets" add column if not exists "bid" numeric;
alter table "ads_product_targets" add column if not exists "state" text;
alter table "ads_product_targets" add column if not exists "date_from" date;
alter table "ads_product_targets" add column if not exists "date_to" date;
alter table "ads_product_targets" add column if not exists "impressions" integer;
alter table "ads_product_targets" add column if not exists "clicks" integer default 0;
alter table "ads_product_targets" add column if not exists "cost" numeric default 0;
alter table "ads_product_targets" add column if not exists "orders" integer default 0;
alter table "ads_product_targets" add column if not exists "sales" numeric default 0;
alter table "ads_product_targets" add column if not exists "units" integer;
alter table "ads_product_targets" add column if not exists "import_id" uuid;
alter table "ads_product_targets" enable row level security;

create table if not exists "ads_products" (
  "asin" text not null,
  "title" text,
  "price" numeric,
  "landed_cost" numeric,
  "referral_category" text,
  "weight_g" integer,
  "dims" jsonb,
  "fba_fee" numeric,
  "phase" text default 'launch'::text not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "ads_products" add column if not exists "asin" text;
alter table "ads_products" add column if not exists "title" text;
alter table "ads_products" add column if not exists "price" numeric;
alter table "ads_products" add column if not exists "landed_cost" numeric;
alter table "ads_products" add column if not exists "referral_category" text;
alter table "ads_products" add column if not exists "weight_g" integer;
alter table "ads_products" add column if not exists "dims" jsonb;
alter table "ads_products" add column if not exists "fba_fee" numeric;
alter table "ads_products" add column if not exists "phase" text default 'launch'::text;
alter table "ads_products" add column if not exists "updated_at" timestamp with time zone default now();
alter table "ads_products" enable row level security;

create table if not exists "ads_proposals" (
  "id" uuid default gen_random_uuid() not null,
  "rule" text not null,
  "entity_key" text not null,
  "asin" text,
  "campaign" uuid,
  "campaign_name" text,
  "campaign_state" text,
  "entity" jsonb not null,
  "current_value" text,
  "proposed_value" text,
  "reason" text not null,
  "confidence" text not null,
  "effect" text,
  "changes" jsonb not null,
  "grp" text,
  "clicks" integer default 0 not null,
  "orders" integer default 0 not null,
  "status" text default 'open'::text not null,
  "hold_until" timestamp with time zone,
  "batch_id" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "ads_proposals" add column if not exists "id" uuid default gen_random_uuid();
alter table "ads_proposals" add column if not exists "rule" text;
alter table "ads_proposals" add column if not exists "entity_key" text;
alter table "ads_proposals" add column if not exists "asin" text;
alter table "ads_proposals" add column if not exists "campaign" uuid;
alter table "ads_proposals" add column if not exists "campaign_name" text;
alter table "ads_proposals" add column if not exists "campaign_state" text;
alter table "ads_proposals" add column if not exists "entity" jsonb;
alter table "ads_proposals" add column if not exists "current_value" text;
alter table "ads_proposals" add column if not exists "proposed_value" text;
alter table "ads_proposals" add column if not exists "reason" text;
alter table "ads_proposals" add column if not exists "confidence" text;
alter table "ads_proposals" add column if not exists "effect" text;
alter table "ads_proposals" add column if not exists "changes" jsonb;
alter table "ads_proposals" add column if not exists "grp" text;
alter table "ads_proposals" add column if not exists "clicks" integer default 0;
alter table "ads_proposals" add column if not exists "orders" integer default 0;
alter table "ads_proposals" add column if not exists "status" text default 'open'::text;
alter table "ads_proposals" add column if not exists "hold_until" timestamp with time zone;
alter table "ads_proposals" add column if not exists "batch_id" uuid;
alter table "ads_proposals" add column if not exists "decided_at" timestamp with time zone;
alter table "ads_proposals" add column if not exists "created_at" timestamp with time zone default now();
alter table "ads_proposals" add column if not exists "updated_at" timestamp with time zone default now();
alter table "ads_proposals" enable row level security;

create table if not exists "ads_rules" (
  "rule" text not null,
  "enabled" boolean default true not null,
  "mode" text default 'propose'::text not null,
  "thresholds" jsonb default '{}'::jsonb not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "ads_rules" add column if not exists "rule" text;
alter table "ads_rules" add column if not exists "enabled" boolean default true;
alter table "ads_rules" add column if not exists "mode" text default 'propose'::text;
alter table "ads_rules" add column if not exists "thresholds" jsonb default '{}'::jsonb;
alter table "ads_rules" add column if not exists "updated_at" timestamp with time zone default now();
alter table "ads_rules" enable row level security;

create table if not exists "ads_search_terms" (
  "id" uuid default gen_random_uuid() not null,
  "campaign" uuid not null,
  "ad_group_id" text default ''::text not null,
  "ad_group_name" text,
  "term" text not null,
  "date_from" date not null,
  "date_to" date not null,
  "impressions" integer,
  "clicks" integer default 0 not null,
  "cost" numeric default 0 not null,
  "orders" integer default 0 not null,
  "sales" numeric default 0 not null,
  "units" integer,
  "import_id" uuid,
  "keyword_id" text default ''::text not null,
  "keyword_text" text,
  "match_type" text
);
alter table "ads_search_terms" add column if not exists "id" uuid default gen_random_uuid();
alter table "ads_search_terms" add column if not exists "campaign" uuid;
alter table "ads_search_terms" add column if not exists "ad_group_id" text default ''::text;
alter table "ads_search_terms" add column if not exists "ad_group_name" text;
alter table "ads_search_terms" add column if not exists "term" text;
alter table "ads_search_terms" add column if not exists "date_from" date;
alter table "ads_search_terms" add column if not exists "date_to" date;
alter table "ads_search_terms" add column if not exists "impressions" integer;
alter table "ads_search_terms" add column if not exists "clicks" integer default 0;
alter table "ads_search_terms" add column if not exists "cost" numeric default 0;
alter table "ads_search_terms" add column if not exists "orders" integer default 0;
alter table "ads_search_terms" add column if not exists "sales" numeric default 0;
alter table "ads_search_terms" add column if not exists "units" integer;
alter table "ads_search_terms" add column if not exists "import_id" uuid;
alter table "ads_search_terms" add column if not exists "keyword_id" text default ''::text;
alter table "ads_search_terms" add column if not exists "keyword_text" text;
alter table "ads_search_terms" add column if not exists "match_type" text;
alter table "ads_search_terms" enable row level security;

create table if not exists "ads_settings" (
  "key" text not null,
  "value" numeric not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "ads_settings" add column if not exists "key" text;
alter table "ads_settings" add column if not exists "value" numeric;
alter table "ads_settings" add column if not exists "updated_at" timestamp with time zone default now();
alter table "ads_settings" enable row level security;

create table if not exists "ads_targets" (
  "asin" text not null,
  "target_acos_launch" numeric,
  "target_acos_steady" numeric,
  "updated_at" timestamp with time zone default now() not null
);
alter table "ads_targets" add column if not exists "asin" text;
alter table "ads_targets" add column if not exists "target_acos_launch" numeric;
alter table "ads_targets" add column if not exists "target_acos_steady" numeric;
alter table "ads_targets" add column if not exists "updated_at" timestamp with time zone default now();
alter table "ads_targets" enable row level security;

create table if not exists "amazon_fee_estimates" (
  "asin" text not null,
  "price" numeric not null,
  "referral" numeric,
  "fba" numeric,
  "total" numeric,
  "fetched_at" timestamp with time zone default now() not null
);
alter table "amazon_fee_estimates" add column if not exists "asin" text;
alter table "amazon_fee_estimates" add column if not exists "price" numeric;
alter table "amazon_fee_estimates" add column if not exists "referral" numeric;
alter table "amazon_fee_estimates" add column if not exists "fba" numeric;
alter table "amazon_fee_estimates" add column if not exists "total" numeric;
alter table "amazon_fee_estimates" add column if not exists "fetched_at" timestamp with time zone default now();
alter table "amazon_fee_estimates" enable row level security;

create table if not exists "amazon_inventory" (
  "sku" text not null,
  "asin" text not null,
  "fulfillable" integer default 0 not null,
  "inbound" integer default 0 not null,
  "reserved" integer default 0 not null,
  "unsellable" integer default 0 not null,
  "total" integer default 0 not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "amazon_inventory" add column if not exists "sku" text;
alter table "amazon_inventory" add column if not exists "asin" text;
alter table "amazon_inventory" add column if not exists "fulfillable" integer default 0;
alter table "amazon_inventory" add column if not exists "inbound" integer default 0;
alter table "amazon_inventory" add column if not exists "reserved" integer default 0;
alter table "amazon_inventory" add column if not exists "unsellable" integer default 0;
alter table "amazon_inventory" add column if not exists "total" integer default 0;
alter table "amazon_inventory" add column if not exists "updated_at" timestamp with time zone default now();
alter table "amazon_inventory" enable row level security;

create table if not exists "amazon_sales" (
  "asin" text not null,
  "day" date not null,
  "channel" text not null,
  "units" integer default 0 not null,
  "orders" integer default 0 not null,
  "revenue" numeric default 0 not null
);
alter table "amazon_sales" add column if not exists "asin" text;
alter table "amazon_sales" add column if not exists "day" date;
alter table "amazon_sales" add column if not exists "channel" text;
alter table "amazon_sales" add column if not exists "units" integer default 0;
alter table "amazon_sales" add column if not exists "orders" integer default 0;
alter table "amazon_sales" add column if not exists "revenue" numeric default 0;
alter table "amazon_sales" enable row level security;

create table if not exists "amazon_sync" (
  "id" integer default 1 not null,
  "state" jsonb default '{"stage": "idle"}'::jsonb not null,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "error" text,
  "updated_at" timestamp with time zone default now() not null
);
alter table "amazon_sync" add column if not exists "id" integer default 1;
alter table "amazon_sync" add column if not exists "state" jsonb default '{"stage": "idle"}'::jsonb;
alter table "amazon_sync" add column if not exists "started_at" timestamp with time zone;
alter table "amazon_sync" add column if not exists "finished_at" timestamp with time zone;
alter table "amazon_sync" add column if not exists "error" text;
alter table "amazon_sync" add column if not exists "updated_at" timestamp with time zone default now();
alter table "amazon_sync" enable row level security;

create table if not exists "auth_failures" (
  "ip" text not null,
  "failures" integer default 0 not null,
  "first_at" timestamp with time zone default now() not null,
  "blocked_until" timestamp with time zone
);
alter table "auth_failures" add column if not exists "ip" text;
alter table "auth_failures" add column if not exists "failures" integer default 0;
alter table "auth_failures" add column if not exists "first_at" timestamp with time zone default now();
alter table "auth_failures" add column if not exists "blocked_until" timestamp with time zone;
alter table "auth_failures" enable row level security;

create table if not exists "brand_approvals" (
  "id" uuid default gen_random_uuid() not null,
  "brand_key" text not null,
  "brand" text not null,
  "status" text default 'not_applied'::text not null,
  "requirement" text,
  "status_date" date,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "brand_approvals" add column if not exists "id" uuid default gen_random_uuid();
alter table "brand_approvals" add column if not exists "brand_key" text;
alter table "brand_approvals" add column if not exists "brand" text;
alter table "brand_approvals" add column if not exists "status" text default 'not_applied'::text;
alter table "brand_approvals" add column if not exists "requirement" text;
alter table "brand_approvals" add column if not exists "status_date" date;
alter table "brand_approvals" add column if not exists "notes" text;
alter table "brand_approvals" add column if not exists "created_at" timestamp with time zone default now();
alter table "brand_approvals" add column if not exists "updated_at" timestamp with time zone default now();
alter table "brand_approvals" enable row level security;

create table if not exists "brand_map_state" (
  "id" integer default 1 not null,
  "profile_version" text,
  "refreshed_at" timestamp with time zone,
  "lease_until" timestamp with time zone,
  "remaining" integer default 0 not null
);
alter table "brand_map_state" add column if not exists "id" integer default 1;
alter table "brand_map_state" add column if not exists "profile_version" text;
alter table "brand_map_state" add column if not exists "refreshed_at" timestamp with time zone;
alter table "brand_map_state" add column if not exists "lease_until" timestamp with time zone;
alter table "brand_map_state" add column if not exists "remaining" integer default 0;
alter table "brand_map_state" enable row level security;

create table if not exists "brand_products" (
  "product_id" uuid not null,
  "brand_key" text not null,
  "brand" text not null,
  "ean" text not null,
  "asin" text,
  "title" text,
  "image_url" text,
  "result_id" uuid,
  "result_updated_at" timestamp with time zone,
  "profile_version" text not null,
  "verdict" text,
  "priced" boolean default false not null,
  "sell_price" numeric(10,2),
  "buy_box" numeric(10,2),
  "fba_sellers" integer,
  "amazon" boolean,
  "max_landed" numeric(10,2),
  "restriction" text,
  "apply_url" text,
  "sellers" jsonb default '[]'::jsonb not null,
  "buy_box_holder" text,
  "suppliers" text[] default '{}'::text[] not null,
  "evaluated_at" timestamp with time zone default now() not null,
  "proceeds" numeric(10,2),
  "share_month" numeric(10,2),
  "warn_gates" text[] default '{}'::text[] not null,
  "qogita" jsonb
);
alter table "brand_products" add column if not exists "product_id" uuid;
alter table "brand_products" add column if not exists "brand_key" text;
alter table "brand_products" add column if not exists "brand" text;
alter table "brand_products" add column if not exists "ean" text;
alter table "brand_products" add column if not exists "asin" text;
alter table "brand_products" add column if not exists "title" text;
alter table "brand_products" add column if not exists "image_url" text;
alter table "brand_products" add column if not exists "result_id" uuid;
alter table "brand_products" add column if not exists "result_updated_at" timestamp with time zone;
alter table "brand_products" add column if not exists "profile_version" text;
alter table "brand_products" add column if not exists "verdict" text;
alter table "brand_products" add column if not exists "priced" boolean default false;
alter table "brand_products" add column if not exists "sell_price" numeric(10,2);
alter table "brand_products" add column if not exists "buy_box" numeric(10,2);
alter table "brand_products" add column if not exists "fba_sellers" integer;
alter table "brand_products" add column if not exists "amazon" boolean;
alter table "brand_products" add column if not exists "max_landed" numeric(10,2);
alter table "brand_products" add column if not exists "restriction" text;
alter table "brand_products" add column if not exists "apply_url" text;
alter table "brand_products" add column if not exists "sellers" jsonb default '[]'::jsonb;
alter table "brand_products" add column if not exists "buy_box_holder" text;
alter table "brand_products" add column if not exists "suppliers" text[] default '{}'::text[];
alter table "brand_products" add column if not exists "evaluated_at" timestamp with time zone default now();
alter table "brand_products" add column if not exists "proceeds" numeric(10,2);
alter table "brand_products" add column if not exists "share_month" numeric(10,2);
alter table "brand_products" add column if not exists "warn_gates" text[] default '{}'::text[];
alter table "brand_products" add column if not exists "qogita" jsonb;
alter table "brand_products" enable row level security;

create table if not exists "category_rules" (
  "id" uuid default gen_random_uuid() not null,
  "key" text not null,
  "name" text not null,
  "keywords" text[] default '{}'::text[] not null,
  "amazon_categories" text[] default '{}'::text[] not null,
  "note" text,
  "checklist" text[] default '{}'::text[] not null,
  "sort" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "exclusions" text[] default '{}'::text[] not null
);
alter table "category_rules" add column if not exists "id" uuid default gen_random_uuid();
alter table "category_rules" add column if not exists "key" text;
alter table "category_rules" add column if not exists "name" text;
alter table "category_rules" add column if not exists "keywords" text[] default '{}'::text[];
alter table "category_rules" add column if not exists "amazon_categories" text[] default '{}'::text[];
alter table "category_rules" add column if not exists "note" text;
alter table "category_rules" add column if not exists "checklist" text[] default '{}'::text[];
alter table "category_rules" add column if not exists "sort" integer default 0;
alter table "category_rules" add column if not exists "created_at" timestamp with time zone default now();
alter table "category_rules" add column if not exists "updated_at" timestamp with time zone default now();
alter table "category_rules" add column if not exists "exclusions" text[] default '{}'::text[];
alter table "category_rules" enable row level security;

create table if not exists "documents" (
  "id" uuid default gen_random_uuid() not null,
  "kind" text not null,
  "doc_date" date,
  "note" text,
  "brand_keys" text[] default '{}'::text[] not null,
  "supplier_id" uuid,
  "file_name" text not null,
  "path" text not null,
  "size_bytes" bigint,
  "content_type" text,
  "uploaded" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);
alter table "documents" add column if not exists "id" uuid default gen_random_uuid();
alter table "documents" add column if not exists "kind" text;
alter table "documents" add column if not exists "doc_date" date;
alter table "documents" add column if not exists "note" text;
alter table "documents" add column if not exists "brand_keys" text[] default '{}'::text[];
alter table "documents" add column if not exists "supplier_id" uuid;
alter table "documents" add column if not exists "file_name" text;
alter table "documents" add column if not exists "path" text;
alter table "documents" add column if not exists "size_bytes" bigint;
alter table "documents" add column if not exists "content_type" text;
alter table "documents" add column if not exists "uploaded" boolean default false;
alter table "documents" add column if not exists "created_at" timestamp with time zone default now();
alter table "documents" enable row level security;

create table if not exists "favourites" (
  "id" uuid default gen_random_uuid() not null,
  "ean" text not null,
  "asin" text,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "condition" jsonb,
  "no_supplier" boolean default false not null,
  "last_check" jsonb,
  "checked_at" timestamp with time zone
);
alter table "favourites" add column if not exists "id" uuid default gen_random_uuid();
alter table "favourites" add column if not exists "ean" text;
alter table "favourites" add column if not exists "asin" text;
alter table "favourites" add column if not exists "note" text;
alter table "favourites" add column if not exists "created_at" timestamp with time zone default now();
alter table "favourites" add column if not exists "updated_at" timestamp with time zone default now();
alter table "favourites" add column if not exists "condition" jsonb;
alter table "favourites" add column if not exists "no_supplier" boolean default false;
alter table "favourites" add column if not exists "last_check" jsonb;
alter table "favourites" add column if not exists "checked_at" timestamp with time zone;
alter table "favourites" enable row level security;

create table if not exists "filter_sets" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "filters" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "filter_sets" add column if not exists "id" uuid default gen_random_uuid();
alter table "filter_sets" add column if not exists "name" text;
alter table "filter_sets" add column if not exists "filters" jsonb;
alter table "filter_sets" add column if not exists "created_at" timestamp with time zone default now();
alter table "filter_sets" add column if not exists "updated_at" timestamp with time zone default now();
alter table "filter_sets" enable row level security;

create table if not exists "gate_overrides" (
  "id" uuid default gen_random_uuid() not null,
  "ean" text not null,
  "asin" text,
  "gate" text not null,
  "reason" text,
  "created_at" timestamp with time zone default now() not null
);
alter table "gate_overrides" add column if not exists "id" uuid default gen_random_uuid();
alter table "gate_overrides" add column if not exists "ean" text;
alter table "gate_overrides" add column if not exists "asin" text;
alter table "gate_overrides" add column if not exists "gate" text;
alter table "gate_overrides" add column if not exists "reason" text;
alter table "gate_overrides" add column if not exists "created_at" timestamp with time zone default now();
alter table "gate_overrides" enable row level security;

create table if not exists "ip_risk_brands" (
  "id" uuid default gen_random_uuid() not null,
  "brand" text not null,
  "brand_key" text not null,
  "aliases" text[] default '{}'::text[] not null,
  "level" text default 'medium'::text not null,
  "note" text,
  "source" text,
  "reported_on" date,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "ip_risk_brands" add column if not exists "id" uuid default gen_random_uuid();
alter table "ip_risk_brands" add column if not exists "brand" text;
alter table "ip_risk_brands" add column if not exists "brand_key" text;
alter table "ip_risk_brands" add column if not exists "aliases" text[] default '{}'::text[];
alter table "ip_risk_brands" add column if not exists "level" text default 'medium'::text;
alter table "ip_risk_brands" add column if not exists "note" text;
alter table "ip_risk_brands" add column if not exists "source" text;
alter table "ip_risk_brands" add column if not exists "reported_on" date;
alter table "ip_risk_brands" add column if not exists "created_at" timestamp with time zone default now();
alter table "ip_risk_brands" add column if not exists "updated_at" timestamp with time zone default now();
alter table "ip_risk_brands" enable row level security;

create table if not exists "keepa_categories" (
  "id" bigint not null,
  "name" text not null,
  "products" integer,
  "fetched_at" timestamp with time zone default now() not null
);
alter table "keepa_categories" add column if not exists "id" bigint;
alter table "keepa_categories" add column if not exists "name" text;
alter table "keepa_categories" add column if not exists "products" integer;
alter table "keepa_categories" add column if not exists "fetched_at" timestamp with time zone default now();
alter table "keepa_categories" enable row level security;

create table if not exists "keepa_sellers" (
  "seller_id" text not null,
  "name" text,
  "rating_pct" integer,
  "rating_count" integer,
  "storefront_size" integer,
  "brands" jsonb default '[]'::jsonb not null,
  "fetched_at" timestamp with time zone default now() not null,
  "business_name" text,
  "buy_box_ownership_pct" integer,
  "asin_list" jsonb,
  "asin_total" integer,
  "storefront_fetched_at" timestamp with time zone,
  "storefront_unbilled_tokens" integer default 0 not null,
  "last_scan_run_id" uuid,
  "last_scan_at" timestamp with time zone
);
alter table "keepa_sellers" add column if not exists "seller_id" text;
alter table "keepa_sellers" add column if not exists "name" text;
alter table "keepa_sellers" add column if not exists "rating_pct" integer;
alter table "keepa_sellers" add column if not exists "rating_count" integer;
alter table "keepa_sellers" add column if not exists "storefront_size" integer;
alter table "keepa_sellers" add column if not exists "brands" jsonb default '[]'::jsonb;
alter table "keepa_sellers" add column if not exists "fetched_at" timestamp with time zone default now();
alter table "keepa_sellers" add column if not exists "business_name" text;
alter table "keepa_sellers" add column if not exists "buy_box_ownership_pct" integer;
alter table "keepa_sellers" add column if not exists "asin_list" jsonb;
alter table "keepa_sellers" add column if not exists "asin_total" integer;
alter table "keepa_sellers" add column if not exists "storefront_fetched_at" timestamp with time zone;
alter table "keepa_sellers" add column if not exists "storefront_unbilled_tokens" integer default 0;
alter table "keepa_sellers" add column if not exists "last_scan_run_id" uuid;
alter table "keepa_sellers" add column if not exists "last_scan_at" timestamp with time zone;
alter table "keepa_sellers" enable row level security;

create table if not exists "keepa_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "asin" text not null,
  "fetched_at" timestamp with time zone default now() not null,
  "rank_series" jsonb,
  "buybox_series" jsonb,
  "new_series" jsonb,
  "offer_count_series" jsonb,
  "amazon_series" jsonb,
  "review_count_series" jsonb,
  "summary" jsonb default '{}'::jsonb not null,
  "monthly_sold" integer,
  "keepa_rank_drops_30d" integer,
  "package" jsonb,
  "fba_fee" numeric(8,2),
  "referral_fee_pct" numeric(5,2),
  "variation_count" integer,
  "buybox_seller_history" jsonb
);
alter table "keepa_snapshots" add column if not exists "id" uuid default gen_random_uuid();
alter table "keepa_snapshots" add column if not exists "asin" text;
alter table "keepa_snapshots" add column if not exists "fetched_at" timestamp with time zone default now();
alter table "keepa_snapshots" add column if not exists "rank_series" jsonb;
alter table "keepa_snapshots" add column if not exists "buybox_series" jsonb;
alter table "keepa_snapshots" add column if not exists "new_series" jsonb;
alter table "keepa_snapshots" add column if not exists "offer_count_series" jsonb;
alter table "keepa_snapshots" add column if not exists "amazon_series" jsonb;
alter table "keepa_snapshots" add column if not exists "review_count_series" jsonb;
alter table "keepa_snapshots" add column if not exists "summary" jsonb default '{}'::jsonb;
alter table "keepa_snapshots" add column if not exists "monthly_sold" integer;
alter table "keepa_snapshots" add column if not exists "keepa_rank_drops_30d" integer;
alter table "keepa_snapshots" add column if not exists "package" jsonb;
alter table "keepa_snapshots" add column if not exists "fba_fee" numeric(8,2);
alter table "keepa_snapshots" add column if not exists "referral_fee_pct" numeric(5,2);
alter table "keepa_snapshots" add column if not exists "variation_count" integer;
alter table "keepa_snapshots" add column if not exists "buybox_seller_history" jsonb;
alter table "keepa_snapshots" enable row level security;

create table if not exists "offers" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "supplier_id" uuid not null,
  "unit_cost" numeric(12,4) not null,
  "currency" character(3) default 'GBP'::bpchar not null,
  "fx_rate" numeric(14,6) default 1 not null,
  "fx_date" date,
  "unit_cost_gbp" numeric(12,4) not null,
  "pack_units" integer default 1 not null,
  "moq" integer,
  "stock" integer,
  "title" text,
  "brand" text,
  "category" text,
  "seen_at" timestamp with time zone default now() not null,
  "source_ref" text,
  "external_ref" text,
  "cost_known" boolean default true not null,
  "manual" boolean default false not null,
  "landed_gbp" numeric(12,4),
  "vat_basis" text,
  "manual_supplier" text,
  "note" text,
  "mov_gbp" numeric(12,2)
);
alter table "offers" add column if not exists "id" uuid default gen_random_uuid();
alter table "offers" add column if not exists "product_id" uuid;
alter table "offers" add column if not exists "supplier_id" uuid;
alter table "offers" add column if not exists "unit_cost" numeric(12,4);
alter table "offers" add column if not exists "currency" character(3) default 'GBP'::bpchar;
alter table "offers" add column if not exists "fx_rate" numeric(14,6) default 1;
alter table "offers" add column if not exists "fx_date" date;
alter table "offers" add column if not exists "unit_cost_gbp" numeric(12,4);
alter table "offers" add column if not exists "pack_units" integer default 1;
alter table "offers" add column if not exists "moq" integer;
alter table "offers" add column if not exists "stock" integer;
alter table "offers" add column if not exists "title" text;
alter table "offers" add column if not exists "brand" text;
alter table "offers" add column if not exists "category" text;
alter table "offers" add column if not exists "seen_at" timestamp with time zone default now();
alter table "offers" add column if not exists "source_ref" text;
alter table "offers" add column if not exists "external_ref" text;
alter table "offers" add column if not exists "cost_known" boolean default true;
alter table "offers" add column if not exists "manual" boolean default false;
alter table "offers" add column if not exists "landed_gbp" numeric(12,4);
alter table "offers" add column if not exists "vat_basis" text;
alter table "offers" add column if not exists "manual_supplier" text;
alter table "offers" add column if not exists "note" text;
alter table "offers" add column if not exists "mov_gbp" numeric(12,2);
alter table "offers" enable row level security;

create table if not exists "pl_candidate_asins" (
  "candidate_id" uuid not null,
  "asin" text not null,
  "position" smallint not null,
  "is_reference" boolean default false not null,
  "title" text,
  "brand" text,
  "image" text,
  "price" numeric,
  "rating" numeric,
  "review_count" integer,
  "rank" integer,
  "avg_rank_90d" integer,
  "rank_drops_90d" integer,
  "bought_past_month" integer,
  "offer_count" integer,
  "buybox_price" numeric,
  "amazon_ever_seller" boolean,
  "amazon_brand" boolean,
  "dimensions" jsonb,
  "weight" integer,
  "first_seen" timestamp with time zone,
  "history" jsonb,
  "snapshot_at" timestamp with time zone
);
alter table "pl_candidate_asins" add column if not exists "candidate_id" uuid;
alter table "pl_candidate_asins" add column if not exists "asin" text;
alter table "pl_candidate_asins" add column if not exists "position" smallint;
alter table "pl_candidate_asins" add column if not exists "is_reference" boolean default false;
alter table "pl_candidate_asins" add column if not exists "title" text;
alter table "pl_candidate_asins" add column if not exists "brand" text;
alter table "pl_candidate_asins" add column if not exists "image" text;
alter table "pl_candidate_asins" add column if not exists "price" numeric;
alter table "pl_candidate_asins" add column if not exists "rating" numeric;
alter table "pl_candidate_asins" add column if not exists "review_count" integer;
alter table "pl_candidate_asins" add column if not exists "rank" integer;
alter table "pl_candidate_asins" add column if not exists "avg_rank_90d" integer;
alter table "pl_candidate_asins" add column if not exists "rank_drops_90d" integer;
alter table "pl_candidate_asins" add column if not exists "bought_past_month" integer;
alter table "pl_candidate_asins" add column if not exists "offer_count" integer;
alter table "pl_candidate_asins" add column if not exists "buybox_price" numeric;
alter table "pl_candidate_asins" add column if not exists "amazon_ever_seller" boolean;
alter table "pl_candidate_asins" add column if not exists "amazon_brand" boolean;
alter table "pl_candidate_asins" add column if not exists "dimensions" jsonb;
alter table "pl_candidate_asins" add column if not exists "weight" integer;
alter table "pl_candidate_asins" add column if not exists "first_seen" timestamp with time zone;
alter table "pl_candidate_asins" add column if not exists "history" jsonb;
alter table "pl_candidate_asins" add column if not exists "snapshot_at" timestamp with time zone;
alter table "pl_candidate_asins" enable row level security;

create table if not exists "pl_candidate_fields" (
  "candidate_id" uuid not null,
  "key" text not null,
  "value" text,
  "source" text not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "pl_candidate_fields" add column if not exists "candidate_id" uuid;
alter table "pl_candidate_fields" add column if not exists "key" text;
alter table "pl_candidate_fields" add column if not exists "value" text;
alter table "pl_candidate_fields" add column if not exists "source" text;
alter table "pl_candidate_fields" add column if not exists "updated_at" timestamp with time zone default now();
alter table "pl_candidate_fields" enable row level security;

create table if not exists "pl_candidates" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "niche_keyword" text,
  "category" text default 'Everything else'::text not null,
  "status" text default 'draft'::text not null,
  "notes" text,
  "token_cost" integer default 0 not null,
  "keepa_by_day" jsonb default '{}'::jsonb not null,
  "refreshed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "pl_candidates" add column if not exists "id" uuid default gen_random_uuid();
alter table "pl_candidates" add column if not exists "name" text;
alter table "pl_candidates" add column if not exists "niche_keyword" text;
alter table "pl_candidates" add column if not exists "category" text default 'Everything else'::text;
alter table "pl_candidates" add column if not exists "status" text default 'draft'::text;
alter table "pl_candidates" add column if not exists "notes" text;
alter table "pl_candidates" add column if not exists "token_cost" integer default 0;
alter table "pl_candidates" add column if not exists "keepa_by_day" jsonb default '{}'::jsonb;
alter table "pl_candidates" add column if not exists "refreshed_at" timestamp with time zone;
alter table "pl_candidates" add column if not exists "created_at" timestamp with time zone default now();
alter table "pl_candidates" add column if not exists "updated_at" timestamp with time zone default now();
alter table "pl_candidates" enable row level security;

create table if not exists "pl_category_tree" (
  "id" bigint not null,
  "name" text not null,
  "parent" bigint,
  "root_id" bigint not null,
  "child_ids" bigint[] default '{}'::bigint[] not null,
  "product_count" bigint,
  "fetched_at" timestamp with time zone default now() not null
);
alter table "pl_category_tree" add column if not exists "id" bigint;
alter table "pl_category_tree" add column if not exists "name" text;
alter table "pl_category_tree" add column if not exists "parent" bigint;
alter table "pl_category_tree" add column if not exists "root_id" bigint;
alter table "pl_category_tree" add column if not exists "child_ids" bigint[] default '{}'::bigint[];
alter table "pl_category_tree" add column if not exists "product_count" bigint;
alter table "pl_category_tree" add column if not exists "fetched_at" timestamp with time zone default now();
alter table "pl_category_tree" enable row level security;

create table if not exists "pl_gate_waivers" (
  "id" uuid default gen_random_uuid() not null,
  "candidate_id" uuid not null,
  "gate_id" text not null,
  "check_label" text,
  "reason" text not null,
  "created_at" timestamp with time zone default now() not null
);
alter table "pl_gate_waivers" add column if not exists "id" uuid default gen_random_uuid();
alter table "pl_gate_waivers" add column if not exists "candidate_id" uuid;
alter table "pl_gate_waivers" add column if not exists "gate_id" text;
alter table "pl_gate_waivers" add column if not exists "check_label" text;
alter table "pl_gate_waivers" add column if not exists "reason" text;
alter table "pl_gate_waivers" add column if not exists "created_at" timestamp with time zone default now();
alter table "pl_gate_waivers" enable row level security;

create table if not exists "pl_hunt_asins" (
  "asin" text not null,
  "title" text,
  "brand" text,
  "image" text,
  "root_category" text,
  "price" numeric,
  "rating" numeric,
  "review_count" integer,
  "rank" integer,
  "avg_rank_90d" integer,
  "rank_drops_90d" integer,
  "bought_past_month" integer,
  "offer_count" integer,
  "buybox_price" numeric,
  "amazon_ever_seller" boolean,
  "amazon_last_seen_days" integer,
  "amazon_brand" boolean,
  "dimensions" jsonb,
  "weight" integer,
  "first_seen" timestamp with time zone,
  "history" jsonb,
  "snapshot_at" timestamp with time zone not null,
  "leaf_category_id" bigint,
  "leaf_category" text
);
alter table "pl_hunt_asins" add column if not exists "asin" text;
alter table "pl_hunt_asins" add column if not exists "title" text;
alter table "pl_hunt_asins" add column if not exists "brand" text;
alter table "pl_hunt_asins" add column if not exists "image" text;
alter table "pl_hunt_asins" add column if not exists "root_category" text;
alter table "pl_hunt_asins" add column if not exists "price" numeric;
alter table "pl_hunt_asins" add column if not exists "rating" numeric;
alter table "pl_hunt_asins" add column if not exists "review_count" integer;
alter table "pl_hunt_asins" add column if not exists "rank" integer;
alter table "pl_hunt_asins" add column if not exists "avg_rank_90d" integer;
alter table "pl_hunt_asins" add column if not exists "rank_drops_90d" integer;
alter table "pl_hunt_asins" add column if not exists "bought_past_month" integer;
alter table "pl_hunt_asins" add column if not exists "offer_count" integer;
alter table "pl_hunt_asins" add column if not exists "buybox_price" numeric;
alter table "pl_hunt_asins" add column if not exists "amazon_ever_seller" boolean;
alter table "pl_hunt_asins" add column if not exists "amazon_last_seen_days" integer;
alter table "pl_hunt_asins" add column if not exists "amazon_brand" boolean;
alter table "pl_hunt_asins" add column if not exists "dimensions" jsonb;
alter table "pl_hunt_asins" add column if not exists "weight" integer;
alter table "pl_hunt_asins" add column if not exists "first_seen" timestamp with time zone;
alter table "pl_hunt_asins" add column if not exists "history" jsonb;
alter table "pl_hunt_asins" add column if not exists "snapshot_at" timestamp with time zone;
alter table "pl_hunt_asins" add column if not exists "leaf_category_id" bigint;
alter table "pl_hunt_asins" add column if not exists "leaf_category" text;
alter table "pl_hunt_asins" enable row level security;

create table if not exists "pl_hunt_presets" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "filters" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "pl_hunt_presets" add column if not exists "id" uuid default gen_random_uuid();
alter table "pl_hunt_presets" add column if not exists "name" text;
alter table "pl_hunt_presets" add column if not exists "filters" jsonb;
alter table "pl_hunt_presets" add column if not exists "created_at" timestamp with time zone default now();
alter table "pl_hunt_presets" add column if not exists "updated_at" timestamp with time zone default now();
alter table "pl_hunt_presets" enable row level security;

create table if not exists "pl_hunts" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "filters" jsonb not null,
  "asins" text[] default '{}'::text[] not null,
  "finder_total" integer,
  "fetched" integer default 0 not null,
  "reused" integer default 0 not null,
  "finder_tokens" integer default 0 not null,
  "detail_tokens" integer default 0 not null,
  "token_cost" integer default 0 not null,
  "keepa_by_day" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "status" text default 'done'::text not null,
  "leaves" jsonb,
  "progress" jsonb default '{}'::jsonb not null,
  "note" text,
  "lease_until" timestamp with time zone,
  "last_progress_at" timestamp with time zone,
  "finished_at" timestamp with time zone
);
alter table "pl_hunts" add column if not exists "id" uuid default gen_random_uuid();
alter table "pl_hunts" add column if not exists "name" text;
alter table "pl_hunts" add column if not exists "filters" jsonb;
alter table "pl_hunts" add column if not exists "asins" text[] default '{}'::text[];
alter table "pl_hunts" add column if not exists "finder_total" integer;
alter table "pl_hunts" add column if not exists "fetched" integer default 0;
alter table "pl_hunts" add column if not exists "reused" integer default 0;
alter table "pl_hunts" add column if not exists "finder_tokens" integer default 0;
alter table "pl_hunts" add column if not exists "detail_tokens" integer default 0;
alter table "pl_hunts" add column if not exists "token_cost" integer default 0;
alter table "pl_hunts" add column if not exists "keepa_by_day" jsonb default '{}'::jsonb;
alter table "pl_hunts" add column if not exists "created_at" timestamp with time zone default now();
alter table "pl_hunts" add column if not exists "status" text default 'done'::text;
alter table "pl_hunts" add column if not exists "leaves" jsonb;
alter table "pl_hunts" add column if not exists "progress" jsonb default '{}'::jsonb;
alter table "pl_hunts" add column if not exists "note" text;
alter table "pl_hunts" add column if not exists "lease_until" timestamp with time zone;
alter table "pl_hunts" add column if not exists "last_progress_at" timestamp with time zone;
alter table "pl_hunts" add column if not exists "finished_at" timestamp with time zone;
alter table "pl_hunts" enable row level security;

create table if not exists "pl_leaf_counts" (
  "leaf_id" bigint not null,
  "filters_key" text not null,
  "matches" integer not null,
  "asins" text[] default '{}'::text[] not null,
  "finder_tokens" integer default 0 not null,
  "counted_at" timestamp with time zone default now() not null
);
alter table "pl_leaf_counts" add column if not exists "leaf_id" bigint;
alter table "pl_leaf_counts" add column if not exists "filters_key" text;
alter table "pl_leaf_counts" add column if not exists "matches" integer;
alter table "pl_leaf_counts" add column if not exists "asins" text[] default '{}'::text[];
alter table "pl_leaf_counts" add column if not exists "finder_tokens" integer default 0;
alter table "pl_leaf_counts" add column if not exists "counted_at" timestamp with time zone default now();
alter table "pl_leaf_counts" enable row level security;

create table if not exists "pl_niche_dismissals" (
  "key" text not null,
  "name" text,
  "reason" text,
  "created_at" timestamp with time zone default now() not null
);
alter table "pl_niche_dismissals" add column if not exists "key" text;
alter table "pl_niche_dismissals" add column if not exists "name" text;
alter table "pl_niche_dismissals" add column if not exists "reason" text;
alter table "pl_niche_dismissals" add column if not exists "created_at" timestamp with time zone default now();
alter table "pl_niche_dismissals" enable row level security;

create table if not exists "pl_poe_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "candidate_id" uuid,
  "niche_id" text,
  "niche_title" text,
  "captured_at" timestamp with time zone default now() not null,
  "raw" jsonb not null,
  "search_volume_360" numeric,
  "search_volume_growth" numeric,
  "products_in_niche" integer,
  "top3_click_share" numeric,
  "search_conversion" numeric,
  "avg_units_per_product" numeric,
  "search_terms" jsonb default '[]'::jsonb not null,
  "search_conversion_source" text,
  "search_volume_growth_90" numeric,
  "search_volume_growth_360" numeric,
  "search_volume_growth_source" text
);
alter table "pl_poe_snapshots" add column if not exists "id" uuid default gen_random_uuid();
alter table "pl_poe_snapshots" add column if not exists "candidate_id" uuid;
alter table "pl_poe_snapshots" add column if not exists "niche_id" text;
alter table "pl_poe_snapshots" add column if not exists "niche_title" text;
alter table "pl_poe_snapshots" add column if not exists "captured_at" timestamp with time zone default now();
alter table "pl_poe_snapshots" add column if not exists "raw" jsonb;
alter table "pl_poe_snapshots" add column if not exists "search_volume_360" numeric;
alter table "pl_poe_snapshots" add column if not exists "search_volume_growth" numeric;
alter table "pl_poe_snapshots" add column if not exists "products_in_niche" integer;
alter table "pl_poe_snapshots" add column if not exists "top3_click_share" numeric;
alter table "pl_poe_snapshots" add column if not exists "search_conversion" numeric;
alter table "pl_poe_snapshots" add column if not exists "avg_units_per_product" numeric;
alter table "pl_poe_snapshots" add column if not exists "search_terms" jsonb default '[]'::jsonb;
alter table "pl_poe_snapshots" add column if not exists "search_conversion_source" text;
alter table "pl_poe_snapshots" add column if not exists "search_volume_growth_90" numeric;
alter table "pl_poe_snapshots" add column if not exists "search_volume_growth_360" numeric;
alter table "pl_poe_snapshots" add column if not exists "search_volume_growth_source" text;
alter table "pl_poe_snapshots" enable row level security;

create table if not exists "pl_settings" (
  "key" text not null,
  "value" numeric not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "pl_settings" add column if not exists "key" text;
alter table "pl_settings" add column if not exists "value" numeric;
alter table "pl_settings" add column if not exists "updated_at" timestamp with time zone default now();
alter table "pl_settings" enable row level security;

create table if not exists "products" (
  "id" uuid default gen_random_uuid() not null,
  "ean" text not null,
  "asin" text,
  "title" text,
  "brand" text,
  "category" text,
  "referral_category" text,
  "dims_cm" jsonb,
  "weight_g" numeric(10,1),
  "parent_asin" text,
  "variation_count" integer,
  "sales_rank" integer,
  "compliance_flags" jsonb default '[]'::jsonb not null,
  "catalog_updated_at" timestamp with time zone,
  "keepa_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "image_url" text,
  "pack_count" integer,
  "pack_attrs" jsonb,
  "amazon_dg" jsonb,
  "competitor_stock" jsonb,
  "sc_dg" jsonb,
  "dg_lookup" jsonb,
  "amazon_signals" text[]
);
alter table "products" add column if not exists "id" uuid default gen_random_uuid();
alter table "products" add column if not exists "ean" text;
alter table "products" add column if not exists "asin" text;
alter table "products" add column if not exists "title" text;
alter table "products" add column if not exists "brand" text;
alter table "products" add column if not exists "category" text;
alter table "products" add column if not exists "referral_category" text;
alter table "products" add column if not exists "dims_cm" jsonb;
alter table "products" add column if not exists "weight_g" numeric(10,1);
alter table "products" add column if not exists "parent_asin" text;
alter table "products" add column if not exists "variation_count" integer;
alter table "products" add column if not exists "sales_rank" integer;
alter table "products" add column if not exists "compliance_flags" jsonb default '[]'::jsonb;
alter table "products" add column if not exists "catalog_updated_at" timestamp with time zone;
alter table "products" add column if not exists "keepa_updated_at" timestamp with time zone;
alter table "products" add column if not exists "created_at" timestamp with time zone default now();
alter table "products" add column if not exists "updated_at" timestamp with time zone default now();
alter table "products" add column if not exists "image_url" text;
alter table "products" add column if not exists "pack_count" integer;
alter table "products" add column if not exists "pack_attrs" jsonb;
alter table "products" add column if not exists "amazon_dg" jsonb;
alter table "products" add column if not exists "competitor_stock" jsonb;
alter table "products" add column if not exists "sc_dg" jsonb;
alter table "products" add column if not exists "dg_lookup" jsonb;
alter table "products" add column if not exists "amazon_signals" text[];
alter table "products" enable row level security;

create table if not exists "profiles" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "config" jsonb not null,
  "is_default" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "profiles" add column if not exists "id" uuid default gen_random_uuid();
alter table "profiles" add column if not exists "name" text;
alter table "profiles" add column if not exists "config" jsonb;
alter table "profiles" add column if not exists "is_default" boolean default false;
alter table "profiles" add column if not exists "created_at" timestamp with time zone default now();
alter table "profiles" add column if not exists "updated_at" timestamp with time zone default now();
alter table "profiles" enable row level security;

create table if not exists "purchases" (
  "id" uuid default gen_random_uuid() not null,
  "asin" text not null,
  "ean" text,
  "product_id" uuid,
  "supplier_id" uuid,
  "supplier_name" text,
  "units" integer not null,
  "unit_cost_gbp" numeric,
  "landed_gbp" numeric not null,
  "ordered_on" date default CURRENT_DATE not null,
  "status" text default 'ordered'::text not null,
  "status_dates" jsonb default '{}'::jsonb not null,
  "note" text,
  "prediction" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "purchases" add column if not exists "id" uuid default gen_random_uuid();
alter table "purchases" add column if not exists "asin" text;
alter table "purchases" add column if not exists "ean" text;
alter table "purchases" add column if not exists "product_id" uuid;
alter table "purchases" add column if not exists "supplier_id" uuid;
alter table "purchases" add column if not exists "supplier_name" text;
alter table "purchases" add column if not exists "units" integer;
alter table "purchases" add column if not exists "unit_cost_gbp" numeric;
alter table "purchases" add column if not exists "landed_gbp" numeric;
alter table "purchases" add column if not exists "ordered_on" date default CURRENT_DATE;
alter table "purchases" add column if not exists "status" text default 'ordered'::text;
alter table "purchases" add column if not exists "status_dates" jsonb default '{}'::jsonb;
alter table "purchases" add column if not exists "note" text;
alter table "purchases" add column if not exists "prediction" jsonb;
alter table "purchases" add column if not exists "created_at" timestamp with time zone default now();
alter table "purchases" add column if not exists "updated_at" timestamp with time zone default now();
alter table "purchases" enable row level security;

create table if not exists "qogita_presets" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "filters" jsonb default '{}'::jsonb not null,
  "profile_id" uuid,
  "nightly" boolean default true not null,
  "last_prices" jsonb default '{}'::jsonb not null,
  "last_pulled_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "qogita_presets" add column if not exists "id" uuid default gen_random_uuid();
alter table "qogita_presets" add column if not exists "name" text;
alter table "qogita_presets" add column if not exists "filters" jsonb default '{}'::jsonb;
alter table "qogita_presets" add column if not exists "profile_id" uuid;
alter table "qogita_presets" add column if not exists "nightly" boolean default true;
alter table "qogita_presets" add column if not exists "last_prices" jsonb default '{}'::jsonb;
alter table "qogita_presets" add column if not exists "last_pulled_at" timestamp with time zone;
alter table "qogita_presets" add column if not exists "created_at" timestamp with time zone default now();
alter table "qogita_presets" add column if not exists "updated_at" timestamp with time zone default now();
alter table "qogita_presets" enable row level security;

create table if not exists "qogita_pulls" (
  "id" uuid default gen_random_uuid() not null,
  "preset_id" uuid,
  "run_id" uuid,
  "kind" text default 'manual'::text not null,
  "stats" jsonb default '{}'::jsonb not null,
  "error" text,
  "started_at" timestamp with time zone default now() not null,
  "finished_at" timestamp with time zone
);
alter table "qogita_pulls" add column if not exists "id" uuid default gen_random_uuid();
alter table "qogita_pulls" add column if not exists "preset_id" uuid;
alter table "qogita_pulls" add column if not exists "run_id" uuid;
alter table "qogita_pulls" add column if not exists "kind" text default 'manual'::text;
alter table "qogita_pulls" add column if not exists "stats" jsonb default '{}'::jsonb;
alter table "qogita_pulls" add column if not exists "error" text;
alter table "qogita_pulls" add column if not exists "started_at" timestamp with time zone default now();
alter table "qogita_pulls" add column if not exists "finished_at" timestamp with time zone;
alter table "qogita_pulls" enable row level security;

create table if not exists "rate_cards" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "effective_from" date not null,
  "card" jsonb not null,
  "is_active" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);
alter table "rate_cards" add column if not exists "id" uuid default gen_random_uuid();
alter table "rate_cards" add column if not exists "name" text;
alter table "rate_cards" add column if not exists "effective_from" date;
alter table "rate_cards" add column if not exists "card" jsonb;
alter table "rate_cards" add column if not exists "is_active" boolean default false;
alter table "rate_cards" add column if not exists "created_at" timestamp with time zone default now();
alter table "rate_cards" enable row level security;

create table if not exists "results" (
  "id" uuid default gen_random_uuid() not null,
  "run_id" uuid not null,
  "product_id" uuid not null,
  "offer_id" uuid,
  "offer_count" integer default 1 not null,
  "status" text default 'pending'::text not null,
  "verdict" text,
  "failed_gate" text,
  "gate_outcomes" jsonb default '[]'::jsonb not null,
  "fees" jsonb,
  "sell_price" numeric(12,2),
  "price_source" text,
  "landed_cost" numeric(12,4),
  "profit" numeric(12,2),
  "roi" numeric(8,2),
  "margin" numeric(8,2),
  "hurdle_price" numeric(12,2),
  "score" numeric(5,1),
  "group_scores" jsonb,
  "why" text,
  "band" text,
  "error" text,
  "updated_at" timestamp with time zone default now() not null,
  "inputs" jsonb,
  "sheet_offer_id" uuid,
  "cost_override" jsonb
);
alter table "results" add column if not exists "id" uuid default gen_random_uuid();
alter table "results" add column if not exists "run_id" uuid;
alter table "results" add column if not exists "product_id" uuid;
alter table "results" add column if not exists "offer_id" uuid;
alter table "results" add column if not exists "offer_count" integer default 1;
alter table "results" add column if not exists "status" text default 'pending'::text;
alter table "results" add column if not exists "verdict" text;
alter table "results" add column if not exists "failed_gate" text;
alter table "results" add column if not exists "gate_outcomes" jsonb default '[]'::jsonb;
alter table "results" add column if not exists "fees" jsonb;
alter table "results" add column if not exists "sell_price" numeric(12,2);
alter table "results" add column if not exists "price_source" text;
alter table "results" add column if not exists "landed_cost" numeric(12,4);
alter table "results" add column if not exists "profit" numeric(12,2);
alter table "results" add column if not exists "roi" numeric(8,2);
alter table "results" add column if not exists "margin" numeric(8,2);
alter table "results" add column if not exists "hurdle_price" numeric(12,2);
alter table "results" add column if not exists "score" numeric(5,1);
alter table "results" add column if not exists "group_scores" jsonb;
alter table "results" add column if not exists "why" text;
alter table "results" add column if not exists "band" text;
alter table "results" add column if not exists "error" text;
alter table "results" add column if not exists "updated_at" timestamp with time zone default now();
alter table "results" add column if not exists "inputs" jsonb;
alter table "results" add column if not exists "sheet_offer_id" uuid;
alter table "results" add column if not exists "cost_override" jsonb;
alter table "results" enable row level security;

create table if not exists "runs" (
  "id" uuid default gen_random_uuid() not null,
  "profile_id" uuid,
  "profile_snapshot" jsonb,
  "source" text not null,
  "status" text default 'pending'::text not null,
  "started_at" timestamp with time zone default now() not null,
  "finished_at" timestamp with time zone,
  "row_count" integer default 0 not null,
  "processed_count" integer default 0 not null,
  "token_cost" integer default 0 not null,
  "error" text,
  "lease_until" timestamp with time zone,
  "resume_after" timestamp with time zone,
  "last_progress_at" timestamp with time zone,
  "name" text,
  "stats" jsonb,
  "archived_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "keepa_first_at" timestamp with time zone
);
alter table "runs" add column if not exists "id" uuid default gen_random_uuid();
alter table "runs" add column if not exists "profile_id" uuid;
alter table "runs" add column if not exists "profile_snapshot" jsonb;
alter table "runs" add column if not exists "source" text;
alter table "runs" add column if not exists "status" text default 'pending'::text;
alter table "runs" add column if not exists "started_at" timestamp with time zone default now();
alter table "runs" add column if not exists "finished_at" timestamp with time zone;
alter table "runs" add column if not exists "row_count" integer default 0;
alter table "runs" add column if not exists "processed_count" integer default 0;
alter table "runs" add column if not exists "token_cost" integer default 0;
alter table "runs" add column if not exists "error" text;
alter table "runs" add column if not exists "lease_until" timestamp with time zone;
alter table "runs" add column if not exists "resume_after" timestamp with time zone;
alter table "runs" add column if not exists "last_progress_at" timestamp with time zone;
alter table "runs" add column if not exists "name" text;
alter table "runs" add column if not exists "stats" jsonb;
alter table "runs" add column if not exists "archived_at" timestamp with time zone;
alter table "runs" add column if not exists "paused_at" timestamp with time zone;
alter table "runs" add column if not exists "keepa_first_at" timestamp with time zone;
alter table "runs" enable row level security;

create table if not exists "schema_migrations" (
  "name" text not null,
  "applied_at" timestamp with time zone default now() not null
);
alter table "schema_migrations" add column if not exists "name" text;
alter table "schema_migrations" add column if not exists "applied_at" timestamp with time zone default now();
alter table "schema_migrations" enable row level security;

create table if not exists "supplier_mappings" (
  "id" uuid default gen_random_uuid() not null,
  "supplier_id" uuid not null,
  "header_fingerprint" text not null,
  "headers" jsonb default '[]'::jsonb not null,
  "mapping" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table "supplier_mappings" add column if not exists "id" uuid default gen_random_uuid();
alter table "supplier_mappings" add column if not exists "supplier_id" uuid;
alter table "supplier_mappings" add column if not exists "header_fingerprint" text;
alter table "supplier_mappings" add column if not exists "headers" jsonb default '[]'::jsonb;
alter table "supplier_mappings" add column if not exists "mapping" jsonb;
alter table "supplier_mappings" add column if not exists "created_at" timestamp with time zone default now();
alter table "supplier_mappings" add column if not exists "updated_at" timestamp with time zone default now();
alter table "supplier_mappings" enable row level security;

create table if not exists "suppliers" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "source_type" text default 'upload'::text not null,
  "vat_basis" text default 'ex_vat'::text not null,
  "vat_rate" numeric(5,2) default 20 not null,
  "currency" character(3) default 'GBP'::bpchar not null,
  "mov" numeric(12,2),
  "delivery_days" integer,
  "importer_of_record" boolean,
  "labelling" text,
  "invoice_notes" text,
  "rating" smallint,
  "gate_outcomes" jsonb default '[]'::jsonb not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "website" text,
  "contact" text,
  "payment_terms" text,
  "invoice_name_matches" boolean,
  "invoice_accepted_for_approval" boolean
);
alter table "suppliers" add column if not exists "id" uuid default gen_random_uuid();
alter table "suppliers" add column if not exists "name" text;
alter table "suppliers" add column if not exists "source_type" text default 'upload'::text;
alter table "suppliers" add column if not exists "vat_basis" text default 'ex_vat'::text;
alter table "suppliers" add column if not exists "vat_rate" numeric(5,2) default 20;
alter table "suppliers" add column if not exists "currency" character(3) default 'GBP'::bpchar;
alter table "suppliers" add column if not exists "mov" numeric(12,2);
alter table "suppliers" add column if not exists "delivery_days" integer;
alter table "suppliers" add column if not exists "importer_of_record" boolean;
alter table "suppliers" add column if not exists "labelling" text;
alter table "suppliers" add column if not exists "invoice_notes" text;
alter table "suppliers" add column if not exists "rating" smallint;
alter table "suppliers" add column if not exists "gate_outcomes" jsonb default '[]'::jsonb;
alter table "suppliers" add column if not exists "notes" text;
alter table "suppliers" add column if not exists "created_at" timestamp with time zone default now();
alter table "suppliers" add column if not exists "updated_at" timestamp with time zone default now();
alter table "suppliers" add column if not exists "website" text;
alter table "suppliers" add column if not exists "contact" text;
alter table "suppliers" add column if not exists "payment_terms" text;
alter table "suppliers" add column if not exists "invoice_name_matches" boolean;
alter table "suppliers" add column if not exists "invoice_accepted_for_approval" boolean;
alter table "suppliers" enable row level security;

create table if not exists "watch_alerts" (
  "id" uuid default gen_random_uuid() not null,
  "favourite_id" uuid,
  "ean" text not null,
  "asin" text,
  "title" text,
  "kind" text not null,
  "detail" text not null,
  "run_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "emailed_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone
);
alter table "watch_alerts" add column if not exists "id" uuid default gen_random_uuid();
alter table "watch_alerts" add column if not exists "favourite_id" uuid;
alter table "watch_alerts" add column if not exists "ean" text;
alter table "watch_alerts" add column if not exists "asin" text;
alter table "watch_alerts" add column if not exists "title" text;
alter table "watch_alerts" add column if not exists "kind" text;
alter table "watch_alerts" add column if not exists "detail" text;
alter table "watch_alerts" add column if not exists "run_id" uuid;
alter table "watch_alerts" add column if not exists "created_at" timestamp with time zone default now();
alter table "watch_alerts" add column if not exists "emailed_at" timestamp with time zone;
alter table "watch_alerts" add column if not exists "dismissed_at" timestamp with time zone;
alter table "watch_alerts" enable row level security;

create table if not exists "watchlist" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "condition" jsonb not null,
  "last_checked" timestamp with time zone,
  "status" text default 'watching'::text not null,
  "alert_channel" text default 'email'::text not null,
  "created_at" timestamp with time zone default now() not null
);
alter table "watchlist" add column if not exists "id" uuid default gen_random_uuid();
alter table "watchlist" add column if not exists "product_id" uuid;
alter table "watchlist" add column if not exists "condition" jsonb;
alter table "watchlist" add column if not exists "last_checked" timestamp with time zone;
alter table "watchlist" add column if not exists "status" text default 'watching'::text;
alter table "watchlist" add column if not exists "alert_channel" text default 'email'::text;
alter table "watchlist" add column if not exists "created_at" timestamp with time zone default now();
alter table "watchlist" enable row level security;

-- @section constraints
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_ad_groups_pkey' and conrelid = '"ads_ad_groups"'::regclass) then
    alter table "ads_ad_groups" add constraint "ads_ad_groups_pkey" PRIMARY KEY (ad_group_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_daily_pkey' and conrelid = '"ads_campaign_daily"'::regclass) then
    alter table "ads_campaign_daily" add constraint "ads_campaign_daily_pkey" PRIMARY KEY (campaign, date);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_ranges_pkey' and conrelid = '"ads_campaign_ranges"'::regclass) then
    alter table "ads_campaign_ranges" add constraint "ads_campaign_ranges_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaigns_pkey' and conrelid = '"ads_campaigns"'::regclass) then
    alter table "ads_campaigns" add constraint "ads_campaigns_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_export_batches_pkey' and conrelid = '"ads_export_batches"'::regclass) then
    alter table "ads_export_batches" add constraint "ads_export_batches_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_imports_pkey' and conrelid = '"ads_imports"'::regclass) then
    alter table "ads_imports" add constraint "ads_imports_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_keyword_ranges_pkey' and conrelid = '"ads_keyword_ranges"'::regclass) then
    alter table "ads_keyword_ranges" add constraint "ads_keyword_ranges_pkey" PRIMARY KEY (keyword_id, date_from, date_to);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_keywords_pkey' and conrelid = '"ads_keywords"'::regclass) then
    alter table "ads_keywords" add constraint "ads_keywords_pkey" PRIMARY KEY (keyword_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_negative_keywords_pkey' and conrelid = '"ads_negative_keywords"'::regclass) then
    alter table "ads_negative_keywords" add constraint "ads_negative_keywords_pkey" PRIMARY KEY (keyword_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_placements_pkey' and conrelid = '"ads_placements"'::regclass) then
    alter table "ads_placements" add constraint "ads_placements_pkey" PRIMARY KEY (campaign, placement);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_product_ads_pkey' and conrelid = '"ads_product_ads"'::regclass) then
    alter table "ads_product_ads" add constraint "ads_product_ads_pkey" PRIMARY KEY (ad_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_product_targets_pkey' and conrelid = '"ads_product_targets"'::regclass) then
    alter table "ads_product_targets" add constraint "ads_product_targets_pkey" PRIMARY KEY (target_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_products_pkey' and conrelid = '"ads_products"'::regclass) then
    alter table "ads_products" add constraint "ads_products_pkey" PRIMARY KEY (asin);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_proposals_pkey' and conrelid = '"ads_proposals"'::regclass) then
    alter table "ads_proposals" add constraint "ads_proposals_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_rules_pkey' and conrelid = '"ads_rules"'::regclass) then
    alter table "ads_rules" add constraint "ads_rules_pkey" PRIMARY KEY (rule);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_search_terms_pkey' and conrelid = '"ads_search_terms"'::regclass) then
    alter table "ads_search_terms" add constraint "ads_search_terms_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_settings_pkey' and conrelid = '"ads_settings"'::regclass) then
    alter table "ads_settings" add constraint "ads_settings_pkey" PRIMARY KEY (key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_targets_pkey' and conrelid = '"ads_targets"'::regclass) then
    alter table "ads_targets" add constraint "ads_targets_pkey" PRIMARY KEY (asin);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'amazon_fee_estimates_pkey' and conrelid = '"amazon_fee_estimates"'::regclass) then
    alter table "amazon_fee_estimates" add constraint "amazon_fee_estimates_pkey" PRIMARY KEY (asin);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'amazon_inventory_pkey' and conrelid = '"amazon_inventory"'::regclass) then
    alter table "amazon_inventory" add constraint "amazon_inventory_pkey" PRIMARY KEY (sku);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'amazon_sales_pkey' and conrelid = '"amazon_sales"'::regclass) then
    alter table "amazon_sales" add constraint "amazon_sales_pkey" PRIMARY KEY (asin, day, channel);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'amazon_sync_pkey' and conrelid = '"amazon_sync"'::regclass) then
    alter table "amazon_sync" add constraint "amazon_sync_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'auth_failures_pkey' and conrelid = '"auth_failures"'::regclass) then
    alter table "auth_failures" add constraint "auth_failures_pkey" PRIMARY KEY (ip);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_approvals_pkey' and conrelid = '"brand_approvals"'::regclass) then
    alter table "brand_approvals" add constraint "brand_approvals_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_map_state_pkey' and conrelid = '"brand_map_state"'::regclass) then
    alter table "brand_map_state" add constraint "brand_map_state_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_products_pkey' and conrelid = '"brand_products"'::regclass) then
    alter table "brand_products" add constraint "brand_products_pkey" PRIMARY KEY (product_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'category_rules_pkey' and conrelid = '"category_rules"'::regclass) then
    alter table "category_rules" add constraint "category_rules_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_pkey' and conrelid = '"documents"'::regclass) then
    alter table "documents" add constraint "documents_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'favourites_pkey' and conrelid = '"favourites"'::regclass) then
    alter table "favourites" add constraint "favourites_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'filter_sets_pkey' and conrelid = '"filter_sets"'::regclass) then
    alter table "filter_sets" add constraint "filter_sets_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gate_overrides_pkey' and conrelid = '"gate_overrides"'::regclass) then
    alter table "gate_overrides" add constraint "gate_overrides_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ip_risk_brands_pkey' and conrelid = '"ip_risk_brands"'::regclass) then
    alter table "ip_risk_brands" add constraint "ip_risk_brands_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'keepa_categories_pkey' and conrelid = '"keepa_categories"'::regclass) then
    alter table "keepa_categories" add constraint "keepa_categories_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'keepa_sellers_pkey' and conrelid = '"keepa_sellers"'::regclass) then
    alter table "keepa_sellers" add constraint "keepa_sellers_pkey" PRIMARY KEY (seller_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'keepa_snapshots_pkey' and conrelid = '"keepa_snapshots"'::regclass) then
    alter table "keepa_snapshots" add constraint "keepa_snapshots_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'offers_pkey' and conrelid = '"offers"'::regclass) then
    alter table "offers" add constraint "offers_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidate_asins_pkey' and conrelid = '"pl_candidate_asins"'::regclass) then
    alter table "pl_candidate_asins" add constraint "pl_candidate_asins_pkey" PRIMARY KEY (candidate_id, asin);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidate_fields_pkey' and conrelid = '"pl_candidate_fields"'::regclass) then
    alter table "pl_candidate_fields" add constraint "pl_candidate_fields_pkey" PRIMARY KEY (candidate_id, key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidates_pkey' and conrelid = '"pl_candidates"'::regclass) then
    alter table "pl_candidates" add constraint "pl_candidates_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_category_tree_pkey' and conrelid = '"pl_category_tree"'::regclass) then
    alter table "pl_category_tree" add constraint "pl_category_tree_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_gate_waivers_pkey' and conrelid = '"pl_gate_waivers"'::regclass) then
    alter table "pl_gate_waivers" add constraint "pl_gate_waivers_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_hunt_asins_pkey' and conrelid = '"pl_hunt_asins"'::regclass) then
    alter table "pl_hunt_asins" add constraint "pl_hunt_asins_pkey" PRIMARY KEY (asin);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_hunt_presets_pkey' and conrelid = '"pl_hunt_presets"'::regclass) then
    alter table "pl_hunt_presets" add constraint "pl_hunt_presets_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_hunts_pkey' and conrelid = '"pl_hunts"'::regclass) then
    alter table "pl_hunts" add constraint "pl_hunts_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_leaf_counts_pkey' and conrelid = '"pl_leaf_counts"'::regclass) then
    alter table "pl_leaf_counts" add constraint "pl_leaf_counts_pkey" PRIMARY KEY (leaf_id, filters_key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_niche_dismissals_pkey' and conrelid = '"pl_niche_dismissals"'::regclass) then
    alter table "pl_niche_dismissals" add constraint "pl_niche_dismissals_pkey" PRIMARY KEY (key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_poe_snapshots_pkey' and conrelid = '"pl_poe_snapshots"'::regclass) then
    alter table "pl_poe_snapshots" add constraint "pl_poe_snapshots_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_settings_pkey' and conrelid = '"pl_settings"'::regclass) then
    alter table "pl_settings" add constraint "pl_settings_pkey" PRIMARY KEY (key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_pkey' and conrelid = '"products"'::regclass) then
    alter table "products" add constraint "products_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pkey' and conrelid = '"profiles"'::regclass) then
    alter table "profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_pkey' and conrelid = '"purchases"'::regclass) then
    alter table "purchases" add constraint "purchases_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_presets_pkey' and conrelid = '"qogita_presets"'::regclass) then
    alter table "qogita_presets" add constraint "qogita_presets_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_pulls_pkey' and conrelid = '"qogita_pulls"'::regclass) then
    alter table "qogita_pulls" add constraint "qogita_pulls_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rate_cards_pkey' and conrelid = '"rate_cards"'::regclass) then
    alter table "rate_cards" add constraint "rate_cards_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_pkey' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'runs_pkey' and conrelid = '"runs"'::regclass) then
    alter table "runs" add constraint "runs_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schema_migrations_pkey' and conrelid = '"schema_migrations"'::regclass) then
    alter table "schema_migrations" add constraint "schema_migrations_pkey" PRIMARY KEY (name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_mappings_pkey' and conrelid = '"supplier_mappings"'::regclass) then
    alter table "supplier_mappings" add constraint "supplier_mappings_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_pkey' and conrelid = '"suppliers"'::regclass) then
    alter table "suppliers" add constraint "suppliers_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watch_alerts_pkey' and conrelid = '"watch_alerts"'::regclass) then
    alter table "watch_alerts" add constraint "watch_alerts_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watchlist_pkey' and conrelid = '"watchlist"'::regclass) then
    alter table "watchlist" add constraint "watchlist_pkey" PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_ranges_key' and conrelid = '"ads_campaign_ranges"'::regclass) then
    alter table "ads_campaign_ranges" add constraint "ads_campaign_ranges_key" UNIQUE NULLS NOT DISTINCT (campaign, source, date_from, date_to);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaigns_campaign_id_key' and conrelid = '"ads_campaigns"'::regclass) then
    alter table "ads_campaigns" add constraint "ads_campaigns_campaign_id_key" UNIQUE (campaign_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaigns_console_id_key' and conrelid = '"ads_campaigns"'::regclass) then
    alter table "ads_campaigns" add constraint "ads_campaigns_console_id_key" UNIQUE (console_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_search_terms_key' and conrelid = '"ads_search_terms"'::regclass) then
    alter table "ads_search_terms" add constraint "ads_search_terms_key" UNIQUE (campaign, ad_group_id, keyword_id, term, date_from, date_to);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_approvals_brand_key_key' and conrelid = '"brand_approvals"'::regclass) then
    alter table "brand_approvals" add constraint "brand_approvals_brand_key_key" UNIQUE (brand_key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'category_rules_key_key' and conrelid = '"category_rules"'::regclass) then
    alter table "category_rules" add constraint "category_rules_key_key" UNIQUE (key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_path_key' and conrelid = '"documents"'::regclass) then
    alter table "documents" add constraint "documents_path_key" UNIQUE (path);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'filter_sets_name_key' and conrelid = '"filter_sets"'::regclass) then
    alter table "filter_sets" add constraint "filter_sets_name_key" UNIQUE (name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ip_risk_brands_brand_key_key' and conrelid = '"ip_risk_brands"'::regclass) then
    alter table "ip_risk_brands" add constraint "ip_risk_brands_brand_key_key" UNIQUE (brand_key);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_hunt_presets_name_key' and conrelid = '"pl_hunt_presets"'::regclass) then
    alter table "pl_hunt_presets" add constraint "pl_hunt_presets_name_key" UNIQUE (name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_key' and conrelid = '"profiles"'::regclass) then
    alter table "profiles" add constraint "profiles_name_key" UNIQUE (name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_presets_name_key' and conrelid = '"qogita_presets"'::regclass) then
    alter table "qogita_presets" add constraint "qogita_presets_name_key" UNIQUE (name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_run_id_product_id_key' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_run_id_product_id_key" UNIQUE (run_id, product_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_mappings_supplier_id_header_fingerprint_key' and conrelid = '"supplier_mappings"'::regclass) then
    alter table "supplier_mappings" add constraint "supplier_mappings_supplier_id_header_fingerprint_key" UNIQUE (supplier_id, header_fingerprint);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_name_key' and conrelid = '"suppliers"'::regclass) then
    alter table "suppliers" add constraint "suppliers_name_key" UNIQUE (name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_ranges_source_check' and conrelid = '"ads_campaign_ranges"'::regclass) then
    alter table "ads_campaign_ranges" add constraint "ads_campaign_ranges_source_check" CHECK ((source = ANY (ARRAY['campaign'::text, 'grid'::text, 'bulk'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaigns_asin_source_check' and conrelid = '"ads_campaigns"'::regclass) then
    alter table "ads_campaigns" add constraint "ads_campaigns_asin_source_check" CHECK ((asin_source = ANY (ARRAY['name'::text, 'manual'::text, 'product_ad'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_negative_keywords_level_check' and conrelid = '"ads_negative_keywords"'::regclass) then
    alter table "ads_negative_keywords" add constraint "ads_negative_keywords_level_check" CHECK ((level = ANY (ARRAY['ad group'::text, 'campaign'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_products_phase_check' and conrelid = '"ads_products"'::regclass) then
    alter table "ads_products" add constraint "ads_products_phase_check" CHECK ((phase = ANY (ARRAY['launch'::text, 'steady'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_proposals_confidence_check' and conrelid = '"ads_proposals"'::regclass) then
    alter table "ads_proposals" add constraint "ads_proposals_confidence_check" CHECK ((confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_proposals_status_check' and conrelid = '"ads_proposals"'::regclass) then
    alter table "ads_proposals" add constraint "ads_proposals_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'approved'::text, 'skipped'::text, 'snoozed'::text, 'exported'::text, 'uploaded'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_rules_mode_check' and conrelid = '"ads_rules"'::regclass) then
    alter table "ads_rules" add constraint "ads_rules_mode_check" CHECK ((mode = ANY (ARRAY['propose'::text, 'auto'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'amazon_sync_id_check' and conrelid = '"amazon_sync"'::regclass) then
    alter table "amazon_sync" add constraint "amazon_sync_id_check" CHECK ((id = 1));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_approvals_status_check' and conrelid = '"brand_approvals"'::regclass) then
    alter table "brand_approvals" add constraint "brand_approvals_status_check" CHECK ((status = ANY (ARRAY['not_applied'::text, 'applied'::text, 'approved'::text, 'refused'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_map_state_id_check' and conrelid = '"brand_map_state"'::regclass) then
    alter table "brand_map_state" add constraint "brand_map_state_id_check" CHECK ((id = 1));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_kind_check' and conrelid = '"documents"'::regclass) then
    alter table "documents" add constraint "documents_kind_check" CHECK ((kind = ANY (ARRAY['invoice'::text, 'sds'::text, 'brand_letter'::text, 'other'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ip_risk_brands_level_check' and conrelid = '"ip_risk_brands"'::regclass) then
    alter table "ip_risk_brands" add constraint "ip_risk_brands_level_check" CHECK ((level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'offers_vat_basis_check' and conrelid = '"offers"'::regclass) then
    alter table "offers" add constraint "offers_vat_basis_check" CHECK ((vat_basis = ANY (ARRAY['ex_vat'::text, 'inc_vat'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidate_asins_position_check' and conrelid = '"pl_candidate_asins"'::regclass) then
    alter table "pl_candidate_asins" add constraint "pl_candidate_asins_position_check" CHECK ((("position" >= 1) AND ("position" <= 10)));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidate_fields_source_check' and conrelid = '"pl_candidate_fields"'::regclass) then
    alter table "pl_candidate_fields" add constraint "pl_candidate_fields_source_check" CHECK ((source = ANY (ARRAY['keepa'::text, 'poe'::text, 'poe_derived'::text, 'manual'::text, 'fees'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidates_status_check' and conrelid = '"pl_candidates"'::regclass) then
    alter table "pl_candidates" add constraint "pl_candidates_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'researching'::text, 'samples'::text, 'dropped'::text, 'launched'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_gate_waivers_gate_id_check' and conrelid = '"pl_gate_waivers"'::regclass) then
    alter table "pl_gate_waivers" add constraint "pl_gate_waivers_gate_id_check" CHECK ((gate_id = ANY (ARRAY['g0'::text, 'g1'::text, 'g2'::text, 'g3'::text, 'g4'::text, 'g5'::text, 'g6'::text, 'g7'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_gate_waivers_reason_check' and conrelid = '"pl_gate_waivers"'::regclass) then
    alter table "pl_gate_waivers" add constraint "pl_gate_waivers_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_hunts_status_check' and conrelid = '"pl_hunts"'::regclass) then
    alter table "pl_hunts" add constraint "pl_hunts_status_check" CHECK ((status = ANY (ARRAY['listing'::text, 'sizing'::text, 'detailing'::text, 'done'::text, 'error'::text, 'cancelled'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_poe_snapshots_search_conversion_source_check' and conrelid = '"pl_poe_snapshots"'::regclass) then
    alter table "pl_poe_snapshots" add constraint "pl_poe_snapshots_search_conversion_source_check" CHECK ((search_conversion_source = ANY (ARRAY['niche'::text, 'trends'::text, 'terms'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_poe_snapshots_search_volume_growth_source_check' and conrelid = '"pl_poe_snapshots"'::regclass) then
    alter table "pl_poe_snapshots" add constraint "pl_poe_snapshots_search_volume_growth_source_check" CHECK ((search_volume_growth_source = ANY (ARRAY['t180'::text, 't90'::text, 'trends'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_landed_gbp_check' and conrelid = '"purchases"'::regclass) then
    alter table "purchases" add constraint "purchases_landed_gbp_check" CHECK ((landed_gbp >= (0)::numeric));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_status_check' and conrelid = '"purchases"'::regclass) then
    alter table "purchases" add constraint "purchases_status_check" CHECK ((status = ANY (ARRAY['ordered'::text, 'received'::text, 'sent'::text, 'live'::text, 'closed'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_units_check' and conrelid = '"purchases"'::regclass) then
    alter table "purchases" add constraint "purchases_units_check" CHECK ((units > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_pulls_kind_check' and conrelid = '"qogita_pulls"'::regclass) then
    alter table "qogita_pulls" add constraint "qogita_pulls_kind_check" CHECK ((kind = ANY (ARRAY['manual'::text, 'nightly'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_band_check' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_band_check" CHECK ((band = ANY (ARRAY['green'::text, 'amber'::text, 'grey'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_status_check' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'error'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_verdict_check' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_verdict_check" CHECK ((verdict = ANY (ARRAY['pass'::text, 'warn'::text, 'fail'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'runs_status_check' and conrelid = '"runs"'::regclass) then
    alter table "runs" add constraint "runs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_labelling_check' and conrelid = '"suppliers"'::regclass) then
    alter table "suppliers" add constraint "suppliers_labelling_check" CHECK ((labelling = ANY (ARRAY['UK'::text, 'EU'::text, 'mixed'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_rating_check' and conrelid = '"suppliers"'::regclass) then
    alter table "suppliers" add constraint "suppliers_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_source_type_check' and conrelid = '"suppliers"'::regclass) then
    alter table "suppliers" add constraint "suppliers_source_type_check" CHECK ((source_type = ANY (ARRAY['upload'::text, 'qogita'::text, 'manual'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_vat_basis_check' and conrelid = '"suppliers"'::regclass) then
    alter table "suppliers" add constraint "suppliers_vat_basis_check" CHECK ((vat_basis = ANY (ARRAY['ex_vat'::text, 'inc_vat'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watch_alerts_kind_check' and conrelid = '"watch_alerts"'::regclass) then
    alter table "watch_alerts" add constraint "watch_alerts_kind_check" CHECK ((kind = ANY (ARRAY['passes'::text, 'condition'::text, 'supplier'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watchlist_status_check' and conrelid = '"watchlist"'::regclass) then
    alter table "watchlist" add constraint "watchlist_status_check" CHECK ((status = ANY (ARRAY['watching'::text, 'now_passes'::text, 'dismissed'::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_ad_groups_campaign_fkey' and conrelid = '"ads_ad_groups"'::regclass) then
    alter table "ads_ad_groups" add constraint "ads_ad_groups_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_ad_groups_import_id_fkey' and conrelid = '"ads_ad_groups"'::regclass) then
    alter table "ads_ad_groups" add constraint "ads_ad_groups_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_daily_campaign_fkey' and conrelid = '"ads_campaign_daily"'::regclass) then
    alter table "ads_campaign_daily" add constraint "ads_campaign_daily_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_daily_import_id_fkey' and conrelid = '"ads_campaign_daily"'::regclass) then
    alter table "ads_campaign_daily" add constraint "ads_campaign_daily_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_ranges_campaign_fkey' and conrelid = '"ads_campaign_ranges"'::regclass) then
    alter table "ads_campaign_ranges" add constraint "ads_campaign_ranges_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_campaign_ranges_import_id_fkey' and conrelid = '"ads_campaign_ranges"'::regclass) then
    alter table "ads_campaign_ranges" add constraint "ads_campaign_ranges_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_keyword_ranges_import_id_fkey' and conrelid = '"ads_keyword_ranges"'::regclass) then
    alter table "ads_keyword_ranges" add constraint "ads_keyword_ranges_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_keywords_campaign_fkey' and conrelid = '"ads_keywords"'::regclass) then
    alter table "ads_keywords" add constraint "ads_keywords_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_keywords_import_id_fkey' and conrelid = '"ads_keywords"'::regclass) then
    alter table "ads_keywords" add constraint "ads_keywords_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_negative_keywords_campaign_fkey' and conrelid = '"ads_negative_keywords"'::regclass) then
    alter table "ads_negative_keywords" add constraint "ads_negative_keywords_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_negative_keywords_import_id_fkey' and conrelid = '"ads_negative_keywords"'::regclass) then
    alter table "ads_negative_keywords" add constraint "ads_negative_keywords_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_placements_campaign_fkey' and conrelid = '"ads_placements"'::regclass) then
    alter table "ads_placements" add constraint "ads_placements_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_placements_import_id_fkey' and conrelid = '"ads_placements"'::regclass) then
    alter table "ads_placements" add constraint "ads_placements_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_product_ads_campaign_fkey' and conrelid = '"ads_product_ads"'::regclass) then
    alter table "ads_product_ads" add constraint "ads_product_ads_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_product_ads_import_id_fkey' and conrelid = '"ads_product_ads"'::regclass) then
    alter table "ads_product_ads" add constraint "ads_product_ads_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_product_targets_campaign_fkey' and conrelid = '"ads_product_targets"'::regclass) then
    alter table "ads_product_targets" add constraint "ads_product_targets_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_product_targets_import_id_fkey' and conrelid = '"ads_product_targets"'::regclass) then
    alter table "ads_product_targets" add constraint "ads_product_targets_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_proposals_batch_id_fkey' and conrelid = '"ads_proposals"'::regclass) then
    alter table "ads_proposals" add constraint "ads_proposals_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES ads_export_batches(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_proposals_campaign_fkey' and conrelid = '"ads_proposals"'::regclass) then
    alter table "ads_proposals" add constraint "ads_proposals_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_search_terms_campaign_fkey' and conrelid = '"ads_search_terms"'::regclass) then
    alter table "ads_search_terms" add constraint "ads_search_terms_campaign_fkey" FOREIGN KEY (campaign) REFERENCES ads_campaigns(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_search_terms_import_id_fkey' and conrelid = '"ads_search_terms"'::regclass) then
    alter table "ads_search_terms" add constraint "ads_search_terms_import_id_fkey" FOREIGN KEY (import_id) REFERENCES ads_imports(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_products_product_id_fkey' and conrelid = '"brand_products"'::regclass) then
    alter table "brand_products" add constraint "brand_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_supplier_id_fkey' and conrelid = '"documents"'::regclass) then
    alter table "documents" add constraint "documents_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'keepa_sellers_last_scan_run_id_fkey' and conrelid = '"keepa_sellers"'::regclass) then
    alter table "keepa_sellers" add constraint "keepa_sellers_last_scan_run_id_fkey" FOREIGN KEY (last_scan_run_id) REFERENCES runs(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'offers_product_id_fkey' and conrelid = '"offers"'::regclass) then
    alter table "offers" add constraint "offers_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'offers_supplier_id_fkey' and conrelid = '"offers"'::regclass) then
    alter table "offers" add constraint "offers_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidate_asins_candidate_id_fkey' and conrelid = '"pl_candidate_asins"'::regclass) then
    alter table "pl_candidate_asins" add constraint "pl_candidate_asins_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES pl_candidates(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_candidate_fields_candidate_id_fkey' and conrelid = '"pl_candidate_fields"'::regclass) then
    alter table "pl_candidate_fields" add constraint "pl_candidate_fields_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES pl_candidates(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_gate_waivers_candidate_id_fkey' and conrelid = '"pl_gate_waivers"'::regclass) then
    alter table "pl_gate_waivers" add constraint "pl_gate_waivers_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES pl_candidates(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pl_poe_snapshots_candidate_id_fkey' and conrelid = '"pl_poe_snapshots"'::regclass) then
    alter table "pl_poe_snapshots" add constraint "pl_poe_snapshots_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES pl_candidates(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_product_id_fkey' and conrelid = '"purchases"'::regclass) then
    alter table "purchases" add constraint "purchases_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_supplier_id_fkey' and conrelid = '"purchases"'::regclass) then
    alter table "purchases" add constraint "purchases_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_presets_profile_id_fkey' and conrelid = '"qogita_presets"'::regclass) then
    alter table "qogita_presets" add constraint "qogita_presets_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_pulls_preset_id_fkey' and conrelid = '"qogita_pulls"'::regclass) then
    alter table "qogita_pulls" add constraint "qogita_pulls_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES qogita_presets(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qogita_pulls_run_id_fkey' and conrelid = '"qogita_pulls"'::regclass) then
    alter table "qogita_pulls" add constraint "qogita_pulls_run_id_fkey" FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_offer_id_fkey' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_offer_id_fkey" FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_product_id_fkey' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'results_run_id_fkey' and conrelid = '"results"'::regclass) then
    alter table "results" add constraint "results_run_id_fkey" FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'runs_profile_id_fkey' and conrelid = '"runs"'::regclass) then
    alter table "runs" add constraint "runs_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_mappings_supplier_id_fkey' and conrelid = '"supplier_mappings"'::regclass) then
    alter table "supplier_mappings" add constraint "supplier_mappings_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watch_alerts_favourite_id_fkey' and conrelid = '"watch_alerts"'::regclass) then
    alter table "watch_alerts" add constraint "watch_alerts_favourite_id_fkey" FOREIGN KEY (favourite_id) REFERENCES favourites(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watch_alerts_run_id_fkey' and conrelid = '"watch_alerts"'::regclass) then
    alter table "watch_alerts" add constraint "watch_alerts_run_id_fkey" FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'watchlist_product_id_fkey' and conrelid = '"watchlist"'::regclass) then
    alter table "watchlist" add constraint "watchlist_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  end if;
end $$;

-- @section indexes
CREATE INDEX IF NOT EXISTS ads_campaigns_asin ON ads_campaigns USING btree (asin);
CREATE INDEX IF NOT EXISTS ads_campaigns_name ON ads_campaigns USING btree (lower(name));
CREATE INDEX IF NOT EXISTS ads_keywords_campaign ON ads_keywords USING btree (campaign);
CREATE INDEX IF NOT EXISTS ads_product_ads_asin ON ads_product_ads USING btree (asin);
CREATE INDEX IF NOT EXISTS ads_proposals_batch ON ads_proposals USING btree (batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS ads_proposals_one_open ON ads_proposals USING btree (rule, entity_key) WHERE (status = ANY (ARRAY['open'::text, 'approved'::text]));
CREATE INDEX IF NOT EXISTS ads_proposals_status ON ads_proposals USING btree (status);
CREATE INDEX IF NOT EXISTS amazon_inventory_asin ON amazon_inventory USING btree (asin);
CREATE INDEX IF NOT EXISTS amazon_sales_day ON amazon_sales USING btree (day);
CREATE INDEX IF NOT EXISTS auth_failures_blocked ON auth_failures USING btree (blocked_until) WHERE (blocked_until IS NOT NULL);
CREATE INDEX IF NOT EXISTS brand_products_brand_idx ON brand_products USING btree (brand_key);
CREATE INDEX IF NOT EXISTS brand_products_verdict ON brand_products USING btree (brand_key, verdict);
CREATE INDEX IF NOT EXISTS documents_brand_keys ON documents USING gin (brand_keys);
CREATE INDEX IF NOT EXISTS documents_supplier ON documents USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS favourites_created ON favourites USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS favourites_ean_asin_key ON favourites USING btree (ean, asin) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS gate_overrides_key ON gate_overrides USING btree (ean, COALESCE(asin, ''::text), gate);
CREATE INDEX IF NOT EXISTS keepa_sellers_scanned_idx ON keepa_sellers USING btree (last_scan_at DESC) WHERE (storefront_fetched_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS keepa_snapshots_asin_fetched_idx ON keepa_snapshots USING btree (asin, fetched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS offers_one_manual ON offers USING btree (product_id) WHERE manual;
CREATE INDEX IF NOT EXISTS offers_product_idx ON offers USING btree (product_id);
CREATE INDEX IF NOT EXISTS offers_seen ON offers USING btree (supplier_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS offers_supplier_idx ON offers USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS pl_candidate_asins_asin ON pl_candidate_asins USING btree (asin, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS pl_category_tree_root ON pl_category_tree USING btree (root_id);
CREATE UNIQUE INDEX IF NOT EXISTS pl_gate_waivers_key ON pl_gate_waivers USING btree (candidate_id, gate_id, COALESCE(check_label, ''::text));
CREATE INDEX IF NOT EXISTS pl_poe_snapshots_candidate ON pl_poe_snapshots USING btree (candidate_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS products_asin_idx ON products USING btree (asin);
CREATE INDEX IF NOT EXISTS products_ean ON products USING btree (ean);
CREATE UNIQUE INDEX IF NOT EXISTS products_ean_asin_key ON products USING btree (ean, COALESCE(asin, ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_default ON profiles USING btree (is_default) WHERE is_default;
CREATE INDEX IF NOT EXISTS purchases_asin ON purchases USING btree (asin);
CREATE INDEX IF NOT EXISTS purchases_status ON purchases USING btree (status);
CREATE INDEX IF NOT EXISTS qogita_pulls_preset_idx ON qogita_pulls USING btree (preset_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rate_cards_one_active ON rate_cards USING btree (is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS results_offer ON results USING btree (offer_id);
CREATE INDEX IF NOT EXISTS results_pending_idx ON results USING btree (run_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS results_product ON results USING btree (product_id);
CREATE INDEX IF NOT EXISTS results_run_idx ON results USING btree (run_id, status);
CREATE INDEX IF NOT EXISTS results_run_score ON results USING btree (run_id, score DESC NULLS LAST, id);
CREATE INDEX IF NOT EXISTS results_run_updated ON results USING btree (run_id, updated_at);
CREATE INDEX IF NOT EXISTS results_run_verdict_score ON results USING btree (run_id, verdict, score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS results_updated ON results USING btree (updated_at) WHERE (status = 'done'::text);
CREATE INDEX IF NOT EXISTS supplier_mappings_fingerprint_idx ON supplier_mappings USING btree (header_fingerprint);
CREATE INDEX IF NOT EXISTS watch_alerts_open_idx ON watch_alerts USING btree (created_at DESC) WHERE (dismissed_at IS NULL);
CREATE INDEX IF NOT EXISTS watchlist_product_idx ON watchlist USING btree (product_id);

-- @section functions
CREATE OR REPLACE FUNCTION record_auth_failure(p_ip text, p_max integer, p_window interval, p_block interval)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r auth_failures;
begin
  insert into auth_failures as a (ip, failures, first_at) values (p_ip, 1, now())
  on conflict (ip) do update set
    failures = case when a.first_at < now() - p_window then 1 else a.failures + 1 end,
    first_at = case when a.first_at < now() - p_window then now() else a.first_at end
  returning * into r;
  if r.failures >= p_max then
    update auth_failures set blocked_until = now() + p_block, failures = 0, first_at = now() where ip = p_ip
    returning * into r;
  end if;
  return r.blocked_until;
end $function$;

CREATE OR REPLACE FUNCTION refresh_run_keepa(p_run uuid, p_older_than timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n integer;
begin
  update results x
  set status = 'pending',
      inputs = jsonb_set(jsonb_set(x.inputs, '{stage}', '"priced"'), '{market,hasHistory}', 'false'),
      updated_at = now()
  from products p
  where x.run_id = p_run
    and p.id = x.product_id
    and p.asin is not null
    and x.status in ('done', 'error')
    and (x.inputs -> 'market' ->> 'hasHistory') = 'true'
    and not exists (
      select 1 from keepa_snapshots k where k.asin = p.asin and k.fetched_at >= p_older_than
    );
  get diagnostics n = row_count;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION results_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION run_summaries(run_ids uuid[])
 RETURNS TABLE(run_id uuid, pass integer, warn integer, fail integer, error integer, pending integer, suppliers text[], newest_keepa timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with x as (
    select r.run_id, r.status, r.verdict, r.offer_id, r.product_id from results r where r.run_id = any(run_ids)
  ),
  counts as (
    select run_id,
      count(*) filter (where status = 'done' and verdict = 'pass')::int pass,
      count(*) filter (where status = 'done' and verdict = 'warn')::int warn,
      count(*) filter (where status = 'done' and verdict = 'fail')::int fail,
      count(*) filter (where status = 'error')::int error,
      count(*) filter (where status = 'pending')::int pending
    from x group by run_id
  ),
  sup as (
    select x.run_id, array_agg(distinct s.name) names
    from x join offers o on o.id = x.offer_id join suppliers s on s.id = o.supplier_id group by x.run_id
  ),
  newest as (select asin, max(fetched_at) at from keepa_snapshots group by asin),
  keepa as (
    select x.run_id, max(n.at) at from x join products p on p.id = x.product_id join newest n on n.asin = p.asin group by x.run_id
  )
  select r.id, coalesce(c.pass, 0), coalesce(c.warn, 0), coalesce(c.fail, 0), coalesce(c.error, 0), coalesce(c.pending, 0),
    coalesce(s.names, '{}'), k.at
  from runs r
  left join counts c on c.run_id = r.id
  left join sup s on s.run_id = r.id
  left join keepa k on k.run_id = r.id
  where r.id = any(run_ids);
$function$;

CREATE OR REPLACE FUNCTION supplier_stats(ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(supplier_id uuid, runs integer, products integer, pass integer, warn integer, brands jsonb, last_seen timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with o as (
    select id, product_id, supplier_id, seen_at from offers where ids is null or supplier_id = any(ids)
  ),
  prod as (select distinct supplier_id, product_id from o),
  verdicts as (
    select p.supplier_id,
      count(*) filter (where bp.priced and bp.verdict = 'pass')::int pass,
      count(*) filter (where bp.priced and bp.verdict = 'warn')::int warn
    from prod p join brand_products bp on bp.product_id = p.product_id group by 1
  ),
  brand_counts as (
    select supplier_id, jsonb_agg(jsonb_build_object('brand', brand, 'count', n) order by n desc, brand) brands
    from (
      select p.supplier_id, bp.brand, count(*)::int n from prod p join brand_products bp on bp.product_id = p.product_id
      where bp.brand is not null and bp.brand <> 'Unknown brand' group by 1, 2
    ) x group by 1
  ),
  run_counts as (select o.supplier_id, count(distinct r.run_id)::int runs from o join results r on r.offer_id = o.id group by 1),
  base as (select supplier_id, count(distinct product_id)::int products, max(seen_at) last_seen from o group by 1)
  select b.supplier_id, coalesce(rc.runs, 0), b.products, coalesce(v.pass, 0), coalesce(v.warn, 0), coalesce(bc.brands, '[]'::jsonb), b.last_seen
  from base b
  left join run_counts rc on rc.supplier_id = b.supplier_id
  left join verdicts v on v.supplier_id = b.supplier_id
  left join brand_counts bc on bc.supplier_id = b.supplier_id
$function$;

CREATE OR REPLACE FUNCTION wholesale_scout_watchdog()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  u text;
  s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'watchdog_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'watchdog_secret';
  if u is null or s is null then
    return;
  end if;
  perform net.http_get(
    url := u,
    headers := jsonb_build_object('Authorization', 'Bearer ' || s),
    timeout_milliseconds := 10000
  );
end;
$function$;

-- @section triggers
drop trigger if exists "results_touch" on "results";
CREATE TRIGGER results_touch BEFORE UPDATE ON results FOR EACH ROW EXECUTE FUNCTION results_touch();

-- @section grants
revoke all on function "record_auth_failure"(p_ip text, p_max integer, p_window interval, p_block interval) from public, anon, authenticated;
revoke all on function "supplier_stats"(ids uuid[]) from public, anon, authenticated;
revoke all on function "wholesale_scout_watchdog"() from public, anon, authenticated;
revoke all on function "run_summaries"(run_ids uuid[]) from public, anon, authenticated;
revoke all on function "refresh_run_keepa"(p_run uuid, p_older_than timestamp with time zone) from public, anon, authenticated;
revoke all on function "results_touch"() from public, anon, authenticated;

-- @section supabase
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
select cron.unschedule(jobid) from cron.job where jobname = 'wholesale-scout-watchdog';
select cron.schedule('wholesale-scout-watchdog', '* * * * *', $cmd$select public.wholesale_scout_watchdog()$cmd$);

-- @section migrations
insert into schema_migrations (name) values ('20260925000000_init.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000000_results_inputs.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000100_gating_approval_warn.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000200_brand_approvals.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000300_keepa_extended.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000400_background_processing.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000500_run_names.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000600_filter_sets.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000700_favourites.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000800_gate_overrides.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926000900_product_images.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260926001000_run_stats.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000000_qogita.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000100_watchdog.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000200_runs_list.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000300_pause_keepa_turns.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000400_multipacks.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000500_amazon_hazmat.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000600_asin_checks.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000700_favourites_upsert.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000800_seller_scans.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927000900_brand_map.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001000_ip_risk.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001100_watchlist.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001200_supplier_ledger.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001300_plan_inputs.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001400_extension.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001500_dg_lookup.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001600_hunt.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001700_documents.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001800_speed.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927001900_run_summaries_fast.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002000_auth_failures.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002100_purchases.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002200_amazon_sync.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002300_medical_device.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002400_medical_keywords.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002500_cost_override.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002600_manual_offer_mov.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20260927002700_private_label.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261001000000_enable_rls_all.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261001000100_revoke_public_execute.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261001000200_seller_storefront_floor.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261001000300_pl_settings_no_q4.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261001000400_pin_search_path.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261001000500_pl_gate_waivers.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000000_poe_derived.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000100_poe_growth_windows.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000200_niche_hunt.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000300_hunt_leaf_category.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000400_niche_hunt_leaves.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000500_ads_settings.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000600_ads_phase1.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000700_ads_upsert_keys.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000800_ads_bulk.sql') on conflict do nothing;
insert into schema_migrations (name) values ('20261002000900_ads_rules_proposals.sql') on conflict do nothing;
