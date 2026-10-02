-- Ads, phase 4: the research layer on the Anthropic API. Every call is logged with its tokens and
-- cost; a result is reused while the data it was asked about is unchanged (same data_hash).

create table if not exists ads_ai_calls (
  id uuid primary key default gen_random_uuid(),
  -- explain (a product), review (a month), targets (a product).
  feature text not null check (feature in ('explain', 'review', 'targets')),
  -- The ASIN, or the month (YYYY-MM).
  subject text not null,
  -- A hash of the context sent: the same data asks nothing new.
  data_hash text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric not null default 0,
  cost_gbp numeric not null default 0,
  -- Who asked: a click, or the monthly schedule you turned on.
  trigger text not null default 'user' check (trigger in ('user', 'schedule')),
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ads_ai_calls_subject on ads_ai_calls (feature, subject, created_at desc);

-- Text settings for the research layer: the model, its prices, the schedule.
create table if not exists ads_ai_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table ads_ai_calls enable row level security;
alter table ads_ai_settings enable row level security;
revoke all on table ads_ai_calls, ads_ai_settings from anon, authenticated;
