-- Ads, phase 2: rules (thresholds, on/off, mode), the proposals they raise, and the bulk-sheet
-- batches approved proposals are exported in. Plus each keyword's performance per imported range
-- (Revive needs lifetime orders and the last 14 days).

create table if not exists ads_rules (
  rule text primary key,
  enabled boolean not null default true,
  mode text not null default 'propose' check (mode in ('propose', 'auto')),
  thresholds jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists ads_export_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now(),
  -- When you uploaded the sheet in Amazon Ads: the same changes aren't proposed again for 30 days.
  uploaded_at timestamptz,
  proposals integer not null default 0,
  rows integer not null default 0,
  -- The bulk changes as exported, so the file downloads the same every time.
  changes jsonb not null default '[]'
);

create table if not exists ads_proposals (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  -- The entity the rule is about (keyword, search term in a campaign, placement…): one open
  -- proposal per rule and key.
  entity_key text not null,
  asin text,
  campaign uuid references ads_campaigns(id) on delete cascade,
  campaign_name text,
  campaign_state text,
  entity jsonb not null,
  current_value text,
  proposed_value text,
  reason text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  effect text,
  changes jsonb not null,
  grp text,
  clicks integer not null default 0,
  orders integer not null default 0,
  status text not null default 'open' check (status in ('open', 'approved', 'skipped', 'snoozed', 'exported', 'uploaded')),
  -- Skipped (30 days) or snoozed (14): not raised again until then.
  hold_until timestamptz,
  batch_id uuid references ads_export_batches(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ads_proposals_one_open on ads_proposals (rule, entity_key) where status in ('open', 'approved');
create index if not exists ads_proposals_status on ads_proposals (status);
create index if not exists ads_proposals_batch on ads_proposals (batch_id);

create table if not exists ads_keyword_ranges (
  keyword_id text not null,
  date_from date not null,
  date_to date not null,
  impressions integer, clicks integer not null default 0, cost numeric not null default 0,
  orders integer not null default 0, sales numeric not null default 0, units integer,
  import_id uuid references ads_imports(id) on delete cascade,
  primary key (keyword_id, date_from, date_to)
);
-- The keywords imported before this table: their latest range.
insert into ads_keyword_ranges (keyword_id, date_from, date_to, impressions, clicks, cost, orders, sales, units, import_id)
select keyword_id, date_from, date_to, impressions, clicks, cost, orders, sales, units, import_id from ads_keywords
where date_from is not null and date_to is not null
on conflict do nothing;

alter table ads_rules enable row level security;
alter table ads_export_batches enable row level security;
alter table ads_proposals enable row level security;
alter table ads_keyword_ranges enable row level security;
revoke all on table ads_rules, ads_export_batches, ads_proposals, ads_keyword_ranges from anon, authenticated;
